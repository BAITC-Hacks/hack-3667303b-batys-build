"use client"

import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

/**
 * Мягкое появление блока при попадании в поле зрения.
 *
 * Намеренно сдержанно: сдвиг на десять пикселей и четыреста миллисекунд,
 * один раз за жизнь элемента. Длинные вылеты и параллакс в инструменте,
 * где читают цифры, только мешают — глаз должен цепляться за данные,
 * а не за движение.
 *
 * Содержимое видно всегда: анимируются только прозрачность и сдвиг, поэтому
 * без JavaScript или при отключённой анимации блок просто стоит на месте.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode
  /** Задержка в миллисекундах — для каскада соседних блоков. */
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    // Отключённое движение отдельной ветки не требует: переходы гасятся в
    // globals.css, и блок просто появляется без сдвига. Обрабатываем только
    // отсутствие наблюдателя — там показываем сразу, следующим кадром.
    if (typeof IntersectionObserver === "undefined") {
      const frame = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(frame)
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setVisible(true)
        observer.disconnect()
      },
      // Небольшой отступ снизу: блок проявляется чуть раньше, чем доедет до края.
      { rootMargin: "0px 0px -40px 0px", threshold: 0.05 },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      style={{ transitionDelay: visible ? `${delay}ms` : undefined }}
      className={cn(
        "transition-[opacity,transform] duration-[400ms] ease-out motion-reduce:transition-none",
        visible ? "translate-y-0 opacity-100" : "translate-y-2.5 opacity-0",
        className,
      )}
    >
      {children}
    </div>
  )
}
