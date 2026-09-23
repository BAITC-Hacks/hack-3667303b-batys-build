/**
 * Вклад каждого решения в итоговый балл.
 *
 * Простая разность «с мерой минус без меры» врёт, когда работают синергии:
 * бонус пары достаётся той мере, которую убрали последней. Поэтому считаем
 * значение Шепли — усреднение по всем порядкам добавления. Решений всего пять,
 * значит подмножеств 32 штуки, и честный расчёт стоит доли миллисекунды.
 */

import { DISTRICTS, MEASURE_BY_ID, type Decision } from "@/lib/domain/city"
import { rawScore } from "@/lib/engine/score"

export interface Contribution {
  measureId: string
  measureName: string
  district: string
  cost: number
  /** Вклад в балл по Шепли. */
  shapley: number
  /** Сколько балла даёт каждая условная единица бюджета. */
  perUnit: number
}

const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1))

export function attribute(decisions: Decision[]): Contribution[] {
  const n = decisions.length
  if (n === 0) return []

  // Значение коалиции для каждой битовой маски подмножества.
  const value = new Float64Array(1 << n)
  for (let mask = 0; mask < 1 << n; mask++) {
    const subset: Decision[] = []
    for (let i = 0; i < n; i++) if (mask & (1 << i)) subset.push(decisions[i])
    value[mask] = rawScore(subset)
  }

  const nFactorial = factorial(n)

  return decisions.map((decision, i) => {
    let shapley = 0
    for (let mask = 0; mask < 1 << n; mask++) {
      if (mask & (1 << i)) continue
      const size = countBits(mask)
      const weight = (factorial(size) * factorial(n - size - 1)) / nFactorial
      shapley += weight * (value[mask | (1 << i)] - value[mask])
    }

    const measure = MEASURE_BY_ID.get(decision.measureId)!
    const rounded = Math.round(shapley * 100) / 100
    return {
      measureId: measure.id,
      measureName: measure.name,
      district:
        measure.scope === "city"
          ? "весь город"
          : (DISTRICTS.find((d) => d.id === decision.districtId)?.name ?? "—"),
      cost: measure.cost,
      shapley: rounded,
      perUnit: Math.round((shapley / measure.cost) * 1000) / 1000,
    }
  })
}

function countBits(mask: number): number {
  let count = 0
  let value = mask
  while (value) {
    value &= value - 1
    count++
  }
  return count
}
