/**
 * Агент-советник.
 *
 * Модель не считает балл и не перебирает сценарии — она вызывает инструменты,
 * за которыми стоит тот же детерминированный движок, что и в интерфейсе.
 * Перебор 700 тысяч вариантов делает solve() за пару секунд процессорного
 * времени, а не за токены; модель только выбирает, что именно спросить у движка,
 * и переводит ответ на человеческий язык.
 */

import {
  BUDGET,
  DECISION_COUNT,
  DIRECTION_LABELS,
  DISTRICTS,
  MEASURES,
  type Decision,
} from "@/lib/domain/city"
import { attribute } from "@/lib/engine/attribution"
import { scoreScenario } from "@/lib/engine/score"
import { solve } from "@/lib/engine/solver"
import { validateScenario } from "@/lib/engine/validate"
import { chatCompletion, isAiConfigured, type ChatMessage, type ToolDefinition } from "@/lib/ai/provider"
import { decisionsSchema } from "@/lib/ai/schema"

const decisionsParameter = {
  type: "array",
  description: "Набор решений. Для мер типа «район» districtId обязателен, для городских — null.",
  items: {
    type: "object",
    properties: {
      measureId: { type: "string", enum: MEASURES.map((m) => m.id) },
      districtId: { type: ["string", "null"], enum: [...DISTRICTS.map((d) => d.id), null] },
    },
    required: ["measureId", "districtId"],
  },
}

const TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "score_scenario",
      description:
        "Посчитать Astana Quality of Life Score для набора решений. Возвращает балл, прирост к базе, оценки районов, критические показатели и вклад каждой меры.",
      parameters: {
        type: "object",
        properties: { decisions: decisionsParameter },
        required: ["decisions"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "validate_scenario",
      description:
        "Проверить набор решений на соответствие правилам. Возвращает список нарушений с причинами или пустой список.",
      parameters: {
        type: "object",
        properties: { decisions: decisionsParameter },
        required: ["decisions"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "optimize",
      description:
        "Найти лучшие возможные сценарии полным перебором при заданных ограничениях. Используй это вместо собственных догадок о том, какой набор сильнее.",
      parameters: {
        type: "object",
        properties: {
          budget: { type: "number", description: `Потолок расходов, по умолчанию ${BUDGET}.` },
          include: { ...decisionsParameter, description: "Решения, которые обязаны войти в сценарий." },
          exclude: {
            type: "array",
            description: "Мероприятия, которые запрещено использовать.",
            items: { type: "string", enum: MEASURES.map((m) => m.id) },
          },
          limit: { type: "number", description: "Сколько лучших вариантов вернуть, максимум 5." },
        },
      },
    },
  },
]

interface ToolOutcome {
  name: string
  summary: string
}

function runTool(name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case "score_scenario": {
      const decisions = decisionsSchema.parse(args.decisions) as Decision[]
      const violations = validateScenario(decisions)
      if (violations.length) return { valid: false, violations: violations.map((v) => v.message) }
      const breakdown = scoreScenario(decisions)
      return {
        valid: true,
        score: breakdown.score,
        delta: breakdown.delta,
        cost: breakdown.cost,
        cityAverage: breakdown.dAvg,
        weakest: breakdown.weakest,
        criticalPairs: breakdown.criticalPairs,
        synergies: breakdown.synergies,
        districts: breakdown.districts.map((d) => ({ name: d.name, score: d.after, delta: d.delta })),
        contributions: attribute(decisions),
      }
    }
    case "validate_scenario": {
      const decisions = decisionsSchema.parse(args.decisions) as Decision[]
      const violations = validateScenario(decisions)
      return violations.length ? { valid: false, violations: violations.map((v) => v.message) } : { valid: true }
    }
    case "optimize": {
      const results = solve({
        budget: typeof args.budget === "number" ? args.budget : undefined,
        include: args.include ? (decisionsSchema.parse(args.include) as Decision[]) : undefined,
        exclude: Array.isArray(args.exclude) ? (args.exclude as never[]) : undefined,
        limit: Math.min(typeof args.limit === "number" ? args.limit : 3, 5),
      })
      return results.map((result) => {
        const breakdown = scoreScenario(result.decisions)
        return {
          score: breakdown.score,
          delta: breakdown.delta,
          cost: breakdown.cost,
          decisions: breakdown.decisions.map((d) => `${d.measureName} — ${d.district} (${d.cost} ед.)`),
          raw: result.decisions,
          weakest: breakdown.weakest,
          criticalCount: breakdown.criticalCount,
        }
      })
    }
    default:
      return { error: `Неизвестный инструмент ${name}` }
  }
}

const SYSTEM = [
  "Ты советник акима в симуляторе управления городом.",
  `Правила: бюджет ${BUDGET} условных единиц, ровно ${DECISION_COUNT} решений, не больше двух мер по одному направлению, повторы запрещены.`,
  `Направления: ${Object.values(DIRECTION_LABELS).join(", ")}.`,
  `Районы: ${DISTRICTS.map((d) => `${d.name} (${d.id})`).join(", ")}.`,
  `Мероприятия: ${MEASURES.map((m) => `${m.id} — ${m.name}, ${m.cost} ед., лаг ${m.lag}`).join("; ")}.`,
  "Балл = 70% среднего по городу + 30% слабейшего района − 1 за каждый показатель ниже 40.",
  "Эффект меры срезается лагом: реализуется доля (8 − лаг)/8.",
  "",
  "КРИТИЧЕСКОЕ ПРАВИЛО: ты не считаешь числа сам. Любой балл, прирост или сравнение получай вызовом инструмента.",
  "Не называй ни одной цифры, которой нет в ответе инструмента. Если нужно сравнить два набора — посчитай оба через score_scenario.",
  "Если спрашивают «как улучшить» или «какой набор лучше» — вызови optimize, а не придумывай ответ.",
  "Отвечай по-русски, коротко и по делу: 3–6 предложений, без списков длиннее четырёх пунктов.",
].join("\n")

export interface AgentReply {
  reply: string
  /** Какие инструменты и с каким результатом вызывались — показываем пользователю. */
  trace: ToolOutcome[]
  /** Сценарий, который агент предлагает применить, если он его нашёл. */
  suggestion: Decision[] | null
}

const MAX_STEPS = 4

export async function askAgent(question: string, decisions: Decision[]): Promise<AgentReply> {
  if (!isAiConfigured()) {
    return {
      reply: "Агент не подключён: не задан ключ ИИ-провайдера. Балл и разбор при этом считаются как обычно.",
      trace: [],
      suggestion: null,
    }
  }

  const current = decisions.length
    ? `Текущий сценарий пользователя: ${JSON.stringify(decisions)}.`
    : "Пользователь пока не принял ни одного решения."

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `${current}\n\nВопрос: ${question}` },
  ]

  const trace: ToolOutcome[] = []
  let suggestion: Decision[] | null = null

  for (let step = 0; step < MAX_STEPS; step++) {
    const result = await chatCompletion(messages, { tools: TOOLS, maxTokens: 1_200, temperature: 0.2 })

    if (!result.toolCalls.length) {
      return { reply: result.content ?? "Не удалось сформулировать ответ.", trace, suggestion }
    }

    messages.push({ role: "assistant", content: result.content, tool_calls: result.toolCalls })

    for (const call of result.toolCalls) {
      let output: unknown
      try {
        const args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>
        output = runTool(call.function.name, args)
        if (call.function.name === "optimize" && Array.isArray(output) && output.length) {
          const first = output[0] as { raw?: Decision[] }
          if (first.raw) suggestion = first.raw
        }
      } catch (error) {
        // Кривые аргументы не роняют диалог: модель получает причину и пробует снова.
        output = { error: error instanceof Error ? error.message : "Не удалось выполнить инструмент" }
      }

      trace.push({ name: call.function.name, summary: describeOutcome(call.function.name, output) })
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(output) })
    }
  }

  return {
    reply: "Агент сделал слишком много шагов и не пришёл к ответу. Переформулируйте вопрос.",
    trace,
    suggestion,
  }
}

function describeOutcome(name: string, output: unknown): string {
  if (name === "optimize" && Array.isArray(output) && output.length) {
    const best = output[0] as { score?: number; cost?: number }
    return `перебор дал лучший балл ${best.score} при расходах ${best.cost}`
  }
  if (typeof output === "object" && output !== null) {
    const record = output as Record<string, unknown>
    if (record.valid === false) return `набор отклонён: ${(record.violations as string[])?.join("; ")}`
    if (typeof record.score === "number") return `балл ${record.score}, прирост ${record.delta}`
  }
  return "выполнено"
}
