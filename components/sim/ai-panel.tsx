"use client"

import { useState, useTransition } from "react"
import { Bot, Send, Wand2 } from "lucide-react"

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
    <div className="rounded-lg border border-line bg-panel p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
        <Bot className="size-4" aria-hidden />
        ИИ-советник
      </h2>

      <button
        type="button"
        onClick={explain}
        disabled={!complete || isExplaining}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-accent/40 bg-accent-soft px-3 py-2 text-sm font-medium text-accent transition hover:border-accent/70 disabled:opacity-40"
      >
        <Wand2 className="size-4" aria-hidden />
        {isExplaining ? "Разбираю сценарий…" : "Разобрать сценарий"}
      </button>
      {!complete && (
        <p className="mt-1.5 text-xs text-muted">Доступно, когда приняты все пять решений.</p>
      )}

      {explanation && (
        <div className="mt-3 space-y-2.5 text-sm">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
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
            <p className="rounded-md bg-panel-raised p-2 text-xs">
              <span className="font-semibold">Компромисс: </span>
              {explanation.tradeoff}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 border-t border-line pt-3">
        <p className="mb-2 text-xs text-muted">
          Спросите совета. Числа агент не выдумывает — он вызывает движок и перебор.
        </p>

        {agent && (
          <div className="mb-3 space-y-2">
            <p className="rounded-md bg-panel-raised p-2.5 text-sm">{agent.reply}</p>
            {agent.trace.length > 0 && (
              <ul className="space-y-0.5 text-xs text-muted">
                {agent.trace.map((step, index) => (
                  <li key={index}>
                    <span className="font-medium">{TOOL_LABELS[step.name] ?? step.name}</span> — {step.summary}
                  </li>
                ))}
              </ul>
            )}
            {agent.suggestion && (
              <button
                type="button"
                onClick={() => onApply(agent.suggestion!)}
                className="w-full rounded-md border border-gain/40 bg-gain/10 px-3 py-1.5 text-xs font-medium text-gain transition hover:border-gain/70"
              >
                Применить предложенный сценарий
              </button>
            )}
          </div>
        )}

        {!agent && !isAsking && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => ask(suggestion)}
                className="rounded border border-line bg-panel-raised px-2 py-1 text-xs text-muted transition hover:border-accent/50 hover:text-foreground"
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
            className="min-w-0 flex-1 rounded-md border border-line bg-panel-raised px-2.5 py-1.5 text-sm outline-none placeholder:text-muted focus:border-accent/60"
          />
          <button
            type="submit"
            disabled={isAsking || !question.trim()}
            className="shrink-0 rounded-md border border-line bg-panel-raised px-2.5 py-1.5 transition hover:border-accent/60 disabled:opacity-40"
            aria-label="Отправить вопрос"
          >
            <Send className="size-4" aria-hidden />
          </button>
        </form>
        {isAsking && <p className="mt-1.5 text-xs text-muted">Агент считает варианты…</p>}
        {error && <p className="mt-1.5 text-xs text-loss">{error}</p>}
      </div>
    </div>
  )
}

function Block({ title, items, tone }: { title: string; items: string[]; tone: "gain" | "loss" }) {
  if (!items.length) return null
  return (
    <div>
      <p className={cn("text-xs font-semibold", tone === "gain" ? "text-gain" : "text-loss")}>{title}</p>
      <ul className="mt-1 space-y-1 text-xs text-muted">
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
