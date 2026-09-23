import Link from "next/link"

import { BUDGET } from "@/lib/domain/city"
import { decodeDecisions, encodeDecisions } from "@/lib/domain/encode"
import { EVENT_BY_ID } from "@/lib/domain/events"
import { attribute } from "@/lib/engine/attribution"
import { scoreScenario } from "@/lib/engine/score"
import { validateScenario } from "@/lib/engine/validate"
import { describeScenario } from "@/lib/ai/explain"
import { fmt, fmtDelta } from "@/lib/utils"

import { PrintButton } from "@/components/sim/print-button"

/**
 * Краткая презентация решения команды: одна страница, которую можно показать
 * на защите или отправить ссылкой. Разбор здесь детерминированный, без обращения
 * к модели, — страница открывается мгновенно и одинаково у всех.
 */
export default async function BriefPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; event?: string }>
}) {
  const params = await searchParams
  const decisions = decodeDecisions(params.s)
  const event = params.event ? (EVENT_BY_ID.get(params.event) ?? null) : null
  const violations = validateScenario(decisions)

  if (violations.length) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-xl font-semibold">Сценарий не собран</h1>
        <ul className="mt-3 space-y-1 text-sm text-muted">
          {violations.map((violation, index) => (
            <li key={index}>{violation.message}</li>
          ))}
        </ul>
        <Link href="/" className="mt-6 inline-block text-sm text-accent underline underline-offset-4">
          Вернуться в симулятор
        </Link>
      </main>
    )
  }

  const breakdown = scoreScenario(decisions, event)
  const contributions = attribute(decisions)
  const summary = describeScenario(breakdown, contributions)
  const ranked = [...contributions].sort((a, b) => b.shapley - a.shapley)

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex items-start justify-between gap-4 print:hidden">
        <Link href={`/?s=${encodeDecisions(decisions)}`} className="text-sm text-accent underline underline-offset-4">
          ← В симулятор
        </Link>
        <PrintButton />
      </div>

      <header className="border-b border-line pb-5">
        <p className="text-xs uppercase tracking-widest text-muted">Аким на 5 часов · разбор сценария</p>
        <h1 className="mt-2 text-3xl font-bold tabular">
          {fmt(breakdown.score)} балла
          <span className="ml-3 text-lg font-semibold text-muted">{fmtDelta(breakdown.delta)} к базе</span>
        </h1>
        <p className="mt-2 text-sm text-muted tabular">
          Израсходовано {breakdown.cost} из {BUDGET} единиц · среднее по городу {fmt(breakdown.dAvg)} ·
          слабейший район {breakdown.weakest.name} {fmt(breakdown.weakest.value)} ·
          критических показателей {breakdown.criticalCount}
        </p>
        {breakdown.event && (
          <p className="mt-2 rounded-md bg-warn/10 p-2 text-sm text-warn">
            Стресс-тест: {breakdown.event.name}. Балл просел на {fmtDelta(breakdown.event.impact)}.
          </p>
        )}
      </header>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Пять решений</h2>
        <table className="mt-2 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="py-1.5 font-medium">Мероприятие</th>
              <th className="py-1.5 font-medium">Где</th>
              <th className="py-1.5 text-right font-medium">Стоимость</th>
              <th className="py-1.5 text-right font-medium">Вклад</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((contribution) => (
              <tr key={contribution.measureId} className="border-b border-line/50">
                <td className="py-1.5">{contribution.measureName}</td>
                <td className="py-1.5 text-muted">{contribution.district}</td>
                <td className="py-1.5 text-right tabular">{contribution.cost}</td>
                <td className="py-1.5 text-right font-semibold tabular">{fmtDelta(contribution.shapley)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1.5 text-xs text-muted">
          Вклад посчитан по Шепли: усреднение по всем порядкам добавления, поэтому бонусы
          синергий распределены честно, а не достаются последней мере.
        </p>
      </section>

      <section className="mt-6 grid gap-5 sm:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold text-gain">Что сработало</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {summary.strengths.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-loss">Риски</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {summary.risks.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-6 rounded-md border border-line bg-panel p-3">
        <h2 className="text-sm font-semibold">Главный компромисс</h2>
        <p className="mt-1 text-sm text-muted">{summary.tradeoff}</p>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Районы</h2>
        <table className="mt-2 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="py-1.5 font-medium">Район</th>
              <th className="py-1.5 text-right font-medium">Было</th>
              <th className="py-1.5 text-right font-medium">Стало</th>
              <th className="py-1.5 text-right font-medium">Изменение</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.districts.map((district) => (
              <tr key={district.id} className="border-b border-line/50">
                <td className="py-1.5">
                  {district.name}
                  {district.isWeakest && <span className="ml-2 text-xs text-warn">слабейший</span>}
                </td>
                <td className="py-1.5 text-right tabular text-muted">{fmt(district.before)}</td>
                <td className="py-1.5 text-right tabular font-semibold">{fmt(district.after)}</td>
                <td className="py-1.5 text-right tabular">{fmtDelta(district.delta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="mt-8 border-t border-line pt-4 text-xs text-muted">
        Балл считает детерминированный движок по формуле из технического задания:
        0,7 × среднее по городу + 0,3 × слабейший район − 1 за каждый показатель ниже 40.
        Языковая модель в расчёте не участвует.
      </footer>
    </main>
  )
}
