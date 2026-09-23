"use client"

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Bot, MessageCircle, X } from "lucide-react"

import { BUDGET, DECISION_COUNT, type Decision } from "@/lib/domain/city"
import { encodeDecisions } from "@/lib/domain/encode"
import type { ScenarioBreakdown } from "@/lib/engine/score"
import { AiPanel } from "@/components/sim/ai-panel"
import { ScenarioAnalysis } from "@/components/sim/scenario-analysis"

const subscribe = () => () => {}
const clientSnapshot = () => true
const serverSnapshot = () => false

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
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot)
  const sidebarRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState(false)
  const [applied, setApplied] = useState(false)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus({ preventScroll: true })
    // На узком экране панель не должна скрывать место перехода фокуса,
    // даже если Tab сначала увёл пользователя в адресную строку браузера.
    const revealPageFocus = (event: FocusEvent) => {
      if (event.target instanceof Node
        && !sidebarRef.current?.contains(event.target)
        && !window.matchMedia("(min-width: 80rem)").matches) {
        setOpen(false)
      }
    }
    document.addEventListener("focusin", revealPageFocus)
    return () => document.removeEventListener("focusin", revealPageFocus)
  }, [open])

  const show = (trigger: HTMLButtonElement) => {
    triggerRef.current = trigger
    setApplied(false)
    if (open) closeRef.current?.focus({ preventScroll: true })
    setOpen(true)
  }

  const close = () => {
    setOpen(false)
    // Кнопка возвращается в раскладку после закрытия панели.
    requestAnimationFrame(() => {
      if (triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true })
    })
  }

  const apply = (suggestion: Decision[]) => {
    if (!onApply) {
      window.location.assign(`/?s=${encodeDecisions(suggestion)}`)
      return
    }
    onApply(suggestion)
    setApplied(true)
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

      {/* Портал защищает закреплённую панель от transform-анимаций карточек. */}
      {hydrated && createPortal(<>
        <div hidden={open} className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 max-w-[calc(100vw-2rem)] sm:right-6 print:hidden">
          <button
            type="button"
            onClick={(event) => show(event.currentTarget)}
            aria-label="Открыть городского аналитика"
            data-tour="assistant-launcher"
            aria-controls={id}
            aria-expanded={open}
            className="assistant-launcher inline-flex min-h-14 items-center gap-3 rounded-2xl border border-white/30 bg-accent px-4 py-3 text-left text-white shadow-[0_6px_28px_#087f7040] ring-4 ring-panel/80 transition hover:bg-[#066b5e] hover:shadow-[0_8px_32px_#087f7055] active:scale-95"
          >
            <MessageCircle className="size-6 shrink-0" strokeWidth={1.8} aria-hidden />
            <span>
              <span className="block text-sm font-semibold">Городской аналитик</span>
              <span className="mt-0.5 hidden text-[11px] text-white/85 sm:block">Спросить о сценарии</span>
            </span>
          </button>
        </div>

        <aside
          ref={sidebarRef}
          id={id}
          data-open={open}
          inert={!open}
          aria-hidden={!open}
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-description`}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !event.defaultPrevented) {
              event.preventDefault()
              close()
            }
          }}
          className="assistant-sidebar fixed right-0 top-0 z-50 overflow-hidden border-l border-line bg-panel text-foreground shadow-[-8px_0_32px_#18332f0a] print:hidden"
        >
          <div className="flex h-full min-h-0 flex-col">
            <header className="flex shrink-0 items-center gap-3 border-b border-line bg-accent-soft/70 px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
                <Bot className="size-6" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id={`${id}-title`} className="text-base font-semibold">Городской аналитик</h2>
                <p id={`${id}-description`} className="mt-0.5 text-xs text-muted">Рядом, пока вы меняете город</p>
              </div>
              <button
                type="button"
                ref={closeRef}
                onClick={close}
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
              <p role="status" className={applied ? "mt-2 text-xs font-medium text-accent" : "sr-only"}>
                {applied ? "Предложенный сценарий применён" : ""}
              </p>
            </div>
            {/* Панель остаётся смонтированной: закрытие не теряет черновик и ответ. */}
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
        </aside>
      </>, document.body)}
    </>
  )
}
