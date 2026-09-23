"use client"

import {
  CRITICAL_THRESHOLD,
  DIRECTION_LABELS,
  INDICATORS,
  INDICATOR_META,
  type Direction,
} from "@/lib/domain/city"
import type { DistrictBreakdown, ScenarioBreakdown } from "@/lib/engine/score"
import { cn, fmtDelta } from "@/lib/utils"

/**
 * Карта слабых мест: пять направлений против пяти районов.
 *
 * Задача — за один взгляд показать, где городу больнее всего, ДО того как
 * человек начнёт выбирать меры. Десять показателей для этого слишком дробны,
 * поэтому они свёрнуты в направления тем же весом, которым считается балл.
 */

const DIRECTION_ORDER: Direction[] = ["transport", "eco", "social", "safety", "service"]

/** Показатели направления и суммарный вес — нужен, чтобы свернуть их в одно число. */
const GROUPS = DIRECTION_ORDER.map((direction) => {
  const keys = INDICATORS.filter((key) => INDICATOR_META[key].direction === direction)
  return {
    direction,
    keys,
    weight: keys.reduce((sum, key) => sum + INDICATOR_META[key].weight, 0),
  }
})

interface Cell {
  value: number
  delta: number
  critical: boolean
}

function cellFor(district: DistrictBreakdown, group: (typeof GROUPS)[number]): Cell {
  let after = 0
  let before = 0
  let critical = false

  for (const key of group.keys) {
    const indicator = district.indicators.find((item) => item.key === key)!
    const weight = INDICATOR_META[key].weight
    after += weight * indicator.after
    before += weight * indicator.before
    if (indicator.critical) critical = true
  }

  return {
    value: after / group.weight,
    delta: (after - before) / group.weight,
    critical,
  }
}

/**
 * Заливка по величине: чем хуже, тем заметнее. Слабое должно бросаться в глаза,
 * сильное — молчать, поэтому у верхних значений фона нет вовсе.
 */
function tone(cell: Cell): string {
  if (cell.critical) return "bg-loss/15 text-loss"
  if (cell.value < 50) return "bg-warn/30 text-foreground"
  if (cell.value < 60) return "bg-warn/12 text-foreground"
  // Выше шестидесяти проблемы нет — и заливки тоже: пусть фон молчит,
  // иначе сильные районы спорят за внимание со слабыми.
  return "bg-panel-raised/60 text-muted"
}

export function DistrictMatrix({ breakdown }: { breakdown: ScenarioBreakdown }) {
  return (
    <section aria-labelledby="matrix-title" className="rounded-2xl border border-line bg-panel p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="matrix-title" className="text-sm font-semibold">
            Где городу больнее всего
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Направления свёрнуты по весам из формулы. Красное — показатель ниже{" "}
            {CRITICAL_THRESHOLD}, он штрафует балл.
          </p>
        </div>
        <span className="rounded-full bg-panel-raised px-2.5 py-1 text-[11px] text-muted">
          Слабейший район весит 30% итога
        </span>
      </div>

      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Матрица районов с горизонтальной прокруткой">
        <table className="w-full min-w-[520px] border-separate border-spacing-1 text-sm">
          <caption className="sr-only">
            Оценка каждого направления в каждом районе после принятых решений
          </caption>
          <thead>
            <tr className="text-muted">
              <th scope="col" className="w-[132px] px-1 pb-1 text-left text-xs font-medium">
                Направление
              </th>
              {breakdown.districts.map((district) => (
                <th key={district.id} scope="col" className="px-1 pb-1 text-center text-xs font-medium">
                  <span className="block truncate">{district.name}</span>
                  {district.isWeakest && (
                    <span className="mt-0.5 block text-[10px] font-semibold text-warn">слабейший</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((group) => (
              <tr key={group.direction}>
                <th scope="row" className="px-1 text-left text-xs font-medium text-muted">
                  {DIRECTION_LABELS[group.direction]}
                </th>
                {breakdown.districts.map((district) => {
                  const cell = cellFor(district, group)
                  return (
                    <td key={district.id} className="p-0">
                      <div
                        className={cn("rounded-lg px-2 py-2 text-center transition", tone(cell))}
                        title={`${district.name} · ${DIRECTION_LABELS[group.direction]}: ${cell.value.toFixed(1)}${
                          cell.critical ? " — есть показатель ниже 40" : ""
                        }`}
                      >
                        <span className="block text-sm font-semibold tabular">
                          {Math.round(cell.value)}
                        </span>
                        {Math.abs(cell.delta) >= 0.05 && (
                          <span
                            className={cn(
                              "block text-[10px] leading-tight tabular",
                              cell.delta > 0 ? "text-gain" : "text-loss",
                            )}
                          >
                            {fmtDelta(cell.delta, 1)}
                          </span>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
