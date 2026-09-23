"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Число, которое перетекает к новому значению вместо того, чтобы прыгнуть.
 *
 * Смысл не в красоте: когда балл меняется на 0,3, мгновенная подмена цифры
 * почти незаметна, и человек не понимает, что его решение вообще на что-то
 * повлияло. Движение делает причинно-следственную связь видимой.
 *
 * При `prefers-reduced-motion` значение ставится сразу — анимация здесь
 * служебная, а не декоративная, и без неё ничего не теряется.
 */

const DURATION = 420

/** Замедление к концу: быстрый старт и мягкая остановка читаются как «досчитал». */
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number
  /** Как показать промежуточное значение — обычно то же форматирование, что и у итогового. */
  format: (value: number) => string
  className?: string
}) {
  const [shown, setShown] = useState(value)
  const fromRef = useRef(value)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    const from = fromRef.current
    if (from === value) return

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

    // Мгновенный переход тоже проводим через кадр: синхронный setState прямо
    // в эффекте React справедливо считает лишним перерисовыванием.
    if (reduced) {
      frameRef.current = requestAnimationFrame(() => {
        fromRef.current = value
        setShown(value)
      })
      return () => {
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      }
    }

    const startedAt = performance.now()
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / DURATION)
      const eased = easeOutCubic(progress)
      setShown(from + (value - from) * eased)

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step)
      } else {
        fromRef.current = value
      }
    }

    frameRef.current = requestAnimationFrame(step)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      // Прерванную анимацию продолжаем с того места, где остановились,
      // иначе быстрые клики дёргали бы число туда-сюда.
      fromRef.current = shown
    }
    // shown намеренно не в зависимостях: иначе эффект перезапускался бы на каждый кадр.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <span className={className} aria-live="polite">
      {format(shown)}
    </span>
  )
}
