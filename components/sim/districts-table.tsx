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
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Как меняются районы</h2>
          <p className="mt-1 text-xs text-muted">Значения после решений и их изменение к базе</p>
        </div>
        <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
          Шкала 0–100
        </span>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-panel shadow-sm" tabIndex={0} role="region" aria-label="Таблица районов с горизонтальной прокруткой">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <caption className="sr-only">
            Значения десяти показателей по пяти районам до и после принятых решений
          </caption>
          <thead>
            <tr className="border-b border-line bg-panel-raised/70 text-left text-muted">
              <th scope="col" className="sticky left-0 z-10 bg-panel-raised px-4 py-3.5 font-medium">
                Район
              </th>
              <th scope="col" className="px-4 py-3.5 text-right font-medium">
                Оценка D
              </th>
              {INDICATORS.map((indicator) => (
                <th
                  key={indicator}
                  scope="col"
                  className="px-3 py-3.5 text-right text-xs font-medium"
                  title={`${INDICATOR_META[indicator].label}. ${INDICATOR_META[indicator].hint}`}
                >
                  <abbr className="cursor-help no-underline" title={INDICATOR_META[indicator].label}>
                    {indicator}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {breakdown.districts.map((district) => (
              <tr key={district.id} className="group border-b border-line/70 transition last:border-0 hover:bg-accent-soft/40">
                <th scope="row" className="sticky left-0 z-10 bg-panel px-4 py-4 text-left font-medium group-hover:bg-panel-raised">
                  <span className="flex items-center gap-2">
                    {district.name}
                    {district.isWeakest && (
                      <span className="rounded-full bg-warn/10 px-2 py-0.5 text-[10px] font-semibold text-warn">
                        Слабейший
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-xs font-normal text-muted">
                    {Math.round(district.population * 100)}% населения
                  </span>
                </th>
                <td className="px-4 py-4 text-right tabular">
                  <span className="font-semibold text-foreground">{fmt(district.after)}</span>
                  {district.delta !== 0 && (
                    <span className={cn("mt-1 block text-xs", district.delta > 0 ? "text-gain" : "text-loss")}>
                      {fmtDelta(district.delta)}
                    </span>
                  )}
                </td>
                {district.indicators.map((indicator) => (
                  <td
                    key={indicator.key}
                    className={cn(
                      "px-3 py-4 text-right tabular",
                      indicator.critical && "bg-loss/5 text-loss",
                    )}
                    title={`${indicator.label}: было ${fmt(indicator.before, 1)}, стало ${fmt(indicator.after, 1)}`}
                  >
                    <span className={cn(indicator.delta !== 0 && "font-semibold")}>
                      {fmt(indicator.after, 0)}
                    </span>
                    {indicator.delta !== 0 && (
                      <span
                        className={cn(
                          "mt-1 block text-[11px] leading-tight",
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
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Красным — значения ниже 40: каждое такое снимает один балл с итога. Шкала всех
        показателей 0–100, больше — лучше.
      </p>
    </section>
  )
}
