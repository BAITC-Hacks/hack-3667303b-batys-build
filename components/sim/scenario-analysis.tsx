"use client"

import { useState, useTransition } from "react"
import { LineChart, LoaderCircle, MessageCircle, Wand2 } from "lucide-react"

import { apiErrorSchema, explanationResponseSchema, type ExplanationResponse } from "@/lib/ai/schema"
import type { Decision } from "@/lib/domain/city"
import type { ScenarioBreakdown } from "@/lib/engine/score"
import { cn } from "@/lib/utils"

/**
 * Разбор сценария как основная форма работы с ИИ.
 *
 * Чат остаётся, но вторым слоем: человеку, который только что собрал набор из
 * пяти мер, нужен не диалог, а готовый вывод — что получилось, чем пришлось
 * пожертвовать, что рискует и что поменять. Поэтому структура ответа
 * фиксирована, а не свободный текст.
 *
 * Числа в разборе не рождаются здесь: модель получает готовый расчёт движка
 * и только пересказывает его. Если модель недоступна, разбор собирает сам
 * движок — раздел выглядит так же, меняется только подпись источника.
 */

interface Snapshot {
  scenarioKey: string
  result?: ExplanationResponse
  error?: string
}

export function ScenarioAnalysis({
  decisions,
  breakdown,
  complete,
  onDiscuss,
}: {
  decisions: Decision[]
  breakdown: ScenarioBreakdown
  complete: boolean
  /** Открывает чат: кнопку держит родитель, чтобы диалог жил в одном месте. */
  onDiscuss: (trigger: HTMLButtonElement) => void
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [isPending, start] = useTransition()

  const scenarioKey = JSON.stringify({ decisions, eventId: breakdown.event?.id ?? null })
  const stale = snapshot !== null && snapshot.scenarioKey !== scenarioKey
  const analysis = snapshot?.result

  const explain = () => {
    if (!complete || isPending) return
    const current = { scenarioKey }
    setSnapshot(current)
    start(async () => {
      try {
        const response = await fetch("/api/explain", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decisions }),
        })
        const data: unknown = await response.json().catch(() => null)
        if (!response.ok) {
          const parsed = apiErrorSchema.safeParse(data)
          setSnapshot({
            ...current,
            error: parsed.success ? parsed.data.error : "Не удалось получить разбор. Попробуйте ещё раз.",
          })
          return
        }
        const parsed = explanationResponseSchema.safeParse(data)
        setSnapshot(
          parsed.success
            ? { ...current, result: parsed.data }
            : { ...current, error: "Не удалось прочитать разбор. Попробуйте ещё раз." },
        )
      } catch {
        setSnapshot({ ...current, error: "Не удалось подключиться. Проверьте соединение и повторите попытку." })
      }
    })
  }

  return (
    <section
      aria-labelledby="analysis-title"
      className="rounded-2xl border border-accent/20 bg-panel p-5 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <LineChart className="size-5" strokeWidth={1.8} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="analysis-title" className="text-sm font-semibold">
            Городской аналитик
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Разберёт ваш сценарий: сильные стороны, компромиссы, риски
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={explain}
        data-tour="analysis"
        disabled={!complete || isPending}
        aria-busy={isPending}
        className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-accent/25 bg-accent-soft px-3 py-2.5 text-sm font-semibold text-accent transition hover:border-accent/60 hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? (
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <Wand2 className="size-4" aria-hidden />
        )}
        {isPending ? "Разбираем сценарий…" : analysis ? "Разобрать заново" : "Разобрать сценарий"}
      </button>

      {!complete && (
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Разбор появится, когда приняты все пять решений. Задать вопрос можно уже сейчас.
        </p>
      )}

      {breakdown.event && (
        <p className="mt-3 rounded-xl bg-warn/10 px-3 py-2.5 text-xs leading-relaxed text-warn">
          Аналитик оценивает решения без стресс-теста «{breakdown.event.name}».
          Его результаты могут отличаться от текущего балла города.
        </p>
      )}

      {stale && !isPending && (
        <p className="mt-3 text-xs leading-relaxed text-warn" role="status">
          Сценарий изменился — разбор относится к предыдущему набору. Запросите его заново.
        </p>
      )}

      {snapshot?.error && (
        <p className="mt-3 rounded-lg bg-loss/5 p-3 text-xs leading-relaxed text-loss" role="alert">
          {snapshot.error}
        </p>
      )}

      {analysis && (
        <div className="mt-4 space-y-4" aria-live="polite">
          <span
            className={cn(
              "inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold",
              analysis.source === "ai" ? "bg-accent-soft text-accent" : "bg-panel-raised text-muted",
            )}
          >
            {analysis.source === "ai" ? "Объяснила модель" : "Разбор движка — модель недоступна"}
          </span>

          <p className="text-sm leading-relaxed">{analysis.summary}</p>

          <Section title="Сильные стороны" tone="gain" items={analysis.strengths} />
          {analysis.tradeoff && <Section title="Компромиссы" tone="neutral" items={[analysis.tradeoff]} />}
          <Section title="Риски" tone="loss" items={analysis.risks} />
          <Section title="Что можно улучшить" tone="accent" items={analysis.recommendations} />

          <p className="rounded-lg bg-panel-raised p-3 text-[11px] leading-relaxed text-muted">
            Все числа посчитал движок. Модель получает готовый расчёт и только описывает его словами.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={(event) => onDiscuss(event.currentTarget)}
        className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line px-3 py-2.5 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
      >
        <MessageCircle className="size-4" aria-hidden />
        Обсудить с аналитиком
      </button>
    </section>
  )
}

const TONE: Record<"gain" | "loss" | "accent" | "neutral", string> = {
  gain: "text-gain",
  loss: "text-loss",
  accent: "text-accent",
  neutral: "text-foreground",
}

function Section({
  title,
  items,
  tone,
}: {
  title: string
  items: string[]
  tone: keyof typeof TONE
}) {
  if (!items.length) return null
  return (
    <div>
      <h3 className={cn("text-xs font-semibold", TONE[tone])}>{title}</h3>
      <ul className="mt-1.5 space-y-1.5 text-xs leading-relaxed text-muted">
        {items.map((item, index) => (
          <li key={index} className="flex gap-1.5">
            <span aria-hidden>•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
