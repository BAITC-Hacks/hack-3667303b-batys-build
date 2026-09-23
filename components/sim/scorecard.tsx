"use client"

import { AlertTriangle, ArrowRight, CheckCircle2, Link2, TrendingUp } from "lucide-react"

import type { ScenarioBreakdown } from "@/lib/engine/score"
import type { Violation } from "@/lib/engine/validate"
import { cn, fmt, fmtDelta } from "@/lib/utils"

import { AnimatedNumber } from "@/components/ui/animated-number"
import { ScoreFormula } from "@/components/sim/score-formula"

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
    <div className="overflow-hidden rounded-2xl border border-accent/20 bg-panel shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-accent/10 bg-accent-soft px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <TrendingUp className="size-4 text-accent" aria-hidden />
          Качество жизни в Астане
        </h2>
        {!blocked && (
          <span className="rounded-full bg-panel px-2 py-1 text-[10px] font-semibold text-accent">
            {complete ? "Итог" : "Прогноз"}
          </span>
        )}
      </div>

      <div className="p-5">
        {blocked ? (
          <div className="rounded-xl border border-loss/20 bg-loss/5 p-4" role="status">
            <p className="flex items-center gap-2 text-sm font-medium text-loss">
              <AlertTriangle className="size-4" aria-hidden />
              Балл не считается
            </p>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
              {violations.map((violation, index) => (
                <li key={index}>{violation.message}</li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            {/* «Было → стало» вместо одинокого числа: без точки отсчёта балл
                ни о чём не говорит, а её глаз ищет в первую очередь. */}
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-2">
              <span className="text-2xl font-medium text-muted tabular">{fmt(breakdown.baseScore)}</span>
              <ArrowRight className="size-5 shrink-0 self-center text-muted" aria-hidden />
              <AnimatedNumber
                value={breakdown.score}
                format={(current) => fmt(current)}
                className="rounded text-5xl font-semibold tracking-tight text-foreground tabular"
              />
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-semibold tabular",
                  positive ? "bg-gain/10 text-gain" : breakdown.delta < 0 ? "bg-loss/10 text-loss" : "bg-panel-raised text-muted",
                )}
              >
                {fmtDelta(breakdown.delta)}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted">
              Слева — город без вмешательства, справа — с вашими решениями
            </p>

            <dl className="mt-5 divide-y divide-line rounded-xl bg-panel-raised/60 px-3.5 text-sm">
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
                label="Показателей ниже 40"
                value={`${breakdown.criticalBefore} → ${breakdown.criticalCount}`}
                hint="−1 балл за каждый"
                alert={breakdown.criticalCount > 0}
              />
            </dl>
          </>
        )}

        {breakdown.fixedCriticals.length > 0 && !blocked && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-gain/10 p-3 text-xs leading-relaxed text-gain">
            <CheckCircle2 className="mt-px size-3.5 shrink-0" aria-hidden />
            <span>
              Закрыты провалы:{" "}
              {breakdown.fixedCriticals.map((c) => `${c.indicator} в ${c.district}`).join(", ")}
            </span>
          </p>
        )}

        {breakdown.criticalPairs.length > 0 && !blocked && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-loss/5 p-3 text-xs leading-relaxed text-loss">
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
            <span>
              Ниже 40:{" "}
              {breakdown.criticalPairs.map((c) => `${c.indicator} в ${c.district} (${c.value})`).join(", ")}
            </span>
          </p>
        )}

        {breakdown.synergies.length > 0 && (
          <div className="mt-3 space-y-2 rounded-xl bg-accent-soft p-3">
            {breakdown.synergies.map((synergy) => (
              <p key={synergy.label} className="flex items-start gap-2 text-xs leading-relaxed text-accent">
                <Link2 className="mt-px size-3.5 shrink-0" aria-hidden />
                <span>
                  Синергия: {synergy.label} — {synergy.indicator} +{synergy.bonus} ({synergy.district})
                </span>
              </p>
            ))}
          </div>
        )}

        {!complete && !blocked && (
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Это предварительный результат. Выберите все пять решений, чтобы завершить сценарий.
          </p>
        )}

        <div className="mt-4">
          <ScoreFormula />
        </div>
      </div>
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
    <div className="flex items-center justify-between gap-3 py-3">
      <dt className="text-muted">
        <span className="block text-xs font-medium text-foreground">{label}</span>
        <span className="mt-0.5 block text-[11px]">{hint}</span>
      </dt>
      <dd className={cn("font-semibold tabular", alert && "text-loss")}>{value}</dd>
    </div>
  )
}
