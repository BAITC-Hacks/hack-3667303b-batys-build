"use client"

import { useState } from "react"
import { ArrowRight, Clock3, Link2, TriangleAlert } from "lucide-react"

import { DISTRICTS, HORIZON } from "@/lib/domain/city"
import type { Contribution } from "@/lib/engine/attribution"
import type { ScenarioBreakdown } from "@/lib/engine/score"
import { cn, fmt, fmtDelta } from "@/lib/utils"

/**
 * «Почему изменился балл» — мост между решением и числом.
 *
 * Показываем только сдвинувшиеся показатели: полная таблица 5 × 10 лежит
 * соседней вкладкой и нужна, когда человек уже понял принцип. Сначала —
 * что именно поменялось, потом — какая мера это сделала.
 *
 * Все числа приходят готовыми из движка. Здесь не считается ничего, кроме
 * группировки по районам.
 */

/** Сколько изменений показываем, пока не попросили раскрыть остальные. */
const PREVIEW = 8

export function ChangesPanel({
  breakdown,
  contributions,
}: {
  breakdown: ScenarioBreakdown
  contributions: Contribution[]
}) {
  const [showAll, setShowAll] = useState(false)
  const changes = breakdown.changedIndicators
  const shown = showAll ? changes : changes.slice(0, PREVIEW)

  // Группировка в порядке районов, а не в порядке величины сдвига: так глаз
  // читает «что стало с Нурой», а не прыгает между районами.
  const groups = DISTRICTS.map((district) => ({
    district,
    rows: shown.filter((change) => change.districtId === district.id),
  })).filter((group) => group.rows.length > 0)

  if (!changes.length) {
    return (
      <p className="rounded-2xl border border-dashed border-line bg-panel p-6 text-center text-sm text-muted">
        Пока ни один показатель не сдвинулся. Выберите меру — и здесь появится,
        что именно она изменила.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="changes-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="changes-title" className="text-base font-semibold">
              Почему изменился балл
            </h2>
            <p className="mt-1 text-xs text-muted">
              Значения показателей до и после ваших решений — с поправкой на лаг
            </p>
          </div>
          <CriticalBadge breakdown={breakdown} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map(({ district, rows }) => (
            <div key={district.id} className="rounded-2xl border border-line bg-panel p-4 shadow-sm">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">{district.name}</h3>
                <span className="text-[11px] text-muted tabular">
                  оценка {fmt(breakdown.districts.find((d) => d.id === district.id)!.after)}
                </span>
              </div>
              <ul className="space-y-2.5">
                {rows.map((row) => (
                  <li key={`${row.districtId}-${row.key}`}>
                    <p className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate text-muted">
                        <span className="tabular">{row.key}</span> · {row.label}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 font-semibold tabular",
                          row.delta > 0 ? "text-gain" : "text-loss",
                        )}
                      >
                        {fmtDelta(row.delta, 1)}
                      </span>
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted tabular">
                      {fmt(row.before, 1)}
                      <ArrowRight className="size-3" aria-hidden />
                      <span className={cn("font-medium", row.critical ? "text-loss" : "text-foreground")}>
                        {fmt(row.after, 1)}
                      </span>
                      {row.wasCritical && !row.critical && (
                        <span className="rounded-full bg-gain/10 px-1.5 text-[10px] font-semibold text-gain">
                          вышел из провала
                        </span>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {changes.length > PREVIEW && (
          <button
            type="button"
            onClick={() => setShowAll((current) => !current)}
            aria-expanded={showAll}
            className="mt-3 min-h-11 rounded-xl border border-line bg-panel px-4 py-2 text-xs font-medium text-accent transition hover:border-accent/50 hover:bg-accent-soft"
          >
            {showAll
              ? "Свернуть"
              : `Показать все изменения — ещё ${changes.length - PREVIEW}`}
          </button>
        )}
      </section>

      <Contributions breakdown={breakdown} contributions={contributions} />
    </div>
  )
}

/** Критические показатели «было → стало»: самая честная метрика провалов. */
function CriticalBadge({ breakdown }: { breakdown: ScenarioBreakdown }) {
  const fixed = breakdown.criticalBefore - breakdown.criticalCount
  return (
    <div
      className={cn(
        "rounded-xl border px-3.5 py-2",
        breakdown.criticalCount === 0
          ? "border-gain/30 bg-gain/5"
          : "border-loss/25 bg-loss/5",
      )}
    >
      <p className="text-[11px] font-medium text-muted">Показателей ниже 40</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold tabular">
        {breakdown.criticalBefore}
        <ArrowRight className="size-3.5 text-muted" aria-hidden />
        <span className={breakdown.criticalCount === 0 ? "text-gain" : "text-loss"}>
          {breakdown.criticalCount}
        </span>
        {fixed > 0 && (
          <span className="text-[11px] font-normal text-muted">
            · штраф меньше на {fixed}
          </span>
        )}
      </p>
    </div>
  )
}

/** Что сделала каждая мера: её показатели, лаг и вклад в балл. */
function Contributions({
  breakdown,
  contributions,
}: {
  breakdown: ScenarioBreakdown
  contributions: Contribution[]
}) {
  if (!breakdown.decisions.length) return null

  return (
    <section aria-labelledby="impact-title">
      <div className="mb-4">
        <h2 id="impact-title" className="text-base font-semibold">
          Вклад решений
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Вклад в балл посчитан по Шепли: мера оценивается во всех сочетаниях с
          остальными, поэтому сумма вкладов точно равна приросту без стресс-теста.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {breakdown.decisions.map((decision) => {
          const contribution = contributions.find((c) => c.measureId === decision.measureId)
          return (
            <article
              key={`${decision.measureId}-${decision.district}`}
              className="flex flex-col rounded-2xl border border-line bg-panel p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold leading-snug">{decision.measureName}</h3>
                  <p className="mt-0.5 text-[11px] text-muted tabular">
                    {decision.district} · {decision.cost} ед.
                  </p>
                </div>
                {contribution && (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold tabular",
                      contribution.shapley > 0 ? "bg-gain/10 text-gain" : "bg-panel-raised text-muted",
                    )}
                    title="Вклад в итоговый балл по Шепли"
                  >
                    {fmtDelta(contribution.shapley)}
                  </span>
                )}
              </div>

              <ul className="mt-3 space-y-2">
                {decision.effects.map((effect) => (
                  <li key={effect.key} className="text-xs">
                    <p className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-muted">
                        <span className="tabular">{effect.key}</span> · {effect.label}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 font-semibold tabular",
                          effect.realized > 0 ? "text-gain" : "text-loss",
                        )}
                      >
                        {fmtDelta(effect.realized, 1)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted tabular">
                      {effect.before !== null && effect.after !== null ? (
                        <>
                          {fmt(effect.before, 1)} → {fmt(effect.after, 1)}
                        </>
                      ) : (
                        "во всех районах"
                      )}
                      {" · по паспорту "}
                      {effect.full > 0 ? "+" : "−"}
                      {Math.abs(effect.full)}
                    </p>
                  </li>
                ))}
              </ul>

              {decision.synergies.map((synergy) => (
                <p
                  key={synergy.label}
                  className="mt-3 flex items-start gap-1.5 rounded-lg bg-accent-soft p-2 text-[11px] leading-relaxed text-accent"
                >
                  <Link2 className="mt-px size-3 shrink-0" aria-hidden />
                  <span>
                    Синергия «{synergy.label}»: {synergy.indicator} +{synergy.bonus} сверх эффекта мер
                  </span>
                </p>
              ))}

              <p className="mt-auto flex items-center gap-1.5 pt-3 text-[11px] text-muted tabular">
                <Clock3 className="size-3 shrink-0" aria-hidden />
                Лаг {decision.lag} кв. — за {HORIZON} кварталов успевает{" "}
                {Math.round(decision.realized * 100)}% эффекта
              </p>
            </article>
          )
        })}
      </div>

      {breakdown.criticalPairs.length > 0 && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-loss/20 bg-loss/5 p-3 text-xs leading-relaxed text-loss">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            Остались ниже 40:{" "}
            {breakdown.criticalPairs
              .map((pair) => `${pair.district} · ${pair.indicator} — ${fmt(pair.value, 1)}`)
              .join("; ")}
            . Каждый такой показатель снимает балл с итога.
          </span>
        </p>
      )}
    </section>
  )
}
