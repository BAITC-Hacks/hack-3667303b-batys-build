"use client"

import { useMemo, useState } from "react"
import { RotateCcw, Sparkles, Trash2 } from "lucide-react"

import {
  BUDGET,
  DECISION_COUNT,
  DIRECTION_LABELS,
  DISTRICTS,
  INDICATOR_META,
  MEASURES,
  MEASURE_BY_ID,
  type Decision,
  type Direction,
  type DistrictId,
  type Measure,
} from "@/lib/domain/city"
import { scoreScenario } from "@/lib/engine/score"
import { canAdd, totalCost, validateScenario } from "@/lib/engine/validate"
import { attribute } from "@/lib/engine/attribution"
import { cn, fmtDelta } from "@/lib/utils"

import { AiPanel } from "@/components/sim/ai-panel"
import { DistrictsTable } from "@/components/sim/districts-table"
import { Scorecard } from "@/components/sim/scorecard"

/** Пример допустимого набора из ТЗ — удобная точка старта для демонстрации. */
const EXAMPLE: Decision[] = [
  { measureId: "M7", districtId: "nura" },
  { measureId: "M8", districtId: "nura" },
  { measureId: "M10", districtId: "nura" },
  { measureId: "M12", districtId: null },
  { measureId: "M5", districtId: "saryarka" },
]

const DIRECTION_COLOR: Record<Direction, string> = {
  transport: "text-transport",
  eco: "text-eco",
  social: "text-social",
  safety: "text-safety",
  service: "text-service",
}

const DIRECTION_ORDER: Direction[] = ["transport", "eco", "social", "safety", "service"]

export function Simulator() {
  const [decisions, setDecisions] = useState<Decision[]>([])

  const breakdown = useMemo(() => scoreScenario(decisions), [decisions])
  const contributions = useMemo(() => attribute(decisions), [decisions])
  const cost = totalCost(decisions)
  const isComplete = decisions.length === DECISION_COUNT
  const violations = validateScenario(decisions, !isComplete)

  const add = (measure: Measure, districtId: DistrictId | null) => {
    if (canAdd(decisions, measure, districtId)) return
    setDecisions((current) => [...current, { measureId: measure.id, districtId }])
  }

  const remove = (index: number) =>
    setDecisions((current) => current.filter((_, i) => i !== index))

  const chosen = new Set(decisions.map((d) => d.measureId))

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Аким на 5 часов</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Один бюджет, пять решений, пять направлений. Балл считает движок по формуле из
            технического задания, языковая модель только объясняет результат.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDecisions(EXAMPLE)}
            className="inline-flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-sm font-medium transition hover:bg-panel-raised"
          >
            <Sparkles className="size-4" aria-hidden />
            Пример из ТЗ
          </button>
          <button
            type="button"
            onClick={() => setDecisions([])}
            disabled={decisions.length === 0}
            className="inline-flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-sm font-medium transition hover:bg-panel-raised disabled:opacity-40"
          >
            <RotateCcw className="size-4" aria-hidden />
            Сбросить
          </button>
        </div>
      </header>

      <BudgetBar cost={cost} count={decisions.length} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <section aria-label="Каталог мероприятий" className="order-2 lg:order-1">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Мероприятия
          </h2>
          <div className="space-y-5">
            {DIRECTION_ORDER.map((direction) => {
              const used = decisions.filter(
                (d) => MEASURE_BY_ID.get(d.measureId)?.direction === direction,
              ).length
              return (
                <div key={direction}>
                  <div className="mb-2 flex items-baseline gap-2">
                    <h3 className={cn("text-sm font-semibold", DIRECTION_COLOR[direction])}>
                      {DIRECTION_LABELS[direction]}
                    </h3>
                    <span className="text-xs text-muted tabular">{used} из 2</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {MEASURES.filter((m) => m.direction === direction).map((measure) => (
                      <MeasureCard
                        key={measure.id}
                        measure={measure}
                        picked={chosen.has(measure.id)}
                        decisions={decisions}
                        onAdd={add}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <aside className="order-1 space-y-4 lg:order-2">
          <Scorecard breakdown={breakdown} complete={isComplete} violations={violations} />

          <div className="rounded-lg border border-line bg-panel p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
              Решения {decisions.length} из {DECISION_COUNT}
            </h2>
            <ol className="space-y-2">
              {Array.from({ length: DECISION_COUNT }).map((_, index) => {
                const decision = decisions[index]
                if (!decision) {
                  return (
                    <li
                      key={index}
                      className="flex h-14 items-center rounded-md border border-dashed border-line px-3 text-sm text-muted"
                    >
                      Решение {index + 1} — не принято
                    </li>
                  )
                }
                const measure = MEASURE_BY_ID.get(decision.measureId)!
                const district = DISTRICTS.find((d) => d.id === decision.districtId)
                const contribution = contributions.find((c) => c.measureId === measure.id)
                return (
                  <li
                    key={index}
                    className="flex items-center justify-between gap-2 rounded-md border border-line bg-panel-raised px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{measure.name}</p>
                      <p className="text-xs text-muted tabular">
                        {district?.name ?? "весь город"} · {measure.cost} ед.
                        {contribution ? ` · вклад ${fmtDelta(contribution.shapley)}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      aria-label={`Убрать решение «${measure.name}»`}
                      className="shrink-0 rounded p-1.5 text-muted transition hover:bg-panel hover:text-loss"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>

          <AiPanel
            decisions={decisions}
            breakdown={breakdown}
            complete={isComplete}
            onApply={setDecisions}
          />
        </aside>
      </div>

      <DistrictsTable breakdown={breakdown} />
    </div>
  )
}

function BudgetBar({ cost, count }: { cost: number; count: number }) {
  const percent = Math.min(100, (cost / BUDGET) * 100)
  const over = cost > BUDGET
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="mb-2 flex items-baseline justify-between text-sm">
        <span className="font-medium">Бюджет города</span>
        <span className={cn("tabular", over ? "text-loss" : "text-muted")}>
          {cost} из {BUDGET} условных единиц · осталось {BUDGET - cost}
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-panel-raised"
        role="progressbar"
        aria-valuenow={cost}
        aria-valuemin={0}
        aria-valuemax={BUDGET}
        aria-label="Израсходованный бюджет"
      >
        <div
          className={cn("h-full rounded-full transition-all duration-300", over ? "bg-loss" : "bg-accent")}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted">
        Принято решений: {count} из {DECISION_COUNT}. Остаток бюджета не сгорает и не даёт бонуса.
      </p>
    </div>
  )
}

function MeasureCard({
  measure,
  picked,
  decisions,
  onAdd,
}: {
  measure: Measure
  picked: boolean
  decisions: Decision[]
  onAdd: (measure: Measure, districtId: DistrictId | null) => void
}) {
  const effects = Object.entries(measure.effects)
    .map(([key, value]) => `${INDICATOR_META[key as keyof typeof INDICATOR_META].label} ${value > 0 ? "+" : "−"}${Math.abs(value as number)}`)
    .join(" · ")
  const realized = Math.round(((8 - measure.lag) / 8) * 100)

  // Для городских мер район не выбирается, поэтому проверяем сразу.
  const cityBlockReason = measure.scope === "city" ? canAdd(decisions, measure, null) : null

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition",
        picked ? "border-accent/50 bg-accent-soft" : "border-line bg-panel",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{measure.name}</p>
        <span className="shrink-0 rounded bg-panel-raised px-1.5 py-0.5 text-xs font-semibold tabular">
          {measure.cost}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-muted">{effects}</p>
      <p className="mt-1 text-xs text-muted tabular">
        Лаг {measure.lag} кв. — успевает сработать на {realized}%
      </p>

      {picked ? (
        <p className="mt-2.5 text-xs font-medium text-accent">Уже в сценарии</p>
      ) : measure.scope === "city" ? (
        <button
          type="button"
          onClick={() => onAdd(measure, null)}
          disabled={Boolean(cityBlockReason)}
          title={cityBlockReason ?? undefined}
          className="mt-2.5 w-full rounded-md border border-line bg-panel-raised px-2 py-1.5 text-xs font-medium transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {cityBlockReason ? cityBlockReason : "Применить ко всему городу"}
        </button>
      ) : (
        <div className="mt-2.5">
          <p className="mb-1 text-xs text-muted">Выберите район:</p>
          <div className="flex flex-wrap gap-1">
            {DISTRICTS.map((district) => {
              const reason = canAdd(decisions, measure, district.id)
              return (
                <button
                  key={district.id}
                  type="button"
                  onClick={() => onAdd(measure, district.id)}
                  disabled={Boolean(reason)}
                  title={reason ?? `Применить в районе ${district.name}`}
                  className="rounded border border-line bg-panel-raised px-2 py-1 text-xs transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {district.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
