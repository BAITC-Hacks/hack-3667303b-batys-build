"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  Building2,
  BusFront,
  Check,
  Clock3,
  FileText,
  GitCompare,
  HeartHandshake,
  Leaf,
  MapPin,
  Plus,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Trash2,
  Wallet,
  Wrench,
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

import { AiAssistant } from "@/components/sim/ai-assistant"
import { CanvasBoundary } from "@/components/sim/canvas-boundary"
import { DistrictsTable } from "@/components/sim/districts-table"
import { FrontierChart } from "@/components/sim/frontier-chart"
import { Scorecard } from "@/components/sim/scorecard"

// three.js незачем рендерить на сервере, поэтому карта грузится только в браузере.
const CityMap = dynamic(() => import("@/components/city/city-map"), {
  ssr: false,
  loading: () => (
    <div role="status" className="flex h-[460px] items-center justify-center gap-3 rounded-2xl border border-line bg-panel text-sm text-muted">
      <Building2 className="size-5 animate-pulse" aria-hidden />
      Готовим карту города…
    </div>
  ),
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

const DIRECTION_ICON: Record<Direction, typeof Building2> = {
  transport: BusFront,
  eco: Leaf,
  social: HeartHandshake,
  safety: ShieldCheck,
  service: Wrench,
}

const DIRECTION_SURFACE: Record<Direction, string> = {
  transport: "bg-transport/10 text-transport",
  eco: "bg-eco/10 text-eco",
  social: "bg-social/10 text-social",
  safety: "bg-safety/10 text-safety",
  service: "bg-service/10 text-service",
}

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
    <div className="pb-28">
      <a href="#decisions" className="sr-only z-50 rounded-md bg-panel px-4 py-3 text-accent shadow-lg focus:fixed focus:left-4 focus:top-4 focus:not-sr-only">
        Перейти к выбору решений
      </a>
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

      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <Onboarding onExample={() => setDecisions(EXAMPLE)} />

        <div className="mt-8 grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_380px]">
          <section id="decisions" aria-labelledby="step-1" className="min-w-0">
            <StepHeading
              id="step-1"
              number={1}
              title="Выберите пять решений"
              hint="Найдите баланс между потребностями города. До двух мер в каждом направлении."
            />

            <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Фильтр по направлениям">
              <FilterChip active={direction === "all"} onClick={() => setDirection("all")}>
                <SlidersHorizontal className="size-3.5" aria-hidden /> Все
              </FilterChip>
              {DIRECTION_ORDER.map((item) => (
                <FilterChip
                  key={item}
                  active={direction === item}
                  onClick={() => setDirection(item)}
                  full={usedBy(item) >= MAX_PER_DIRECTION}
                >
                  <span className={DIRECTION_COLOR[item]} aria-hidden>●</span> {DIRECTION_LABELS[item]}{" "}
                  <span className="tabular">
                    {usedBy(item)}/{MAX_PER_DIRECTION}
                  </span>
                </FilterChip>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((measure) => (
                <MeasureCard
                  key={measure.id}
                  measure={measure}
                  picked={chosen.has(measure.id)}
                  decisions={decisions}
                  onAdd={add}
                  onRemove={() => remove(decisions.findIndex((decision) => decision.measureId === measure.id))}
                />
              ))}
            </div>
          </section>

          <aside id="scenario-summary" aria-labelledby="step-2" className="min-w-0 space-y-4">
            <StepHeading
              id="step-2"
              number={2}
              title="Ваш сценарий"
              hint="Каждое решение меняет жизнь города."
            />

            <Scorecard breakdown={breakdown} complete={isComplete} violations={violations} />

            <DecisionList decisions={decisions} contributions={contributions} onRemove={remove} />

            <AiAssistant
              decisions={decisions}
              breakdown={breakdown}
              complete={ready}
              onApply={setDecisions}
              inlineEntry
            />

            <EventBar eventId={eventId} onChange={setEventId} breakdown={breakdown} />
          </aside>
        </div>

        <section aria-labelledby="step-3" className="mt-10 rounded-2xl border border-line bg-panel p-4 shadow-sm sm:p-6">
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
                  id={`tab-${item.id}`}
                  aria-selected={tab === item.id}
                  aria-controls="scenario-details"
                  tabIndex={tab === item.id ? 0 : -1}
                  onClick={() => setTab(item.id)}
                  onKeyDown={(event) => {
                    const index = TABS.findIndex((candidate) => candidate.id === item.id)
                    const nextIndex = event.key === "ArrowRight" ? (index + 1) % TABS.length
                      : event.key === "ArrowLeft" ? (index + TABS.length - 1) % TABS.length
                      : event.key === "Home" ? 0
                      : event.key === "End" ? TABS.length - 1 : null
                    if (nextIndex === null) return
                    event.preventDefault()
                    setTab(TABS[nextIndex].id)
                    document.getElementById(`tab-${TABS[nextIndex].id}`)?.focus()
                  }}
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

          <div id="scenario-details" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0} className="mt-4">
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
        <footer className="mt-7 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span className="inline-flex items-center gap-2"><Building2 className="size-4" aria-hidden /> Аким на 5 часов</span>
          <span>Учебная модель Астаны · Данные условные, последствия наглядные</span>
        </footer>
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
    <header className="sticky top-0 z-30 border-b border-line bg-panel/95 shadow-[0_2px_16px_#18332f04] backdrop-blur-lg">
      <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="mr-auto flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
            <Building2 className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-base font-bold leading-tight tracking-tight sm:text-lg">Аким на 5 часов</h1>
            <p className="mt-1 text-[11px] text-muted">Город начинается с ваших решений</p>
          </div>
        </div>

        <div className="order-3 min-w-[130px] flex-1 sm:order-none sm:max-w-[200px]">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted">Потрачено</span>
            <span className={cn("font-semibold tabular", over && "text-loss")}>
              {cost} / {BUDGET}
            </span>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel-raised"
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

        <a href="#scenario-summary" aria-label={`Принято решений: ${count} из ${DECISION_COUNT}. Перейти к сценарию`} className="order-3 rounded-md text-xs sm:order-none">
          <p className="text-muted">Решений</p>
          <p className="text-lg font-bold leading-tight tabular">
            {count}
            <span className="text-sm font-normal text-muted"> / {DECISION_COUNT}</span>
          </p>
        </a>

        <div className="order-3 min-w-12 text-xs sm:order-none">
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

        <div className="flex gap-1.5 max-sm:order-2 max-sm:ml-auto">
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
      aria-label={label}
      className="inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-2 text-xs font-medium transition hover:border-accent/40 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="hidden xl:inline">{label}</span>
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
      href={disabled ? undefined : href}
      aria-disabled={disabled}
      aria-label={label}
      tabIndex={disabled ? -1 : undefined}
      title={disabled ? "Доступно, когда приняты все пять решений" : label}
      className={cn(
        "inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-2 text-xs font-medium transition hover:border-accent/40 hover:bg-accent-soft",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="hidden xl:inline">{label}</span>
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
    <div className="mb-5 flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-line bg-panel text-xs font-bold text-accent">
        0{number}
      </span>
      <div>
        <h2 id={id} className="text-lg font-bold leading-tight tracking-tight">
          {title}
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">{hint}</p>
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
        "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition",
        active
          ? "border-accent bg-accent-soft text-accent shadow-sm"
          : "border-line bg-panel text-muted hover:bg-panel-raised hover:text-foreground",
        full && !active && "border-dashed",
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
    <div className="rounded-2xl border border-line bg-panel p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Принятые решения</h3>
        <span className="rounded-full bg-panel-raised px-2.5 py-1 text-xs font-semibold text-muted tabular">{decisions.length} / {DECISION_COUNT}</span>
      </div>
      <ol className="space-y-2">
        {Array.from({ length: DECISION_COUNT }).map((_, index) => {
          const decision = decisions[index]
          if (!decision) {
            return (
              <li
                key={index}
                className="flex min-h-12 items-center gap-3 rounded-xl border border-dashed border-line bg-background/60 px-3 text-xs text-muted"
              >
                <span className="flex size-6 items-center justify-center rounded-full bg-panel text-[11px] font-semibold">{index + 1}</span>
                Место для вашего решения
              </li>
            )
          }
          const measure = MEASURE_BY_ID.get(decision.measureId)!
          const district = DISTRICTS.find((d) => d.id === decision.districtId)
          const contribution = contributions.find((c) => c.measureId === measure.id)
          return (
            <li
              key={index}
              className="flex items-center justify-between gap-2 rounded-xl border border-accent/15 bg-accent-soft/50 px-3 py-2.5"
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
                className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-panel hover:text-loss"
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

/** Правила остаются на месте, чтобы первое решение не сдвигало весь каталог. */
function Onboarding({ onExample }: { onExample: () => void }) {
  return (
    <section aria-label="Как устроен симулятор" className="relative mt-6 overflow-hidden rounded-3xl border border-[#d4e8df] bg-[#e9f4ed] p-6 sm:p-8 lg:p-9">
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-36 size-[420px] rounded-full border-[65px] border-white/35" />
      <div className="relative grid items-center gap-7 lg:grid-cols-[1fr_420px]">
        <div>
          <p className="mb-4 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-accent">
            <MapPin className="size-3.5" aria-hidden /> Астана · Городская лаборатория
          </p>
          <h2 className="max-w-2xl text-[28px] font-bold leading-[1.18] tracking-tight sm:text-4xl">
            Город меняется.<br />
            <span className="text-accent">Начните с пяти решений.</span>
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
            Больше зелени, доступнее транспорт, безопаснее улицы.
            Распределите бюджет и посмотрите, как ваши решения изменят жизнь районов.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <a href="#decisions" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#066b5e]">
              Собрать свой сценарий <ArrowDown className="size-4" aria-hidden />
            </a>
            <button type="button" onClick={onExample} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium text-accent transition hover:bg-white/60">
              Открыть пример <ArrowRight className="size-4" aria-hidden />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { icon: Wallet, value: BUDGET, label: "единиц бюджета", color: "bg-white/90 text-accent" },
            { icon: Check, value: DECISION_COUNT, label: "решений за вами", color: "bg-[#fff8e5] text-social" },
            { icon: MapPin, value: DISTRICTS.length, label: "районов города", color: "bg-[#eaf2ff] text-transport" },
          ].map(({ icon: Icon, value, label, color }) => (
            <div key={label} className={cn("rounded-2xl border border-white/80 px-3 py-4 sm:p-5", color)}>
              <Icon className="mb-4 size-5" strokeWidth={1.7} aria-hidden />
              <p className="text-3xl font-semibold tracking-tight tabular sm:text-4xl">{value}</p>
              <p className="mt-2 text-[11px] leading-relaxed font-medium sm:text-xs">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
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
    <div className="rounded-2xl border border-line bg-panel p-5 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Zap className="size-4 text-warn" aria-hidden />
        Стресс-тест
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {CITY_EVENTS.map((cityEvent) => (
          <button
            key={cityEvent.id}
            type="button"
            onClick={() => onChange(eventId === cityEvent.id ? null : cityEvent.id)}
            aria-pressed={eventId === cityEvent.id}
            title={cityEvent.description}
            className={cn(
              "min-h-10 rounded-lg border px-2.5 py-2 text-xs font-medium transition",
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
  onRemove,
}: {
  measure: Measure
  picked: boolean
  decisions: Decision[]
  onAdd: (measure: Measure, districtId: DistrictId | null) => void
  onRemove: () => void
}) {
  const Icon = DIRECTION_ICON[measure.direction]

  // Для городских мер район не выбирается, поэтому проверяем сразу.
  const cityBlockReason = measure.scope === "city" ? canAdd(decisions, measure, null) : null

  // Если мера недоступна во всех районах сразу — причина у них общая (бюджет,
  // лимит направления), и показать её один раз понятнее, чем пять всплывающих подсказок.
  const districtReasons =
    measure.scope === "district" ? DISTRICTS.map((d) => canAdd(decisions, measure, d.id)) : []
  const districtBlockReason = districtReasons.every(Boolean) ? districtReasons[0] : null

  return (
    <article
      aria-label={measure.name}
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border p-4 transition duration-200",
        picked ? "border-accent/50 bg-accent-soft shadow-sm" : "border-line bg-panel shadow-[0_2px_8px_#18332f03] hover:border-accent/35 hover:shadow-md",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className={cn("flex size-10 items-center justify-center rounded-xl", DIRECTION_SURFACE[measure.direction])}>
          <Icon className="size-5" strokeWidth={1.7} aria-hidden />
        </span>
        <p className="text-lg font-bold tabular" aria-label={`Стоимость: ${measure.cost} условных единиц`}>
          {measure.cost} <span className="text-[10px] font-medium text-muted">ед.</span>
        </p>
      </div>
      <p className={cn("text-[10px] font-semibold", DIRECTION_COLOR[measure.direction])}>{DIRECTION_LABELS[measure.direction]} · {measure.id}</p>
      <h3 className="mt-1.5 text-sm font-semibold leading-snug">{measure.name}</h3>
      <ul className="mt-3 space-y-1.5 text-xs text-muted" aria-label="Эффекты меры">
        {Object.entries(measure.effects).map(([key, value]) => (
          <li key={key} className="flex items-baseline justify-between gap-2">
            <span>{INDICATOR_META[key as keyof typeof INDICATOR_META].label}</span>
            <span className={cn("shrink-0 font-semibold tabular", value > 0 ? "text-gain" : "text-loss")}>
              {value > 0 ? "+" : "−"}{Math.abs(value)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted tabular">
        <Clock3 className="size-3.5 shrink-0" aria-hidden /> Лаг эффекта: {measure.lag} кв.
      </p>

      <div className="mt-auto pt-4">
        {picked ? (
          <div className="flex min-h-10 items-center justify-between gap-1 border-t border-accent/15 pt-2">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent"><Check className="size-4" aria-hidden /> В сценарии</p>
            <button type="button" onClick={onRemove} aria-label={`Убрать «${measure.name}» из сценария`} className="flex size-10 items-center justify-center rounded-md text-muted transition hover:bg-panel hover:text-loss">
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        ) : measure.scope === "city" ? (
          <>
            <button
              type="button"
              onClick={() => onAdd(measure, null)}
              disabled={Boolean(cityBlockReason)}
              className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-accent/20 bg-accent-soft/70 px-2 py-2 text-xs font-semibold text-accent transition hover:border-accent/60 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Plus className="size-3.5" aria-hidden /> На весь город
            </button>
            {/* Причина отказа живёт отдельной строкой: в кнопку она не помещается. */}
            {cityBlockReason && <p className="mt-1 text-xs text-loss">{cityBlockReason}</p>}
          </>
        ) : (
          <>
            <p className={cn("mb-2 text-[11px] leading-relaxed", districtBlockReason ? "text-loss" : "text-muted")}>
              {districtBlockReason ?? "Выберите район для применения"}
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
                    aria-label={`${measure.name}: ${district.name}`}
                    title={reason ?? `Применить в районе ${district.name}`}
                    className="min-h-9 rounded-lg border border-line bg-background px-2 py-1.5 text-[11px] font-medium transition hover:border-accent/60 hover:bg-accent-soft hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {district.name}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </article>
  )
}
