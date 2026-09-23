import type { Metadata } from "next"
import Link from "next/link"

import { BUDGET } from "@/lib/domain/city"
import { decodeDecisions, encodeDecisions } from "@/lib/domain/encode"
import frontier from "@/lib/domain/frontier.json"
import { EVENT_BY_ID } from "@/lib/domain/events"
import { attribute } from "@/lib/engine/attribution"
import { scoreScenario } from "@/lib/engine/score"
import { validateScenario } from "@/lib/engine/validate"
import { describeScenario } from "@/lib/ai/explain"
import { fmt, fmtDelta } from "@/lib/utils"

import { AiAssistant } from "@/components/sim/ai-assistant"
import { PrintButton } from "@/components/sim/print-button"

export const metadata: Metadata = {
  title: "Разбор сценария — Аким на 5 часов",
}

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
  const breakdown = scoreScenario(decisions, event)

  if (violations.length) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 pb-28 print:pb-0">
        <h1 className="text-xl font-semibold">Сценарий не собран</h1>
        <ul className="mt-3 space-y-1 text-sm text-muted">
          {violations.map((violation, index) => (
            <li key={index}>{violation.message}</li>
          ))}
        </ul>
        <Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-md text-sm text-accent underline underline-offset-4">
          Вернуться в симулятор
        </Link>
        <AiAssistant
          decisions={decisions}
          breakdown={breakdown}
          complete={false}
          contextLabel="Разбор сценария"
        />
      </main>
    )
  }

  const contributions = attribute(decisions)
  const summary = describeScenario(breakdown, contributions)
  const ranked = [...contributions].sort((a, b) => b.shapley - a.shapley)

  // Потолок при том же бюджете: показывает, насколько близко набор к пределу
  // возможного, а не только к базе. Кривая посчитана полным перебором заранее.
  const reachable = frontier.points.filter((point) => point.budget >= breakdown.cost)
  const ceiling = reachable.length ? reachable[0] : frontier.points[frontier.points.length - 1]
  const gap = Math.round((ceiling.score - breakdown.score) * 100) / 100

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-28 sm:px-6 sm:py-10 sm:pb-28 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center print:hidden">
        <Link href={`/?s=${encodeDecisions(decisions)}`} className="inline-flex min-h-11 items-center rounded-md text-sm text-accent underline underline-offset-4">
          ← В симулятор
        </Link>
        <PrintButton />
      </div>

      <header className="appear border-b border-line pb-5">
        <p className="text-xs uppercase tracking-widest text-muted">Аким на 5 часов · разбор сценария</p>
        <h1 className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-3xl font-bold tabular">
          {fmt(breakdown.score)} балла
          <span className="text-lg font-semibold text-muted">{fmtDelta(breakdown.delta)} к базе</span>
        </h1>
        <p className="mt-2 text-sm text-muted tabular">
          Израсходовано {breakdown.cost} из {BUDGET} единиц · среднее по городу {fmt(breakdown.dAvg)} ·
          слабейший район {breakdown.weakest.name} {fmt(breakdown.weakest.value)} ·
          критических показателей {breakdown.criticalCount}
        </p>
        <p className="mt-2 text-sm text-muted">
          Потолок при бюджете {ceiling.budget} — {fmt(ceiling.score)} балла.{" "}
          {gap <= 0.01 ? (
            <span className="font-semibold text-gain">
              Этот сценарий на пределе возможного: лучше за эти деньги не собрать.
            </span>
          ) : (
            <>
              До него не хватает <span className="font-semibold tabular">{fmt(gap)}</span> — столько
              ещё можно выжать, не увеличивая расходы.
            </>
          )}
        </p>
        {breakdown.event && (
          <p className="mt-2 rounded-md bg-warn/10 p-2 text-sm text-warn">
            Стресс-тест: {breakdown.event.name}. Балл просел на {fmtDelta(breakdown.event.impact)}.
          </p>
        )}
      </header>

      <section className="appear appear-1 mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Пять решений</h2>
        <div
          className="mt-2 overflow-x-auto rounded-xl border border-line bg-panel p-3 print:overflow-visible print:rounded-none print:border-0 print:p-0"
          role="region"
          aria-label="Принятые решения и их вклад"
          tabIndex={0}
        >
          <table className="w-full min-w-[560px] border-collapse text-sm print:min-w-0">
            <caption className="sr-only">Пять решений: мероприятие, район, стоимость и вклад в итоговый балл</caption>
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th scope="col" className="py-1.5 pr-3 font-medium">Мероприятие</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">Где</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">Стоимость</th>
                <th scope="col" className="py-1.5 text-right font-medium">Вклад</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((contribution) => (
                <tr key={contribution.measureId} className="border-b border-line/50">
                  <th scope="row" className="py-1.5 pr-3 text-left font-medium">{contribution.measureName}</th>
                  <td className="py-1.5 pr-3 text-muted">{contribution.district}</td>
                  <td className="py-1.5 pr-3 text-right tabular">{contribution.cost}</td>
                  <td className="py-1.5 text-right font-semibold tabular">{fmtDelta(contribution.shapley)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-xs text-muted">
          Вклад посчитан по Шепли: усреднение по всем порядкам добавления, поэтому бонусы
          синергий распределены честно, а не достаются последней мере.
        </p>
      </section>

      <section className="appear appear-2 mt-6 grid gap-5 sm:grid-cols-2">
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

      {summary.recommendations.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-accent">Что можно улучшить</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {summary.recommendations.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Районы</h2>
        <div
          className="mt-2 overflow-x-auto rounded-xl border border-line bg-panel p-3 print:overflow-visible print:rounded-none print:border-0 print:p-0"
          role="region"
          aria-label="Изменения оценок районов"
          tabIndex={0}
        >
          <table className="w-full min-w-[380px] border-collapse text-sm print:min-w-0">
            <caption className="sr-only">Оценки районов до решений, после решений и их изменение</caption>
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th scope="col" className="py-1.5 font-medium">Район</th>
                <th scope="col" className="py-1.5 text-right font-medium">Было</th>
                <th scope="col" className="py-1.5 text-right font-medium">Стало</th>
                <th scope="col" className="py-1.5 text-right font-medium">Изменение</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.districts.map((district) => (
                <tr key={district.id} className="border-b border-line/50">
                  <th scope="row" className="py-1.5 text-left font-medium">
                    {district.name}
                    {district.isWeakest && <span className="ml-2 text-xs text-warn">слабейший</span>}
                  </th>
                  <td className="py-1.5 text-right tabular text-muted">{fmt(district.before)}</td>
                  <td className="py-1.5 text-right tabular font-semibold">{fmt(district.after)}</td>
                  <td className="py-1.5 text-right tabular">{fmtDelta(district.delta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="mt-8 border-t border-line pt-4 text-xs text-muted">
        Балл считает детерминированный движок по формуле из технического задания:
        0,7 × среднее по городу + 0,3 × слабейший район − 1 за каждый показатель ниже 40.
        Языковая модель в расчёте не участвует.
      </footer>
      <AiAssistant
        decisions={decisions}
        breakdown={breakdown}
        complete
        contextLabel="Разбор сценария"
      />
    </main>
  )
}
