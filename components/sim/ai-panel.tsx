"use client"

import { useState, useTransition } from "react"
import { Bot, LoaderCircle, Send, Wand2 } from "lucide-react"

import {
  agentResponseSchema,
  apiErrorSchema,
  explanationResponseSchema,
  type AgentResponse,
  type ExplanationResponse,
} from "@/lib/ai/schema"
import type { Decision } from "@/lib/domain/city"
import type { ScenarioBreakdown } from "@/lib/engine/score"
import { cn } from "@/lib/utils"

interface ResponseSnapshot<T> {
  scenarioKey: string
  result?: T
  error?: string
}

interface AgentExchange extends ResponseSnapshot<AgentResponse> {
  question: string
}

const TOOL_LABELS: Record<string, string> = {
  score_scenario: "расчёт балла",
  validate_scenario: "проверка правил",
  optimize: "перебор сценариев",
  suggest_improvement: "поиск улучшения",
}

const SUGGESTIONS = [
  "С чего начать улучшение города?",
  "Как улучшить мой сценарий, не выходя за бюджет?",
  "Почему Нура тянет балл вниз?",
]

function responseError(data: unknown, fallback: string): string {
  const parsed = apiErrorSchema.safeParse(data)
  return parsed.success ? parsed.data.error : fallback
}

export function AiPanel({
  decisions,
  breakdown,
  complete,
  onApply,
  embedded = false,
}: {
  decisions: Decision[]
  breakdown: ScenarioBreakdown
  complete: boolean
  onApply: (decisions: Decision[]) => void
  embedded?: boolean
}) {
  const [explanation, setExplanation] = useState<ResponseSnapshot<ExplanationResponse> | null>(null)
  const [agent, setAgent] = useState<AgentExchange | null>(null)
  const [question, setQuestion] = useState("")
  const [isExplaining, startExplain] = useTransition()
  const [isAsking, startAsk] = useTransition()

  // Снимок связывает даже поздний ответ с тем набором, для которого его запросили.
  const scenarioKey = JSON.stringify({ decisions, eventId: breakdown.event?.id ?? null })
  const agentIsStale = agent !== null && agent.scenarioKey !== scenarioKey
  const explanationIsStale = explanation !== null && explanation.scenarioKey !== scenarioKey

  const explain = () => {
    if (!complete || isExplaining) return
    const snapshot = { scenarioKey }
    setExplanation(snapshot)
    startExplain(async () => {
      try {
        const response = await fetch("/api/explain", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decisions }),
        })
        const data: unknown = await response.json().catch(() => null)
        if (!response.ok) {
          setExplanation({ ...snapshot, error: responseError(data, "Не удалось получить разбор. Попробуйте ещё раз.") })
          return
        }
        const parsed = explanationResponseSchema.safeParse(data)
        if (!parsed.success) {
          setExplanation({ ...snapshot, error: "Не удалось прочитать разбор. Попробуйте ещё раз." })
          return
        }
        setExplanation({ ...snapshot, result: parsed.data })
      } catch {
        setExplanation({ ...snapshot, error: "Не удалось подключиться. Проверьте соединение и повторите попытку." })
      }
    })
  }

  const ask = (text: string) => {
    const submitted = text.trim()
    if (!submitted || isAsking) return
    const snapshot = { scenarioKey, question: submitted }
    setAgent(snapshot)
    startAsk(async () => {
      try {
        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: submitted, decisions }),
        })
        const data: unknown = await response.json().catch(() => null)
        if (!response.ok) {
          setAgent({ ...snapshot, error: responseError(data, "Советник временно недоступен. Попробуйте ещё раз.") })
          return
        }
        const parsed = agentResponseSchema.safeParse(data)
        if (!parsed.success) {
          setAgent({ ...snapshot, error: "Не удалось прочитать ответ советника. Попробуйте ещё раз." })
          return
        }
        setAgent({ ...snapshot, result: parsed.data })
        setQuestion((current) => current.trim() === submitted ? "" : current)
      } catch {
        setAgent({ ...snapshot, error: "Не удалось подключиться. Попробуйте отправить вопрос ещё раз." })
      }
    })
  }

  const reply = agent?.result
  const analysis = explanation?.result

  return (
    <div className={cn(
      embedded ? "flex h-full min-h-0 flex-col" : "rounded-2xl border border-line bg-panel p-5 shadow-sm",
    )}>
      <div className={cn(embedded && "min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5")}>
        {!embedded && (
          <div className="mb-5 flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-service/10 text-service">
              <Bot className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-semibold">ИИ-советник</h2>
              <p className="mt-0.5 text-xs text-muted">Поможет выбрать решения для города</p>
            </div>
          </div>
        )}

        {!agent && (
          <div className="mb-4 rounded-2xl rounded-tl-sm bg-accent-soft p-4">
            <p className="text-sm font-medium text-foreground">Здравствуйте! Давайте улучшим ваш город.</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              Помогу выбрать первые решения, сравнить варианты и разобраться в результате.
              Можно спрашивать, даже если сценарий ещё не готов.
            </p>
          </div>
        )}

        {breakdown.event && (
          <p className="mb-4 rounded-xl bg-warn/10 px-3 py-2.5 text-xs leading-relaxed text-warn">
            Советник оценивает решения без стресс-теста «{breakdown.event.name}».
            Его результаты могут отличаться от текущего балла города.
          </p>
        )}

        {(!agent || agentIsStale) && !isAsking && (
          <div className="mb-4 grid gap-2" aria-label="Примеры вопросов">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => ask(suggestion)}
                className="rounded-xl border border-line bg-panel px-3 py-2.5 text-left text-xs leading-relaxed text-muted transition hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {agent && (
          <div className="mb-4 space-y-3">
            {agentIsStale && (
              <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs leading-relaxed text-warn" role="status">
                Сценарий изменился. Этот вопрос и ответ относятся к предыдущему набору решений или стресс-тесту.
                Задайте новый вопрос, чтобы учесть изменения.
              </p>
            )}
            <div className="ml-6 rounded-2xl rounded-tr-sm bg-accent px-4 py-3 text-sm leading-relaxed text-white">
              <span className="sr-only">Ваш вопрос: </span>
              {agent.question}
            </div>
            {reply && (
              <div className="space-y-3" aria-live="polite">
                <p className="mr-3 whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-panel-raised p-4 text-sm leading-relaxed">
                  <span className="sr-only">Советник: </span>
                  {reply.reply}
                </p>
                {reply.trace.length > 0 && (
                  <details className="rounded-lg border border-line px-3 py-2">
                    <summary className="cursor-pointer text-xs font-medium text-muted hover:text-foreground">
                      На чём основан ответ
                    </summary>
                    <ul className="mt-2 space-y-2 text-xs leading-relaxed text-muted">
                      {reply.trace.map((step, index) => (
                        <li key={index}>
                          <span className="font-medium">{TOOL_LABELS[step.name] ?? step.name}</span> — {step.summary}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {reply.suggestion && !agentIsStale && (
                  <button
                    type="button"
                    onClick={() => {
                      if (reply.suggestion) onApply(reply.suggestion)
                    }}
                    className="min-h-11 w-full rounded-xl border border-gain/20 bg-gain/10 px-3 py-2.5 text-xs font-semibold text-gain transition hover:border-gain/60"
                  >
                    Применить предложенный сценарий
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-5 border-t border-line pt-4">
          <p className="text-xs font-semibold text-foreground">Разбор выбранных решений</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {complete
              ? "Посмотрите сильные стороны, риски и главный компромисс вашего набора."
              : "Когда выберете пять решений, здесь появится полный разбор. Задавать вопросы можно уже сейчас."}
          </p>
          <button
            type="button"
            onClick={explain}
            disabled={!complete || isExplaining}
            aria-busy={isExplaining}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-accent/20 bg-accent-soft px-3 py-2.5 text-sm font-semibold text-accent transition hover:border-accent/50 hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isExplaining ? (
              <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <Wand2 className="size-4" aria-hidden />
            )}
            {isExplaining ? "Разбираем сценарий…" : "Разобрать сценарий"}
          </button>
          {explanationIsStale && (
            <p className="mt-3 text-xs leading-relaxed text-warn" role="status">
              Разбор относится к предыдущему сценарию. Запросите его снова, чтобы учесть изменения.
            </p>
          )}
          {explanation?.error && (
            <p className="mt-3 rounded-lg bg-loss/5 p-3 text-xs leading-relaxed text-loss" role="alert">
              {explanation.error}
            </p>
          )}
          {analysis && (
            <div className="mt-4 space-y-3.5 text-sm leading-relaxed" aria-live="polite">
              <span className={cn(
                "inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold",
                analysis.source === "ai" ? "bg-accent-soft text-accent" : "bg-panel-raised text-muted",
              )}>
                {analysis.source === "ai" ? "Объяснила модель" : "Разбор движка"}
              </span>
              <p>{analysis.summary}</p>
              <Block title="Сильные стороны" items={analysis.strengths} tone="gain" />
              <Block title="Риски" items={analysis.risks} tone="loss" />
              {analysis.tradeoff && (
                <p className="rounded-xl bg-panel-raised p-3 text-xs leading-relaxed">
                  <span className="font-semibold">Компромисс: </span>
                  {analysis.tradeoff}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={cn(
        "shrink-0 border-t border-line bg-panel",
        embedded ? "p-4 sm:px-5" : "mt-5 pt-4",
      )}>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            ask(question)
          }}
          className="flex gap-2"
        >
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={600}
            placeholder="Спросите о вашем городе…"
            aria-label="Вопрос советнику"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-panel-raised/60 px-3 py-2.5 text-base outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/15"
          />
          <button
            type="submit"
            disabled={isAsking || !question.trim()}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-panel-raised disabled:text-muted"
            aria-label="Отправить вопрос"
          >
            {isAsking ? (
              <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
          </button>
        </form>
        {isAsking && (
          <p className="mt-2 text-xs text-accent" role="status">Проверяем варианты для вашего сценария…</p>
        )}
        {agent?.error && (
          <p className="mt-3 rounded-lg bg-loss/5 p-3 text-xs leading-relaxed text-loss" role="alert">
            {agent.error}
          </p>
        )}
      </div>
    </div>
  )
}

function Block({ title, items, tone }: { title: string; items: string[]; tone: "gain" | "loss" }) {
  if (!items.length) return null
  return (
    <div>
      <p className={cn("text-xs font-semibold", tone === "gain" ? "text-gain" : "text-loss")}>{title}</p>
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
