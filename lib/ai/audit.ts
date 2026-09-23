/**
 * Проверка главного обещания проекта: агент не выдумывает числа.
 *
 * Архитектура запрещает модели считать — она обязана брать цифры из ответов
 * инструментов. Но обещание, которое нельзя проверить, ничего не стоит, поэтому
 * здесь оно проверяется механически: из ответа агента вытаскиваются все числа,
 * и каждое должно найтись либо в том, что вернули инструменты, либо среди
 * констант правил игры, которые агент видит в системном сообщении.
 *
 * Чистый модуль без сети — его же используют тесты.
 */

import {
  BUDGET,
  CRITICAL_THRESHOLD,
  DECISION_COUNT,
  DISTRICTS,
  HORIZON,
  INDICATOR_META,
  INDICATORS,
  MAX_PER_DIRECTION,
  MEASURES,
} from "@/lib/domain/city"

/** Числа, которые агент вправе назвать, не спрашивая инструменты. */
function knownConstants(): Set<string> {
  const values = new Set<string>()
  const add = (value: number) => values.add(normalize(value))

  add(BUDGET)
  add(DECISION_COUNT)
  add(MAX_PER_DIRECTION)
  add(HORIZON)
  add(CRITICAL_THRESHOLD)

  for (const measure of MEASURES) {
    add(measure.cost)
    add(measure.lag)
    // Идентификаторы мер вида M12 дают числа 1..14 — это не расчёт.
    add(Number(measure.id.slice(1)))
    for (const effect of Object.values(measure.effects)) add(Math.abs(effect as number))
  }

  for (const district of DISTRICTS) {
    add(district.population)
    add(Math.round(district.population * 100))
    for (const indicator of INDICATORS) add(district.values[indicator])
  }

  for (const indicator of INDICATORS) add(INDICATOR_META[indicator].weight)

  // Доли формулы и порядковые номера пунктов в списке.
  for (const value of [0, 0.3, 0.7, 1, 2, 3, 4, 5, 30, 70, 100]) add(value)

  return values
}

const CONSTANTS = knownConstants()

/** «56,54» и «56.54» — одно и то же число; хвостовые нули не считаются отличием. */
function normalize(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}

/** Вытаскивает все числа из текста, включая записанные через запятую. */
export function extractNumbers(text: string): number[] {
  const matches = text.match(/-?\d+(?:[.,]\d+)?/g) ?? []
  return matches
    .map((token) => Number(token.replace(",", ".")))
    .filter((value) => Number.isFinite(value))
}

export interface AuditResult {
  ok: boolean
  /** Числа из ответа, которых нет ни в выводе инструментов, ни в константах. */
  invented: number[]
  checked: number
}

/**
 * Сверяет числа из ответа агента с тем, что вернули инструменты.
 *
 * @param reply — текст, который агент показал пользователю
 * @param toolOutputs — сырые JSON-ответы инструментов за этот диалог
 */
export function auditReply(reply: string, toolOutputs: string[]): AuditResult {
  const grounded = new Set(CONSTANTS)
  for (const output of toolOutputs) {
    for (const value of extractNumbers(output)) grounded.add(normalize(value))
  }

  const numbers = extractNumbers(reply)
  const invented: number[] = []

  for (const value of numbers) {
    if (grounded.has(normalize(value))) continue
    // Модель вправе округлить: 56.54 → «примерно 56.5» остаётся честным числом.
    const rounded = Math.round(value * 10) / 10
    const nearby = [...grounded].some((candidate) => {
      const parsed = Number(candidate)
      return Number.isFinite(parsed) && Math.abs(Math.round(parsed * 10) / 10 - rounded) < 0.051
    })
    if (nearby) continue
    invented.push(value)
  }

  return { ok: invented.length === 0, invented, checked: numbers.length }
}
