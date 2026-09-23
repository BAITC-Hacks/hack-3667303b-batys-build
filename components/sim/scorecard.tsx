"use client"

import { AlertTriangle, CheckCircle2, Link2 } from "lucide-react"

import type { ScenarioBreakdown } from "@/lib/engine/score"
import type { Violation } from "@/lib/engine/validate"
import { cn, fmt, fmtDelta } from "@/lib/utils"

export function Scorecard({
  breakdown,
  complete,
  violations,
}: {
  breakdown: ScenarioBreakdown
  complete: boolean
  violations: Violation[]
}) {
  const blocked = violations.length > 0
  const positive = breakdown.delta > 0

  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        Astana Quality of Life Score
      </h2>

      {blocked ? (
        <div className="mt-3 rounded-md border border-loss/40 bg-loss/10 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-loss">
            <AlertTriangle className="size-4" aria-hidden />
            Балл не считается
          </p>
          <ul className="mt-1.5 space-y-1 text-xs text-muted">
            {violations.map((violation, index) => (
              <li key={index}>{violation.message}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <div className="mt-2 flex items-baseline gap-3">
            <span key={breakdown.score} className="score-pulse rounded text-4xl font-bold tabular">
              {fmt(breakdown.score)}
            </span>
            <span
              className={cn(
                "text-sm font-semibold tabular",
                positive ? "text-gain" : breakdown.delta < 0 ? "text-loss" : "text-muted",
              )}
            >
              {fmtDelta(breakdown.delta)} к базе
            </span>
          </div>
          <p className="mt-1 text-xs text-muted tabular">
            База без решений — {fmt(breakdown.baseScore)}
          </p>

          <dl className="mt-3 space-y-1.5 text-sm">
            <Row
              label="Город, средневзвешенно"
              value={fmt(breakdown.dAvg)}
              hint="вес 70%"
            />
            <Row
              label={`Слабейший район — ${breakdown.weakest.name}`}
              value={fmt(breakdown.weakest.value)}
              hint="вес 30%"
            />
            <Row
              label="Критические показатели"
              value={String(breakdown.criticalCount)}
              hint="−1 балл за каждый"
              alert={breakdown.criticalCount > 0}
            />
          </dl>
        </>
      )}

      {breakdown.fixedCriticals.length > 0 && !blocked && (
        <p className="mt-3 flex items-start gap-1.5 rounded-md bg-gain/10 p-2 text-xs text-gain">
          <CheckCircle2 className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            Закрыты провалы:{" "}
            {breakdown.fixedCriticals.map((c) => `${c.indicator} в ${c.district}`).join(", ")}
          </span>
        </p>
      )}

      {breakdown.criticalPairs.length > 0 && !blocked && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-loss/10 p-2 text-xs text-loss">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            Ниже 40:{" "}
            {breakdown.criticalPairs.map((c) => `${c.indicator} в ${c.district} (${c.value})`).join(", ")}
          </span>
        </p>
      )}

      {breakdown.synergies.length > 0 && (
        <div className="mt-2 space-y-1">
          {breakdown.synergies.map((synergy) => (
            <p key={synergy.label} className="flex items-start gap-1.5 text-xs text-accent">
              <Link2 className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>
                Синергия: {synergy.label} — {synergy.indicator} +{synergy.bonus} ({synergy.district})
              </span>
            </p>
          ))}
        </div>
      )}

      {!complete && !blocked && (
        <p className="mt-3 text-xs text-muted">
          Показан промежуточный расчёт. Сценарий засчитывается, когда принято все пять решений.
        </p>
      )}
    </div>
  )
}

function Row({
  label,
  value,
  hint,
  alert,
}: {
  label: string
  value: string
  hint: string
  alert?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted">
        {label} <span className="text-xs opacity-70">{hint}</span>
      </dt>
      <dd className={cn("font-semibold tabular", alert && "text-loss")}>{value}</dd>
    </div>
  )
}
