"use client"

import { Component, type ReactNode } from "react"

/**
 * Страховка вокруг 3D-сцены.
 *
 * WebGL есть не везде: удалённый рабочий стол, старый драйвер, отключённое
 * аппаратное ускорение в браузере — и создание контекста бросает исключение.
 * Без границы оно уронило бы весь экран симулятора вместе с расчётом и
 * таблицами, хотя к ним 3D никакого отношения не имеет.
 *
 * Отдельные GLB уже защищены внутри карты; здесь ловится отказ всей сцены.
 */
export class CanvasBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.warn("[city] 3D-сцена не запустилась, остальной интерфейс работает:", error)
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="mt-6" aria-label="Карта города">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Город</h2>
          <div className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">
            <p className="font-medium text-foreground">Трёхмерная карта не запустилась.</p>
            <p className="mt-1">
              Скорее всего, в этом браузере недоступен WebGL — так бывает при удалённом
              подключении или с отключённым аппаратным ускорением. На расчёт это не влияет:
              балл, разбор сценария и таблица районов ниже работают как обычно.
            </p>
          </div>
        </section>
      )
    }
    return this.props.children
  }
}
