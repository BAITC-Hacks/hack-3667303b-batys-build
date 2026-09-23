"use client"

import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ArrowLeft, ArrowRight, Compass, X } from "lucide-react"

import { BUDGET, DECISION_COUNT, MAX_PER_DIRECTION } from "@/lib/domain/city"
import { getTourLayout } from "@/lib/ui/tour-layout"

interface TourStep {
  target: string
  title: string
  description: string
  action?: string
  activate?: boolean
}

const STEPS: TourStep[] = [
  {
    target: '[data-tour="example"]',
    title: "Начните с примера",
    description: "Кнопка «Пример из ТЗ» загружает готовый набор и показывает, как решения меняют город. Она заменит текущий набор. Можно просто продолжить экскурсию.",
    action: "Загрузить пример",
    activate: true,
  },
  {
    target: '[data-tour="measure-choice"]',
    title: "Выберите меру и район",
    description: `Внизу карточки нажмите название района или «На весь город». Соберите ${DECISION_COUNT} решений, не больше ${MAX_PER_DIRECTION} в одном направлении. Рядом с недоступными вариантами указана причина.`,
    action: "Перейти к выбору",
  },
  {
    target: '[data-tour="budget"]',
    title: "Следите за бюджетом",
    description: `Здесь видно, сколько из ${BUDGET} единиц уже потрачено. Строка остаётся наверху при прокрутке. Если денег не хватает, сначала уберите одну из выбранных мер.`,
  },
  {
    target: '[data-tour="score"]',
    title: "Смотрите, что изменилось",
    description: "Слева — исходный балл, справа — результат ваших решений. Карта обновляется вместе с ним. Под картой можно раскрыть формулу и посмотреть слабые места районов.",
  },
  {
    target: '[data-tour="analysis"]',
    title: "Получите разбор сценария",
    description: `Когда выбраны все ${DECISION_COUNT} решений, нажмите «Разобрать сценарий». Аналитик объяснит сильные стороны, риски и возможные улучшения.`,
    action: "Перейти к разбору",
  },
  {
    target: '[data-tour="events"]',
    title: "Проверьте город на прочность",
    description: "Нажмите на событие, чтобы увидеть его влияние на балл. Повторное нажатие отменяет стресс-тест. Ваш набор решений при этом сохраняется.",
    action: "Перейти к стресс-тестам",
  },
  {
    target: '[data-tour="assistant-launcher"], .assistant-sidebar[data-open="true"] header',
    title: "Помощь всегда рядом",
    description: "Эта кнопка открывает чат сбоку. Спросите, с чего начать или как улучшить сценарий. Экскурсию можно повторить кнопкой «Как пользоваться» в верхней строке.",
    action: "Открыть чат",
    activate: true,
  },
]

function findTarget(selector: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) =>
    element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden",
  )
}

type Placement = ReturnType<typeof getTourLayout> & { step: number; available: boolean }

export function GuidedTour({ onClose }: { onClose: () => void }) {
  const id = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(0)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const current = STEPS[step]
  const positioned = placement?.step === step ? placement : null

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const trigger = document.activeElement
    const scroll = { left: window.scrollX, top: window.scrollY }
    const previousOverflow = document.body.style.overflow
    document.documentElement.classList.add("tour-active")
    document.body.style.overflow = "hidden"
    dialog.showModal()
    return () => {
      dialog.close()
      document.documentElement.classList.remove("tour-active")
      document.body.style.overflow = previousOverflow
      window.scrollTo({ ...scroll, behavior: "instant" })
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    const target = findTarget(current.target)
    // На телефоне оставляем место для подсказки над выделенной кнопкой.
    const revealTarget = () => findTarget(current.target)?.scrollIntoView({
      block: window.innerWidth < 768 ? "end" : "center",
      inline: "nearest",
      behavior: "instant",
    })
    revealTarget()
    let frame = 0
    const measure = () => {
      const panel = panelRef.current
      if (!panel) return
      const activeTarget = findTarget(current.target)
      const rect = activeTarget?.getBoundingClientRect()
      const viewport = { width: window.innerWidth, height: window.innerHeight }
      const layout = getTourLayout({
        viewport,
        target: rect ?? { left: viewport.width / 2, top: 0, width: 0, height: 0 },
        panel: { width: panel.offsetWidth, height: panel.offsetHeight },
      })
      const next = { ...layout, step, available: Boolean(activeTarget) }
      setPlacement((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const resize = () => { revealTarget(); schedule() }
    const observer = new ResizeObserver(schedule)
    if (target) observer.observe(target)
    if (panelRef.current) observer.observe(panelRef.current)
    const shell = document.querySelector(".app-shell")
    if (shell) observer.observe(shell)
    window.addEventListener("resize", resize)
    window.addEventListener("scroll", schedule, true)
    schedule()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener("resize", resize)
      window.removeEventListener("scroll", schedule, true)
    }
  }, [current.target, step])

  const tryStep = () => {
    const target = findTarget(current.target)
    if (!target) return
    onClose()
    // Сначала снимаем модальность экскурсии, затем передаём управление настоящей кнопке.
    requestAnimationFrame(() => {
      if (current.activate && target instanceof HTMLButtonElement && !target.disabled) {
        target.click()
      } else {
        const control = target.matches("button:not(:disabled), a, input, summary")
          ? target
          : target.querySelector<HTMLElement>("button:not(:disabled), a, input, summary")
        target.scrollIntoView({ block: "center", behavior: "instant" })
        control?.focus({ preventScroll: true })
      }
    })
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      data-assistant-step={step === STEPS.length - 1}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"))
        const first = buttons[0]
        const last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-transparent p-0 text-foreground outline-none backdrop:bg-transparent print:hidden"
    >
      {positioned?.available ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl border-2 border-white"
          style={{ ...positioned.spotlight, boxShadow: "0 0 0 9999px rgb(14 34 30 / 0.72)" }}
        />
      ) : <div aria-hidden className="absolute inset-0 bg-foreground/75" />}

      <div
        ref={panelRef}
        className="absolute max-h-[calc(100dvh-1rem)] w-[min(360px,calc(100vw-1rem))] overflow-y-auto rounded-2xl border border-line bg-panel p-5 shadow-2xl"
        style={positioned ? positioned.panel : { left: 8, bottom: 8 }}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-accent">
            <Compass className="size-4" aria-hidden /> Знакомство с городом
          </span>
          <button type="button" onClick={onClose} aria-label="Закрыть экскурсию" className="-mr-2 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-panel-raised hover:text-foreground">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div aria-live="polite" aria-atomic="true">
          <p className="text-[11px] font-medium text-muted tabular">Шаг {step + 1} из {STEPS.length}</p>
          <h2 id={`${id}-title`} className="mt-1 text-lg font-semibold leading-snug">{current.title}</h2>
          <p id={`${id}-description`} className="mt-2 text-sm leading-relaxed text-muted">{current.description}</p>
        </div>
        <div className="mt-4 flex gap-1" aria-hidden>
          {STEPS.map((item, index) => <span key={item.target} className={`h-1 flex-1 rounded-full ${index <= step ? "bg-accent" : "bg-panel-raised"}`} />)}
        </div>
        {current.action && positioned?.available && (
          <button type="button" onClick={tryStep} className="mt-4 min-h-11 w-full rounded-xl border border-accent/25 bg-accent-soft px-3 py-2 text-sm font-semibold text-accent transition hover:border-accent/60">
            {current.action}
          </button>
        )}
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={onClose} className="min-h-10 rounded-lg px-1 text-xs text-muted hover:text-foreground">Пропустить</button>
          <div className="flex gap-2">
            <button type="button" disabled={step === 0} onClick={() => setStep((value) => value - 1)} aria-label="Предыдущий шаг" className="flex size-10 items-center justify-center rounded-xl border border-line text-muted transition hover:bg-panel-raised disabled:opacity-35">
              <ArrowLeft className="size-4" aria-hidden />
            </button>
            <button type="button" onClick={() => step === STEPS.length - 1 ? onClose() : setStep((value) => value + 1)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#066b5e]">
              {step === STEPS.length - 1 ? "Готово" : "Далее"} <ArrowRight className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </dialog>,
    document.body,
  )
}
