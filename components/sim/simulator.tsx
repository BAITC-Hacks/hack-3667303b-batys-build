"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import {
  BarChart3,
  Building2,
  FileText,
  GitCompare,
  RotateCcw,
  Sparkles,
  Table2,
  Trash2,
  Zap,
} from "lucide-react"

import {
  BUDGET,
  DECISION_COUNT,
  DIRECTION_LABELS,
  DISTRICTS,
  INDICATOR_META,
  MAX_PER_DIRECTION,
  MEASURES,
  MEASURE_BY_ID,
  type Decision,
  type Direction,
  type DistrictId,
  type Measure,
} from "@/lib/domain/city"
import { encodeDecisions } from "@/lib/domain/encode"
import { CITY_EVENTS, EVENT_BY_ID } from "@/lib/domain/events"
import { scoreScenario, type ScenarioBreakdown } from "@/lib/engine/score"
import { canAdd, totalCost, validateScenario } from "@/lib/engine/validate"
import { attribute } from "@/lib/engine/attribution"
import { cn, fmt, fmtDelta } from "@/lib/utils"

import { AiPanel } from "@/components/sim/ai-panel"
import { CanvasBoundary } from "@/components/sim/canvas-boundary"
import { DistrictsTable } from "@/components/sim/districts-table"
import { FrontierChart } from "@/components/sim/frontier-chart"
import { Scorecard } from "@/components/sim/scorecard"

// three.js незачем рендерить на сервере, поэтому карта грузится только в браузере.
const CityMap = dynamic(() => import("@/components/city/city-map"), {
  ssr: false,
  loading: () => <div className="h-[460px] animate-pulse rounded-lg border border-line bg-panel" />,
})

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

type TabId = "city" | "frontier" | "districts"

const TABS: Array<{ id: TabId; label: string; hint: string; icon: typeof Building2 }> = [
  { id: "city", label: "Город", hint: "как решения выглядят на карте", icon: Building2 },
  { id: "frontier", label: "Сколько стоит балл", hint: "потолок при каждом бюджете", icon: BarChart3 },
  { id: "districts", label: "Районы", hint: "все показатели и их сдвиг", icon: Table2 },
]

export function Simulator({
  initialDecisions = [],
  initialEventId = null,
}: {
  /** Сценарий из адреса страницы: так им можно обменяться ссылкой. */
  initialDecisions?: Decision[]
  initialEventId?: string | null
}) {
  const [decisions, setDecisions] = useState<Decision[]>(initialDecisions)
  const [eventId, setEventId] = useState<string | null>(initialEventId)
  const [direction, setDirection] = useState<Direction | "all">("all")
  const [tab, setTab] = useState<TabId>("city")

  const event = eventId ? (EVENT_BY_ID.get(eventId) ?? null) : null
  const breakdown = useMemo(() => scoreScenario(decisions, event), [decisions, event])
  const contributions = useMemo(() => attribute(decisions), [decisions])
  const cost = totalCost(decisions)
  const isComplete = decisions.length === DECISION_COUNT
  const violations = validateScenario(decisions, !isComplete)
  const ready = isComplete && violations.length === 0

  const add = (measure: Measure, districtId: DistrictId | null) => {
    if (canAdd(decisions, measure, districtId)) return
    setDecisions((current) => [...current, { measureId: measure.id, districtId }])
  }

  const remove = (index: number) => setDecisions((current) => current.filter((_, i) => i !== index))

  const chosen = new Set(decisions.map((d) => d.measureId))
  const usedBy = (target: Direction) =>
    decisions.filter((d) => MEASURE_BY_ID.get(d.measureId)?.direction === target).length
  const visible = MEASURES.filter((m) => direction === "all" || m.direction === direction)

  return (
    <div className="pb-10">
      <StatusBar
        cost={cost}
        count={decisions.length}
        breakdown={breakdown}
        ready={ready}
        eventId={eventId}
        decisions={decisions}
        onExample={() => setDecisions(EXAMPLE)}
        onReset={() => {
          setDecisions([])
          setEventId(null)
        }}
      />

      <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6">
        {decisions.length === 0 && <Onboarding onExample={() => setDecisions(EXAMPLE)} />}

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_390px]">
          <section aria-labelledby="step-1" className="order-2 lg:order-1">
            <StepHeading
              id="step-1"
              number={1}
              title="Выберите пять решений"
              hint="Не больше двух по одному направлению. Недоступные варианты гаснут, а причина написана рядом."
            />

            <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Фильтр по направлениям">
              <FilterChip active={direction === "all"} onClick={() => setDirection("all")}>
                Все направления
              </FilterChip>
              {DIRECTION_ORDER.map((item) => (
                <FilterChip
                  key={item}
                  active={direction === item}
                  onClick={() => setDirection(item)}
                  full={usedBy(item) >= MAX_PER_DIRECTION}
                >
                  <span className={DIRECTION_COLOR[item]}>●</span> {DIRECTION_LABELS[item]}{" "}
                  <span className="tabular opacity-70">
                    {usedBy(item)}/{MAX_PER_DIRECTION}
                  </span>
                </FilterChip>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((measure) => (
                <MeasureCard
                  key={measure.id}
                  measure={measure}
                  picked={chosen.has(measure.id)}
                  decisions={decisions}
                  onAdd={add}
                />
              ))}
            </div>
          </section>

          <aside className="order-1 space-y-4 lg:order-2">
            <StepHeading
              id="step-2"
              number={2}
              title="Смотрите, что получилось"
              hint="Балл пересчитывается на каждое решение."
            />

            <Scorecard breakdown={breakdown} complete={isComplete} violations={violations} />

            <DecisionList decisions={decisions} contributions={contributions} onRemove={remove} />

            <EventBar eventId={eventId} onChange={setEventId} breakdown={breakdown} />

            <AiPanel
              decisions={decisions}
              breakdown={breakdown}
              complete={isComplete}
              onApply={setDecisions}
            />
          </aside>
        </div>

        <section aria-labelledby="step-3" className="mt-8">
          <StepHeading
            id="step-3"
            number={3}
            title="Разберитесь в последствиях"
            hint="Три взгляда на один и тот же сценарий — переключайте вкладки."
          />

          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Подробности сценария">
            {TABS.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  onClick={() => setTab(item.id)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition",
                    tab === item.id
                      ? "border-accent/50 bg-accent-soft text-accent"
                      : "border-line bg-panel text-muted hover:bg-panel-raised hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {item.label}
                  <span className="hidden text-xs font-normal opacity-70 sm:inline">— {item.hint}</span>
                </button>
              )
            })}
          </div>

          <div className="mt-3">
            {tab === "city" && (
              <CanvasBoundary>
                <CityMap breakdown={breakdown} decisions={decisions} />
              </CanvasBoundary>
            )}
            {tab === "frontier" && (
              <FrontierChart currentCost={cost} currentScore={breakdown.score} valid={ready} />
            )}
            {tab === "districts" && <DistrictsTable breakdown={breakdown} />}
          </div>
        </section>
      </div>
    </div>
  )
}

/**
 * Закреплённая строка состояния.
 *
 * Пока человек выбирает меры, ему нужно постоянно видеть три числа: сколько
 * потрачено, сколько решений принято и что с баллом. Если они уезжают вверх
 * вместе со страницей, приходится скроллить туда-сюда — именно от этого
 * интерфейс и казался запутанным.
 */
function StatusBar({
  cost,
  count,
  breakdown,
  ready,
  eventId,
  decisions,
  onExample,
  onReset,
}: {
  cost: number
  count: number
  breakdown: ScenarioBreakdown
  ready: boolean
  eventId: string | null
  decisions: Decision[]
  onExample: () => void
  onReset: () => void
}) {
  const percent = Math.min(100, (cost / BUDGET) * 100)
  const over = cost > BUDGET
  const query = `s=${encodeDecisions(decisions)}${eventId ? `&event=${eventId}` : ""}`

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <div className="mr-auto">
          <h1 className="text-lg font-bold leading-tight tracking-tight">Аким на 5 часов</h1>
          <p className="text-xs text-muted">Симулятор распределения городского бюджета</p>
        </div>

        <div className="min-w-[190px]">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted">Бюджет</span>
            <span className={cn("font-semibold tabular", over && "text-loss")}>
              {cost} / {BUDGET}
            </span>
          </div>
          <div
            className="mt-1 h-2 overflow-hidden rounded-full bg-panel-raised"
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
        </div>

        <div className="text-xs">
          <p className="text-muted">Решений</p>
          <p className="text-lg font-bold leading-tight tabular">
            {count}
            <span className="text-sm font-normal text-muted"> / {DECISION_COUNT}</span>
          </p>
        </div>

        <div className="text-xs">
          <p className="text-muted">Балл</p>
          {ready ? (
            <p className="text-lg font-bold leading-tight tabular">
              {fmt(breakdown.score)}
              <span
                className={cn(
                  "ml-1.5 text-sm font-semibold",
                  breakdown.delta > 0 ? "text-gain" : breakdown.delta < 0 ? "text-loss" : "text-muted",
                )}
              >
                {fmtDelta(breakdown.delta)}
              </span>
            </p>
          ) : (
            <p className="text-lg font-bold leading-tight text-muted">—</p>
          )}
        </div>

        <div className="flex gap-1.5">
          <ToolbarButton onClick={onExample} icon={Sparkles} label="Пример из ТЗ" />
          <ToolbarLink href={`/brief?${query}`} icon={FileText} label="Разбор" disabled={!ready} />
          <ToolbarLink href={`/compare?a=${encodeDecisions(decisions)}`} icon={GitCompare} label="Сравнить" disabled={!ready} />
          <ToolbarButton onClick={onReset} icon={RotateCcw} label="Сбросить" disabled={count === 0} />
        </div>
      </div>
    </header>
  )
}

function ToolbarButton({
  onClick,
  icon: Icon,
  label,
  disabled,
}: {
  onClick: () => void
  icon: typeof Sparkles
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs font-medium transition hover:bg-panel-raised disabled:opacity-40"
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

function ToolbarLink({
  href,
  icon: Icon,
  label,
  disabled,
}: {
  href: string
  icon: typeof Sparkles
  label: string
  disabled?: boolean
}) {
  return (
    <a
      href={href}
      aria-disabled={disabled}
      title={disabled ? "Доступно, когда приняты все пять решений" : label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs font-medium transition hover:bg-panel-raised",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </a>
  )
}

/** Номер шага перед заголовком: показывает порядок действий, а не просто раздел. */
function StepHeading({
  id,
  number,
  title,
  hint,
}: {
  id: string
  number: number
  title: string
  hint: string
}) {
  return (
    <div className="mb-3 flex items-start gap-2.5">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">
        {number}
      </span>
      <div>
        <h2 id={id} className="text-base font-semibold leading-tight">
          {title}
        </h2>
        <p className="text-xs text-muted">{hint}</p>
      </div>
    </div>
  )
}

function FilterChip({
  active,
  full,
  onClick,
  children,
}: {
  active: boolean
  full?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md border px-2.5 py-1.5 text-xs font-medium transition",
        active
          ? "border-accent/50 bg-accent-soft text-accent"
          : "border-line bg-panel text-muted hover:bg-panel-raised hover:text-foreground",
        full && !active && "opacity-50",
      )}
    >
      {children}
    </button>
  )
}

function DecisionList({
  decisions,
  contributions,
  onRemove,
}: {
  decisions: Decision[]
  contributions: ReturnType<typeof attribute>
  onRemove: (index: number) => void
}) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        Принятые решения
      </h3>
      <ol className="space-y-2">
        {Array.from({ length: DECISION_COUNT }).map((_, index) => {
          const decision = decisions[index]
          if (!decision) {
            return (
              <li
                key={index}
                className="flex h-12 items-center rounded-md border border-dashed border-line px-3 text-sm text-muted"
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
                onClick={() => onRemove(index)}
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
  )
}

/**
 * Подсказка для первого захода: исчезает, как только принято первое решение.
 * Человеку, открывшему симулятор впервые, нужно тридцать секунд, чтобы понять
 * правила, — на защите этих тридцати секунд может не быть.
 */
function Onboarding({ onExample }: { onExample: () => void }) {
  return (
    <div className="mt-5 rounded-lg border border-accent/30 bg-accent-soft p-4">
      <p className="text-sm font-medium">
        У вас 100 условных единиц бюджета и ровно пять решений по пяти направлениям.
      </p>
      <ol className="mt-2 grid gap-1.5 text-sm text-muted sm:grid-cols-3">
        <li>
          <span className="font-semibold text-foreground">Шаг 1.</span> Выбираете мероприятия —
          для районных указываете район.
        </li>
        <li>
          <span className="font-semibold text-foreground">Шаг 2.</span> Справа сразу видно балл:
          он падает, если слабейший район остаётся без внимания.
        </li>
        <li>
          <span className="font-semibold text-foreground">Шаг 3.</span> Внизу — город на карте,
          цена балла и таблица показателей.
        </li>
      </ol>
      <button
        type="button"
        onClick={onExample}
        className="mt-3 rounded-md border border-accent/50 bg-panel px-3 py-1.5 text-sm font-medium text-accent transition hover:border-accent"
      >
        Показать готовый сценарий из ТЗ
      </button>
    </div>
  )
}

/**
 * Стресс-тест сценария: событие бьёт по показателям уже после того, как
 * отработали меры, и показывает, насколько выбранный набор устойчив.
 */
function EventBar({
  eventId,
  onChange,
  breakdown,
}: {
  eventId: string | null
  onChange: (id: string | null) => void
  breakdown: ScenarioBreakdown
}) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted">
        <Zap className="size-4 text-warn" aria-hidden />
        Стресс-тест
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {CITY_EVENTS.map((cityEvent) => (
          <button
            key={cityEvent.id}
            type="button"
            onClick={() => onChange(eventId === cityEvent.id ? null : cityEvent.id)}
            title={cityEvent.description}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition",
              eventId === cityEvent.id
                ? "border-warn/60 bg-warn/15 text-warn"
                : "border-line bg-panel-raised text-muted hover:border-warn/40 hover:text-foreground",
            )}
          >
            {cityEvent.name}
          </button>
        ))}
      </div>

      {breakdown.event ? (
        <p className="mt-2 text-xs text-muted">
          {breakdown.event.description}{" "}
          <span className="font-semibold text-loss tabular">
            Балл просел на {fmtDelta(breakdown.event.impact)}.
          </span>{" "}
          {breakdown.event.mitigation}{" "}
          <button
            type="button"
            onClick={() => onChange(null)}
            className="underline underline-offset-2 hover:text-foreground"
          >
            отменить
          </button>
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted">
          Проверьте сценарий на прочность: авария бьёт по показателям сразу, без лага.
        </p>
      )}
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
    .map(
      ([key, value]) =>
        `${INDICATOR_META[key as keyof typeof INDICATOR_META].label} ${value > 0 ? "+" : "−"}${Math.abs(value as number)}`,
    )
    .join(" · ")
  const realized = Math.round(((8 - measure.lag) / 8) * 100)

  // Для городских мер район не выбирается, поэтому проверяем сразу.
  const cityBlockReason = measure.scope === "city" ? canAdd(decisions, measure, null) : null

  // Если мера недоступна во всех районах сразу — причина у них общая (бюджет,
  // лимит направления), и показать её один раз понятнее, чем пять всплывающих подсказок.
  const districtReasons =
    measure.scope === "district" ? DISTRICTS.map((d) => canAdd(decisions, measure, d.id)) : []
  const districtBlockReason = districtReasons.every(Boolean) ? districtReasons[0] : null

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border p-3 transition",
        picked ? "border-accent/50 bg-accent-soft" : "border-line bg-panel",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{measure.name}</p>
        <span
          className="shrink-0 rounded bg-panel-raised px-1.5 py-0.5 text-xs font-semibold tabular"
          title="Стоимость в условных единицах"
        >
          {measure.cost}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-muted">{effects}</p>
      <p className="mt-1 text-xs text-muted tabular">
        Лаг {measure.lag} кв. — успеет сработать на {realized}%
      </p>

      <div className="mt-auto pt-2.5">
        {picked ? (
          <p className="text-xs font-medium text-accent">✓ Уже в сценарии</p>
        ) : measure.scope === "city" ? (
          <>
            <button
              type="button"
              onClick={() => onAdd(measure, null)}
              disabled={Boolean(cityBlockReason)}
              className="w-full rounded-md border border-line bg-panel-raised px-2 py-1.5 text-xs font-medium transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Применить ко всему городу
            </button>
            {/* Причина отказа живёт отдельной строкой: в кнопку она не помещается. */}
            {cityBlockReason && <p className="mt-1 text-xs text-loss">{cityBlockReason}</p>}
          </>
        ) : (
          <>
            <p className={cn("mb-1 text-xs", districtBlockReason ? "text-loss" : "text-muted")}>
              {districtBlockReason ?? "В каком районе:"}
            </p>
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
          </>
        )}
      </div>
    </div>
  )
}
