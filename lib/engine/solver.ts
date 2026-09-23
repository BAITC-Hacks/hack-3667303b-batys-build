/**
 * Полный перебор пространства решений.
 *
 * Пространство маленькое: 14 мероприятий по 5, у «районных» мер ещё выбор из 5 районов.
 * После отсечения по бюджету, лимиту направлений и глобальному конфликту остаётся
 * порядка 700 тысяч валидных сценариев — это секунды работы процессора.
 *
 * Именно поэтому оптимизацией занимается код, а не языковая модель: агент вызывает
 * solve() как инструмент и получает точный ответ вместо правдоподобной выдумки.
 */

import {
  BUDGET,
  CONFLICTS,
  DECISION_COUNT,
  DISTRICT_IDS,
  MAX_PER_DIRECTION,
  MEASURES,
  MEASURE_BY_ID,
  type Decision,
  type Direction,
  type DistrictId,
  type Measure,
  type MeasureId,
} from "@/lib/domain/city"
import { rawScore } from "@/lib/engine/score"

export interface SolveOptions {
  /** Потолок расходов, по умолчанию 100. */
  budget?: number
  /** Решения, которые обязаны войти в сценарий. */
  include?: Decision[]
  /** Мероприятия, которые запрещено использовать. */
  exclude?: MeasureId[]
  /** Сколько лучших сценариев вернуть. */
  limit?: number
}

export interface SolveResult {
  decisions: Decision[]
  score: number
  cost: number
}

const GLOBAL_CONFLICTS = CONFLICTS.filter((c) => c.kind === "global").map((c) => c.pair)
const DISTRICT_CONFLICTS = CONFLICTS.filter((c) => c.kind === "district").map((c) => c.pair)

/** Перебирает сочетания по k без повторов. */
function* combinations<T>(items: T[], k: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) {
    yield acc
    return
  }
  for (let i = start; i <= items.length - (k - acc.length); i++) {
    yield* combinations(items, k, i + 1, [...acc, items[i]])
  }
}

/**
 * Находит лучшие сценарии при заданных ограничениях.
 * Отсечение идёт до раскладки по районам: сначала отбрасываем сочетания
 * по стоимости, лимиту направлений и конфликту M1/M3, и только выжившие
 * разворачиваем по районам.
 */
export function solve(options: SolveOptions = {}): SolveResult[] {
  const budget = options.budget ?? BUDGET
  const include = options.include ?? []
  const excluded = new Set(options.exclude ?? [])
  const limit = options.limit ?? 5

  for (const decision of include) excluded.add(decision.measureId)

  const available = MEASURES.filter((m) => !excluded.has(m.id))
  const need = DECISION_COUNT - include.length
  if (need < 0) return []

  const fixedCost = include.reduce((sum, d) => sum + (MEASURE_BY_ID.get(d.measureId)?.cost ?? 0), 0)
  const fixedDirections = new Map<Direction, number>()
  for (const decision of include) {
    const measure = MEASURE_BY_ID.get(decision.measureId)
    if (measure) fixedDirections.set(measure.direction, (fixedDirections.get(measure.direction) ?? 0) + 1)
  }
  const fixedIds = new Set(include.map((d) => d.measureId))

  const best: SolveResult[] = []
  const consider = (decisions: Decision[], cost: number) => {
    const score = rawScore(decisions)
    if (best.length >= limit && score <= best[best.length - 1].score) return
    const entry: SolveResult = { decisions, score, cost }
    let index = best.findIndex((item) => item.score < score)
    if (index === -1) index = best.length
    best.splice(index, 0, entry)
    if (best.length > limit) best.pop()
  }

  for (const combo of combinations(available, need)) {
    const cost = fixedCost + combo.reduce((sum, m) => sum + m.cost, 0)
    if (cost > budget) continue

    const directions = new Map(fixedDirections)
    let directionOk = true
    for (const measure of combo) {
      const next = (directions.get(measure.direction) ?? 0) + 1
      if (next > MAX_PER_DIRECTION) {
        directionOk = false
        break
      }
      directions.set(measure.direction, next)
    }
    if (!directionOk) continue

    const ids = new Set([...fixedIds, ...combo.map((m) => m.id)])
    if (GLOBAL_CONFLICTS.some(([a, b]) => ids.has(a) && ids.has(b))) continue

    // Раскладываем по районам только выжившие сочетания.
    const slots = combo.map((measure) => (measure.scope === "district" ? DISTRICT_IDS : [null]))
    expand(combo, slots, 0, [], (assignment) => {
      const decisions = [...include, ...assignment]
      if (hasDistrictConflict(decisions)) return
      consider(decisions, cost)
    })
  }

  return best
}

function expand(
  measures: Measure[],
  slots: Array<Array<DistrictId | null>>,
  index: number,
  acc: Decision[],
  emit: (assignment: Decision[]) => void,
): void {
  if (index === measures.length) {
    emit([...acc])
    return
  }
  for (const districtId of slots[index]) {
    acc.push({ measureId: measures[index].id, districtId })
    expand(measures, slots, index + 1, acc, emit)
    acc.pop()
  }
}

function hasDistrictConflict(decisions: Decision[]): boolean {
  for (const [a, b] of DISTRICT_CONFLICTS) {
    const first = decisions.find((d) => d.measureId === a)
    const second = decisions.find((d) => d.measureId === b)
    if (first && second && first.districtId && first.districtId === second.districtId) return true
  }
  return false
}

/** Лучший сценарий при текущих ограничениях. */
export const optimize = (options: SolveOptions = {}): SolveResult | null => solve({ ...options, limit: 1 })[0] ?? null
