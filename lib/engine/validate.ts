/**
 * Валидатор набора решений. Невалидный набор не считается — вместо балла
 * возвращается причина отказа, как того требует ТЗ.
 *
 * Модуль чистый: никаких сетевых вызовов и ввода-вывода, только правила.
 */

import {
  BUDGET,
  CONFLICTS,
  DECISION_COUNT,
  DIRECTION_LABELS,
  MAX_PER_DIRECTION,
  MEASURE_BY_ID,
  type Decision,
  type DistrictId,
  type Measure,
} from "@/lib/domain/city"

export interface Violation {
  code:
    | "count"
    | "duplicate"
    | "budget"
    | "direction"
    | "missing_district"
    | "unexpected_district"
    | "conflict"
    | "unknown_measure"
  message: string
}

export const totalCost = (decisions: Decision[]): number =>
  decisions.reduce((sum, d) => sum + (MEASURE_BY_ID.get(d.measureId)?.cost ?? 0), 0)

/**
 * Проверяет набор решений.
 * @param partial — режим черновика: не требует ровно 5 решений (пользователь ещё набирает).
 */
export function validateScenario(decisions: Decision[], partial = false): Violation[] {
  const violations: Violation[] = []

  for (const decision of decisions) {
    if (!MEASURE_BY_ID.has(decision.measureId)) {
      violations.push({ code: "unknown_measure", message: `Неизвестное мероприятие ${decision.measureId}` })
    }
  }
  if (violations.length) return violations

  if (!partial && decisions.length !== DECISION_COUNT) {
    violations.push({
      code: "count",
      message: `Нужно ровно ${DECISION_COUNT} решений, сейчас ${decisions.length}`,
    })
  }
  if (partial && decisions.length > DECISION_COUNT) {
    violations.push({ code: "count", message: `Больше ${DECISION_COUNT} решений принять нельзя` })
  }

  const seen = new Set<string>()
  for (const decision of decisions) {
    if (seen.has(decision.measureId)) {
      const measure = MEASURE_BY_ID.get(decision.measureId)
      violations.push({ code: "duplicate", message: `«${measure?.name}» выбрано дважды` })
    }
    seen.add(decision.measureId)
  }

  const cost = totalCost(decisions)
  if (cost > BUDGET) {
    violations.push({ code: "budget", message: `Бюджет превышен: ${cost} из ${BUDGET}` })
  }

  const byDirection = new Map<string, number>()
  for (const decision of decisions) {
    const measure = MEASURE_BY_ID.get(decision.measureId)
    if (!measure) continue
    byDirection.set(measure.direction, (byDirection.get(measure.direction) ?? 0) + 1)
  }
  for (const [direction, count] of byDirection) {
    if (count > MAX_PER_DIRECTION) {
      violations.push({
        code: "direction",
        message: `По направлению «${DIRECTION_LABELS[direction as keyof typeof DIRECTION_LABELS]}» можно не больше ${MAX_PER_DIRECTION} мер, выбрано ${count}`,
      })
    }
  }

  for (const decision of decisions) {
    const measure = MEASURE_BY_ID.get(decision.measureId)
    if (!measure) continue
    if (measure.scope === "district" && !decision.districtId) {
      violations.push({ code: "missing_district", message: `Для «${measure.name}» не выбран район` })
    }
    if (measure.scope === "city" && decision.districtId) {
      violations.push({ code: "unexpected_district", message: `«${measure.name}» действует на весь город, район не указывается` })
    }
  }

  const districtOf = (id: string): DistrictId | null | undefined =>
    decisions.find((d) => d.measureId === id)?.districtId

  for (const conflict of CONFLICTS) {
    const [a, b] = conflict.pair
    if (!seen.has(a) || !seen.has(b)) continue
    if (conflict.kind === "global") {
      violations.push({ code: "conflict", message: conflict.reason })
    } else if (districtOf(a) && districtOf(a) === districtOf(b)) {
      violations.push({ code: "conflict", message: conflict.reason })
    }
  }

  return violations
}

/**
 * Можно ли добавить меру к текущему черновику. Возвращает причину отказа или null.
 * Используется интерфейсом, чтобы гасить недоступные карточки до клика.
 */
export function canAdd(
  decisions: Decision[],
  measure: Measure,
  districtId: DistrictId | null,
): string | null {
  const next: Decision[] = [...decisions, { measureId: measure.id, districtId }]
  const violations = validateScenario(next, true)
  return violations.length ? violations[0].message : null
}
