"use client"

import { useState, useTransition } from "react"
import { Bot, LoaderCircle, Send, Wand2 } from "lucide-react"

import type { Decision } from "@/lib/domain/city"
import type { ScenarioBreakdown } from "@/lib/engine/score"
import { cn, fmt, fmtDelta } from "@/lib/utils"

interface Explanation {
  summary: string
  strengths: string[]
  risks: string[]
  tradeoff: string
  source: "ai" | "engine"
}

interface AgentReply {
  reply: string
  trace: Array<{ name: string; summary: string }>
  suggestion: Decision[] | null
}

const TOOL_LABELS: Record<string, string> = {
  score_scenario: "расчёт балла",
  validate_scenario: "проверка правил",
  optimize: "перебор сценариев",
  suggest_improvement: "поиск улучшения",
}

const SUGGESTIONS = [
  "Как улучшить мой сценарий, не выходя за бюджет?",
  "Почему Нура тянет балл вниз?",
  "Что будет, если отказаться от ЛРТ?",
]

export function AiPanel({
  decisions,
  breakdown,
  complete,
  onApply,
}: {
  decisions: Decision[]
  breakdown: ScenarioBreakdown
  complete: boolean
  onApply: (decisions: Decision[]) => void
}) {
  const [explanation, setExplanation] = useState<Explanation | null>(null)
  const [agent, setAgent] = useState<AgentReply | null>(null)
  const [question, setQuestion] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isExplaining, startExplain] = useTransition()
  const [isAsking, startAsk] = useTransition()

  const explain = () =>
    startExplain(async () => {
      setError(null)
      try {
        const response = await fetch("/api/explain", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decisions }),
        })
        const data = await response.json()
        if (!response.ok) {
          setError(data.error ?? "Не удалось получить разбор")
          return
        }
        setExplanation(data as Explanation)
      } catch {
        setError("Сеть недоступна")
      }
    })

  const ask = (text: string) => {
    if (!text.trim()) return
    setQuestion("")
    startAsk(async () => {
      setError(null)
      try {
        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: text, decisions }),
        })
        const data = await response.json()
        setAgent(data as AgentReply)
      } catch {
        setError("Сеть недоступна")
      }
    })
  }

  return (
    <div className="rounded-2xl border border-line bg-panel p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-service/10 text-service">
          <Bot className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-sm font-semibold">ИИ-советник</h2>
          <p className="mt-0.5 text-xs text-muted">Поможет увидеть сильные стороны и риски</p>
        </div>
      </div>

      <button
        type="button"
        onClick={explain}
        disabled={!complete || isExplaining}
        aria-busy={isExplaining}
        className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-accent/20 bg-accent-soft px-3 py-2.5 text-sm font-semibold text-accent transition hover:border-accent/50 hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isExplaining ? (
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <Wand2 className="size-4" aria-hidden />
        )}
        {isExplaining ? "Разбираю сценарий…" : "Разобрать сценарий"}
      </button>
      {!complete && (
        <p className="mt-2 text-xs leading-relaxed text-muted">Выберите пять решений, чтобы получить разбор.</p>
      )}

      {explanation && (
        <div className="mt-4 space-y-3.5 text-sm leading-relaxed" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[10px] font-semibold",
                explanation.source === "ai" ? "bg-accent-soft text-accent" : "bg-panel-raised text-muted",
              )}
            >
              {explanation.source === "ai" ? "объяснила модель" : "разбор движка"}
            </span>
            <span className="text-xs text-muted tabular">
              {fmt(breakdown.score)} балла · {fmtDelta(breakdown.delta)}
            </span>
          </div>
          <p>{explanation.summary}</p>
          <Block title="Сильные стороны" items={explanation.strengths} tone="gain" />
          <Block title="Риски" items={explanation.risks} tone="loss" />
          {explanation.tradeoff && (
            <p className="rounded-xl bg-panel-raised p-3 text-xs leading-relaxed">
              <span className="font-semibold">Компромисс: </span>
              {explanation.tradeoff}
            </p>
          )}
        </div>
      )}

      <div className="mt-5 border-t border-line pt-4">
        <p className="mb-3 text-xs leading-relaxed text-muted">
          Задайте вопрос о вашем городе или выберите один из примеров.
        </p>

        {agent && (
          <div className="mb-4 space-y-3" aria-live="polite">
            <p className="rounded-xl bg-panel-raised p-3.5 text-sm leading-relaxed">{agent.reply}</p>
            {agent.trace.length > 0 && (
              <details className="rounded-lg border border-line px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-muted hover:text-foreground">
                  На чём основан ответ
                </summary>
                <ul className="mt-2 space-y-2 text-xs leading-relaxed text-muted">
                  {agent.trace.map((step, index) => (
                    <li key={index}>
                      <span className="font-medium">{TOOL_LABELS[step.name] ?? step.name}</span> — {step.summary}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {agent.suggestion && (
              <button
                type="button"
                onClick={() => onApply(agent.suggestion!)}
                className="min-h-11 w-full rounded-xl border border-gain/20 bg-gain/10 px-3 py-2.5 text-xs font-semibold text-gain transition hover:border-gain/60"
              >
                Применить предложенный сценарий
              </button>
            )}
          </div>
        )}

        {!agent && !isAsking && (
          <div className="mb-3 grid gap-2">
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
            placeholder="Например: где взять ещё балл?"
            aria-label="Вопрос агенту"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-panel-raised/60 px-3 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/15"
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
        {isAsking && <p className="mt-2 text-xs text-accent" role="status">Проверяем варианты для вашего сценария…</p>}
        {error && <p className="mt-3 rounded-lg bg-loss/5 p-3 text-xs text-loss" role="alert">{error}</p>}
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
