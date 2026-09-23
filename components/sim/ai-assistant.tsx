"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { Bot, MessageCircle, X } from "lucide-react"

import { BUDGET, DECISION_COUNT, type Decision } from "@/lib/domain/city"
import { encodeDecisions } from "@/lib/domain/encode"
import type { ScenarioBreakdown } from "@/lib/engine/score"
import { AiPanel } from "@/components/sim/ai-panel"
import { ScenarioAnalysis } from "@/components/sim/scenario-analysis"

export function AiAssistant({
  decisions,
  breakdown,
  complete,
  onApply,
  inlineEntry = false,
  contextLabel = "Текущий сценарий",
  contextPicker,
}: {
  decisions: Decision[]
  breakdown: ScenarioBreakdown
  complete: boolean
  onApply?: (decisions: Decision[]) => void
  inlineEntry?: boolean
  contextLabel?: string
  contextPicker?: ReactNode
}) {
  const id = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState(false)
  const [applied, setApplied] = useState(false)

  // Нативный диалог удерживает фокус, но прокрутку страницы нужно остановить отдельно.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = previous }
  }, [open])

  const show = (trigger: HTMLButtonElement) => {
    triggerRef.current = trigger
    setApplied(false)
    dialogRef.current?.showModal()
    setOpen(true)
  }

  const apply = (suggestion: Decision[]) => {
    if (!onApply) {
      window.location.assign(`/?s=${encodeDecisions(suggestion)}`)
      return
    }
    onApply(suggestion)
    setApplied(true)
    dialogRef.current?.close()
    document.getElementById("scenario-summary")?.scrollIntoView({ block: "start" })
  }

  return (
    <>
      {/* Главный вход в ИИ — готовый разбор, а не приглашение в чат: человеку
          после пяти решений нужен вывод, а диалог остаётся вторым слоем. */}
      {inlineEntry && (
        <ScenarioAnalysis
          decisions={decisions}
          breakdown={breakdown}
          complete={complete}
          onDiscuss={show}
        />
      )}

      <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2 sm:right-6 print:hidden">
        <p role="status" className={applied ? "rounded-xl border border-accent/20 bg-panel px-4 py-2 text-xs text-accent shadow-lg" : "sr-only"}>
          {applied ? "Предложенный сценарий применён" : ""}
        </p>
        <button
          type="button"
          onClick={(event) => show(event.currentTarget)}
          aria-label="Открыть городского аналитика"
          aria-haspopup="dialog"
          aria-controls={id}
          aria-expanded={open}
          className="inline-flex min-h-14 items-center gap-3 rounded-2xl border border-white/30 bg-accent px-4 py-3 text-left text-white shadow-[0_6px_28px_#087f7040] ring-4 ring-panel/80 transition hover:bg-[#066b5e] hover:shadow-[0_8px_32px_#087f7055]"
        >
          <MessageCircle className="size-6 shrink-0" strokeWidth={1.8} aria-hidden />
          <span>
            <span className="block text-sm font-semibold">Городской аналитик</span>
            <span className="mt-0.5 hidden text-[11px] text-white/85 sm:block">Спросить о сценарии</span>
          </span>
        </button>
      </div>

      <dialog
        ref={dialogRef}
        id={id}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return
          // Не выпускаем Tab в панель браузера после последнего поля диалога.
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])',
          )).filter((element) => element.getClientRects().length > 0 && element.tabIndex >= 0)
          const first = controls[0]
          const last = controls[controls.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last?.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first?.focus()
          }
        }}
        onClose={() => {
          setOpen(false)
          triggerRef.current?.focus({ preventScroll: true })
        }}
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] top-auto m-0 h-[min(740px,calc(100dvh-1.5rem-env(safe-area-inset-bottom)))] max-h-none w-auto max-w-none overflow-hidden rounded-3xl border border-line bg-panel p-0 text-foreground shadow-2xl backdrop:bg-foreground/20 backdrop:backdrop-blur-[2px] sm:left-auto sm:right-6 sm:w-[420px] print:hidden"
      >
        <div className="flex h-full min-h-0 flex-col">
          <header className="flex shrink-0 items-center gap-3 border-b border-line bg-accent-soft/70 px-5 py-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
              <Bot className="size-6" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={`${id}-title`} className="text-base font-semibold">Городской аналитик</h2>
              <p id={`${id}-description`} className="mt-0.5 text-xs text-muted">Отвечает на вопросы по вашему сценарию</p>
            </div>
            <button
              type="button"
              autoFocus
              onClick={() => dialogRef.current?.close()}
              aria-label="Закрыть городского аналитика"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-panel hover:text-foreground"
            >
              <X className="size-5" aria-hidden />
            </button>
          </header>
          <div className="shrink-0 border-b border-line bg-background px-5 py-3">
            {contextPicker ?? <p className="text-xs font-medium text-muted">{contextLabel}</p>}
            <p className="mt-1 text-xs text-muted tabular">
              {decisions.length} из {DECISION_COUNT} решений · Бюджет {breakdown.cost} / {BUDGET}
            </p>
          </div>
          {/* Панель остаётся смонтированной: закрытие окна не теряет черновик и ответ. */}
          <div className="min-h-0 flex-1">
            <AiPanel
              decisions={decisions}
              breakdown={breakdown}
              complete={complete}
              onApply={apply}
              embedded
              analysis={!inlineEntry}
            />
          </div>
        </div>
      </dialog>
    </>
  )
}
