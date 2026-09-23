"use client"

import { INDICATORS, INDICATOR_META } from "@/lib/domain/city"
import type { ScenarioBreakdown } from "@/lib/engine/score"
import { cn, fmt, fmtDelta } from "@/lib/utils"

/**
 * Таблица «район × показатель»: видно и абсолютное значение после решений,
 * и то, на сколько оно сдвинулось. Красным подсвечены значения ниже 40 —
 * именно они штрафуют итоговый балл.
 */
export function DistrictsTable({ breakdown }: { breakdown: ScenarioBreakdown }) {
  return (
    <section aria-label="Показатели районов">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        Районы после принятых решений
      </h2>
      <div className="overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <caption className="sr-only">
            Значения десяти показателей по пяти районам до и после принятых решений
          </caption>
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className="px-3 py-2 font-medium">
                Район
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Оценка D
              </th>
              {INDICATORS.map((indicator) => (
                <th
                  key={indicator}
                  scope="col"
                  className="px-2 py-2 text-right font-medium"
                  title={`${INDICATOR_META[indicator].label}. ${INDICATOR_META[indicator].hint}`}
                >
                  {indicator}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {breakdown.districts.map((district) => (
              <tr key={district.id} className="border-b border-line/60 last:border-0">
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  <span className="flex items-center gap-2">
                    {district.name}
                    {district.isWeakest && (
                      <span className="rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-warn">
                        слабейший
                      </span>
                    )}
                  </span>
                  <span className="text-xs font-normal text-muted">
                    {Math.round(district.population * 100)}% населения
                  </span>
                </th>
                <td className="px-3 py-2 text-right tabular">
                  <span className="font-semibold">{fmt(district.after)}</span>
                  {district.delta !== 0 && (
                    <span className={cn("ml-1.5 text-xs", district.delta > 0 ? "text-gain" : "text-loss")}>
                      {fmtDelta(district.delta)}
                    </span>
                  )}
                </td>
                {district.indicators.map((indicator) => (
                  <td
                    key={indicator.key}
                    className={cn(
                      "px-2 py-2 text-right tabular",
                      indicator.critical && "bg-loss/10 text-loss",
                    )}
                    title={`${indicator.label}: было ${fmt(indicator.before, 1)}, стало ${fmt(indicator.after, 1)}`}
                  >
                    <span className={cn(indicator.delta !== 0 && "font-semibold")}>
                      {fmt(indicator.after, 0)}
                    </span>
                    {indicator.delta !== 0 && (
                      <span
                        className={cn(
                          "block text-[10px] leading-tight",
                          indicator.delta > 0 ? "text-gain" : "text-loss",
                        )}
                      >
                        {fmtDelta(indicator.delta, 1)}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Красным — значения ниже 40: каждое такое снимает один балл с итога. Шкала всех
        показателей 0–100, больше — лучше.
      </p>
    </section>
  )
}
