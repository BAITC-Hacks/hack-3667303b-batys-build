/**
 * Объяснение сценария.
 *
 * Правило из ТЗ: «числа модель не считает и не придумывает». Поэтому здесь
 * два слоя. Первый — describeScenario(): детерминированный разбор, собранный
 * из готового ScenarioBreakdown; он работает всегда, даже без ключа ИИ.
 * Второй — explainScenario(): та же фактура, пересказанная моделью человеческим
 * языком. Модель получает только посчитанные цифры и не может изменить ни одну.
 */

import { BUDGET, DECISION_COUNT, HORIZON } from "@/lib/domain/city"
import type { Contribution } from "@/lib/engine/attribution"
import type { ScenarioBreakdown } from "@/lib/engine/score"
import { chatCompletion, isAiConfigured } from "@/lib/ai/provider"

export interface Explanation {
  summary: string
  strengths: string[]
  risks: string[]
  tradeoff: string
  source: "ai" | "engine"
}

const fmt = (value: number, digits = 2) => value.toFixed(digits).replace(".", ",")

/** Детерминированный разбор: факты без языковой модели. */
export function describeScenario(
  breakdown: ScenarioBreakdown,
  contributions: Contribution[],
): Explanation {
  const ranked = [...contributions].sort((a, b) => b.shapley - a.shapley)
  const best = ranked[0]
  const worst = ranked[ranked.length - 1]
  const efficient = [...contributions].sort((a, b) => b.perUnit - a.perUnit)[0]

  const strengths: string[] = []
  const risks: string[] = []

  if (best) {
    strengths.push(
      `Больше всего дало «${best.measureName}» (${best.district}) — ${fmt(best.shapley)} балла из ${fmt(breakdown.delta)}.`,
    )
  }
  if (efficient && efficient.measureId !== best?.measureId) {
    strengths.push(
      `Самая выгодная по деньгам мера — «${efficient.measureName}»: ${fmt(efficient.perUnit, 3)} балла на единицу бюджета.`,
    )
  }
  if (breakdown.fixedCriticals.length) {
    strengths.push(
      `Закрыты критические провалы: ${breakdown.fixedCriticals.map((c) => `${c.indicator} в ${c.district}`).join(", ")}. Каждый снимал по баллу штрафа.`,
    )
  }
  for (const synergy of breakdown.synergies) {
    strengths.push(`Сработала синергия «${synergy.label}»: ${synergy.indicator} +${synergy.bonus} (${synergy.district}).`)
  }

  if (breakdown.criticalPairs.length) {
    risks.push(
      `Остались значения ниже 40: ${breakdown.criticalPairs.map((c) => `${c.indicator} в ${c.district} — ${fmt(c.value, 1)}`).join(", ")}. Это прямой штраф к баллу.`,
    )
  }
  risks.push(
    `Слабейший район — ${breakdown.weakest.name} с оценкой ${fmt(breakdown.weakest.value)}. Он тянет 30% итогового балла, и пока он внизу, средний результат по городу мало что решает.`,
  )
  const slow = breakdown.decisions.filter((d) => d.realized <= 0.5)
  if (slow.length) {
    risks.push(
      `Медленные меры: ${slow.map((d) => `«${d.measureName}» (лаг ${d.lag} кв., успевает на ${Math.round(d.realized * 100)}%)`).join(", ")}. За горизонт в ${HORIZON} кварталов они отдают меньше половины эффекта.`,
    )
  }
  if (breakdown.budgetLeft > 0) {
    risks.push(`Не израсходовано ${breakdown.budgetLeft} единиц бюджета — остаток не даёт никакого бонуса.`)
  }

  const tradeoff = worst
    ? `Главный компромисс: «${worst.measureName}» стоила ${worst.cost} единиц и принесла ${fmt(worst.shapley)} балла — эти деньги можно было направить в ${breakdown.weakest.name}.`
    : "Решения не приняты, компромиссов пока нет."

  return {
    summary: `Сценарий набрал ${fmt(breakdown.score)} балла против ${fmt(breakdown.baseScore)} без вмешательства — прирост ${fmt(breakdown.delta)}. Израсходовано ${breakdown.cost} из ${BUDGET} единиц.`,
    strengths,
    risks,
    tradeoff,
    source: "engine",
  }
}

const SYSTEM = [
  "Ты советник акима города: объясняешь управленцу последствия распределения городского бюджета.",
  "Тебе передают УЖЕ ПОСЧИТАННЫЙ разбор сценария в JSON. Все числа в нём окончательные.",
  "Категорически запрещено: считать, пересчитывать, округлять по-своему или выдумывать любые числа.",
  "Используй только те значения, которые есть во входном JSON, и цитируй их как есть.",
  "Пиши по-русски, деловым языком, без канцелярита и без маркетинговых оборотов.",
].join(" ")

/**
 * Пересказ разбора моделью. Три шлюза деградации: нет ключа, ответ не по
 * контракту, исключение — во всех трёх случаях возвращается детерминированный
 * разбор, так что вызывающий код всегда получает валидный объект.
 */
export async function explainScenario(
  breakdown: ScenarioBreakdown,
  contributions: Contribution[],
): Promise<Explanation> {
  const fallback = describeScenario(breakdown, contributions)
  if (!isAiConfigured()) return fallback
  if (breakdown.decisions.length !== DECISION_COUNT) return fallback

  const payload = {
    score: breakdown.score,
    baseScore: breakdown.baseScore,
    delta: breakdown.delta,
    cityAverage: breakdown.dAvg,
    weakestDistrict: breakdown.weakest,
    criticalCount: breakdown.criticalCount,
    criticalPairs: breakdown.criticalPairs,
    fixedCriticals: breakdown.fixedCriticals,
    cost: breakdown.cost,
    budgetLeft: breakdown.budgetLeft,
    synergies: breakdown.synergies,
    decisions: breakdown.decisions,
    contributions,
    districts: breakdown.districts.map((d) => ({
      name: d.name,
      score: d.after,
      delta: d.delta,
      populationShare: d.population,
      profile: d.profile,
    })),
  }

  const user = [
    "Разбор сценария:",
    JSON.stringify(payload),
    "",
    "Верни только JSON без markdown в таком виде:",
    '{"summary": "...", "strengths": ["..."], "risks": ["..."], "tradeoff": "..."}',
    "summary — 2–3 предложения про итог и цену решения.",
    "strengths — 2–4 пункта, что в сценарии сработало и почему.",
    "risks — 2–4 пункта: что осталось недоделанным и чем это грозит.",
    "tradeoff — одно предложение про главный компромисс: от чего отказались ради результата.",
    "Формула балла: 70% среднего по городу, 30% слабейшего района, минус один балл за каждый показатель ниже 40.",
    "Эффект меры срезается лагом: доля realized показывает, сколько успевает сработать за горизонт.",
  ].join("\n")

  try {
    const result = await chatCompletion(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      { maxTokens: 1_200, temperature: 0.3 },
    )
    const parsed = readExplanation(result.content)
    if (!parsed) {
      console.warn("[ai] ответ не по контракту, отдаём детерминированный разбор:", result.content?.slice(0, 300))
      return fallback
    }
    return { ...parsed, source: "ai" }
  } catch (error) {
    console.warn("[ai] объяснение осталось детерминированным:", error)
    return fallback
  }
}

/** Разбор ответа модели. Экспортирован отдельно, чтобы его можно было проверить тестом. */
export function readExplanation(text: string | null): Omit<Explanation, "source"> | null {
  if (!text) return null
  let parsed: unknown
  try {
    const start = text.search(/[[{]/)
    const end = Math.max(text.lastIndexOf("]"), text.lastIndexOf("}"))
    if (start === -1 || end <= start) return null
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
  const record = parsed as Record<string, unknown>

  const asList = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : []

  const summary = typeof record.summary === "string" ? record.summary : ""
  const tradeoff = typeof record.tradeoff === "string" ? record.tradeoff : ""
  const strengths = asList(record.strengths)
  const risks = asList(record.risks)

  if (summary.length < 20 || !strengths.length || !risks.length) return null
  return { summary, strengths, risks, tradeoff }
}
