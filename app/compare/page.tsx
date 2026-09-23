import type { Metadata } from "next"
import Link from "next/link"

import { DISTRICTS, MEASURE_BY_ID, type Decision } from "@/lib/domain/city"
import { decodeDecisions } from "@/lib/domain/encode"
import { EVENT_BY_ID } from "@/lib/domain/events"
import { attribute } from "@/lib/engine/attribution"
import { scoreScenario, type ScenarioBreakdown } from "@/lib/engine/score"
import { validateScenario } from "@/lib/engine/validate"
import { cn, fmt, fmtDelta } from "@/lib/utils"

import { CompareForm } from "@/components/sim/compare-form"
import { ComparisonAssistant } from "@/components/sim/comparison-assistant"

export const metadata: Metadata = {
  title: "Сравнение сценариев — Аким на 5 часов",
}

/**
 * Сравнение двух сценариев — например, наборов двух команд.
 *
 * Базы данных нет, поэтому сценарий целиком лежит в ссылке: командам достаточно
 * обменяться адресами. Расчёт детерминированный, так что у обеих сторон
 * получаются одинаковые числа — сравнивать можно без доверия друг к другу.
 */

interface Side {
  label: string
  code: string
  decisions: Decision[]
  breakdown: ScenarioBreakdown | null
  preview: ScenarioBreakdown
  error: string | null
}

function build(code: string | undefined, label: string, eventId: string | undefined): Side {
  const decisions = decodeDecisions(code)
  const violations = validateScenario(decisions)
  const event = eventId ? (EVENT_BY_ID.get(eventId) ?? null) : null
  const preview = scoreScenario(decisions, event)
  return {
    label,
    code: code ?? "",
    decisions,
    breakdown: violations.length ? null : preview,
    preview,
    error: code ? (violations[0]?.message ?? null) : null,
  }
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string; event?: string }>
}) {
  const params = await searchParams
  const left = build(params.a, "Сценарий A", params.event)
  const right = build(params.b, "Сценарий B", params.event)
  const both = left.breakdown && right.breakdown ? ([left.breakdown, right.breakdown] as const) : null

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 pb-28 sm:px-6">
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Сравнение сценариев</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Расчёт детерминированный, поэтому у обеих команд получаются одинаковые числа.
            Достаточно обменяться ссылками — сценарий целиком лежит в адресе страницы.
          </p>
        </div>
        <Link href="/" className="inline-flex min-h-11 shrink-0 items-center rounded-md text-sm text-accent underline underline-offset-4">
          ← В симулятор
        </Link>
      </div>

      <CompareForm initialA={params.a ?? ""} initialB={params.b ?? ""} />

      {both && (
        <>
          <section className="mt-6 grid gap-4 sm:grid-cols-2">
            {[left, right].map((side) => {
              const breakdown = side.breakdown!
              const other = side === left ? right.breakdown! : left.breakdown!
              const wins = breakdown.score > other.score
              const draw = breakdown.score === other.score
              return (
                <div
                  key={side.label}
                  className={cn(
                    "min-w-0 rounded-2xl border p-5 shadow-sm",
                    wins ? "border-gain/50 bg-gain/5" : "border-line bg-panel",
                  )}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                      {side.label}
                    </h2>
                    {!draw && (
                      <span className={cn("text-xs font-semibold", wins ? "text-gain" : "text-muted")}>
                        {wins ? "впереди" : `отстаёт на ${fmt(other.score - breakdown.score)}`}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-3xl font-bold tabular">{fmt(breakdown.score)}</p>
                  <p className="text-xs text-muted tabular">
                    {fmtDelta(breakdown.delta)} к базе · потрачено {breakdown.cost} ·
                    слабейший {breakdown.weakest.name} {fmt(breakdown.weakest.value)} ·
                    критических {breakdown.criticalCount}
                  </p>
                  <ul className="mt-3 space-y-1 text-sm">
                    {attribute(decodeDecisions(side.code))
                      .sort((a, b) => b.shapley - a.shapley)
                      .map((contribution) => (
                        <li key={contribution.measureId} className="flex justify-between gap-2">
                          <span className="min-w-0 break-words">
                            {contribution.measureName}
                            <span className="text-muted"> · {contribution.district}</span>
                          </span>
                          <span className="shrink-0 tabular text-muted">
                            {contribution.cost} / {fmtDelta(contribution.shapley)}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              )
            })}
          </section>

          <Difference left={left} right={right} />

          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
              Районы
            </h2>
            <div
              className="overflow-x-auto rounded-xl border border-line bg-panel p-3"
              role="region"
              aria-label="Сравнение оценок районов"
              tabIndex={0}
            >
              <table className="w-full min-w-[360px] border-collapse text-sm">
                <caption className="sr-only">Оценки районов в сценариях A и B и разница между ними</caption>
                <thead>
                  <tr className="border-b border-line text-left text-muted">
                    <th scope="col" className="py-1.5 font-medium">Район</th>
                    <th scope="col" className="py-1.5 text-right font-medium">A</th>
                    <th scope="col" className="py-1.5 text-right font-medium">B</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Разница</th>
                  </tr>
                </thead>
                <tbody>
                  {DISTRICTS.map((district) => {
                    const a = both[0].districts.find((d) => d.id === district.id)!
                    const b = both[1].districts.find((d) => d.id === district.id)!
                    const gap = Math.round((a.after - b.after) * 100) / 100
                    return (
                      <tr key={district.id} className="border-b border-line/50">
                        <th scope="row" className="py-1.5 text-left font-medium">{district.name}</th>
                        <td className="py-1.5 text-right tabular">{fmt(a.after)}</td>
                        <td className="py-1.5 text-right tabular">{fmt(b.after)}</td>
                        <td
                          className={cn(
                            "py-1.5 text-right tabular",
                            gap > 0 ? "text-gain" : gap < 0 ? "text-loss" : "text-muted",
                          )}
                        >
                          {gap === 0 ? "—" : fmtDelta(gap)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">
              Положительная разница означает, что в этом районе сильнее сценарий A.
            </p>
          </section>
        </>
      )}

      {(left.error || right.error) && (
        <p role="alert" className="mt-4 rounded-xl border border-loss/40 bg-loss/10 p-3 text-sm text-loss">
          {left.error ? `Сценарий A: ${left.error}. ` : ""}
          {right.error ? `Сценарий B: ${right.error}.` : ""}
        </p>
      )}
      <ComparisonAssistant
        scenarios={[
          {
            id: "a",
            label: left.label,
            decisions: left.decisions,
            breakdown: left.preview,
            complete: left.breakdown !== null,
          },
          {
            id: "b",
            label: right.label,
            decisions: right.decisions,
            breakdown: right.preview,
            complete: right.breakdown !== null,
          },
        ]}
      />
    </main>
  )
}

/** Что именно различается в наборах: общие меры не интересны, интересны расхождения. */
function Difference({ left, right }: { left: Side; right: Side }) {
  const a = decodeDecisions(left.code)
  const b = decodeDecisions(right.code)
  const key = (measureId: string, districtId: string | null) =>
    `${measureId}:${districtId ?? "city"}`

  const bKeys = new Set(b.map((d) => key(d.measureId, d.districtId)))
  const aKeys = new Set(a.map((d) => key(d.measureId, d.districtId)))

  const onlyA = a.filter((d) => !bKeys.has(key(d.measureId, d.districtId)))
  const onlyB = b.filter((d) => !aKeys.has(key(d.measureId, d.districtId)))
  const shared = a.filter((d) => bKeys.has(key(d.measureId, d.districtId)))

  const describe = (measureId: string, districtId: string | null) => {
    const measure = MEASURE_BY_ID.get(measureId as never)
    const district = DISTRICTS.find((d) => d.id === districtId)
    return `${measure?.name ?? measureId} — ${district?.name ?? "весь город"}`
  }

  if (!onlyA.length && !onlyB.length) {
    return (
      <p className="mt-6 rounded-md border border-line bg-panel p-3 text-sm text-muted">
        Наборы совпадают полностью.
      </p>
    )
  }

  return (
    <section className="mt-6 grid gap-4 sm:grid-cols-3">
      <div className="rounded-lg border border-line bg-panel p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Только у A</h3>
        <ul className="mt-1.5 space-y-1 text-sm">
          {onlyA.length ? (
            onlyA.map((d) => <li key={key(d.measureId, d.districtId)}>{describe(d.measureId, d.districtId)}</li>)
          ) : (
            <li className="text-muted">—</li>
          )}
        </ul>
      </div>
      <div className="rounded-lg border border-line bg-panel p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Общее</h3>
        <ul className="mt-1.5 space-y-1 text-sm">
          {shared.length ? (
            shared.map((d) => <li key={key(d.measureId, d.districtId)}>{describe(d.measureId, d.districtId)}</li>)
          ) : (
            <li className="text-muted">—</li>
          )}
        </ul>
      </div>
      <div className="rounded-lg border border-line bg-panel p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Только у B</h3>
        <ul className="mt-1.5 space-y-1 text-sm">
          {onlyB.length ? (
            onlyB.map((d) => <li key={key(d.measureId, d.districtId)}>{describe(d.measureId, d.districtId)}</li>)
          ) : (
            <li className="text-muted">—</li>
          )}
        </ul>
      </div>
    </section>
  )
}
