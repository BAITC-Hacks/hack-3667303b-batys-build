/**
 * Расчёт Astana Quality of Life Score.
 *
 * Формула из ТЗ, шаг за шагом:
 *   1. I'[d][k] = clip(I[d][k] + Σ эффект × (H − лаг)/H + синергии, 0, 100)
 *   2. D[d]     = Σ w[k] × I'[d][k]
 *   3. D_avg    = Σ доля_населения[d] × D[d]
 *   4. Score    = 0.7 × D_avg + 0.3 × min(D[d]) − 1.0 × N_crit
 *
 * Здесь живут ВСЕ числа симулятора. Языковая модель не считает ничего —
 * она получает готовый ScenarioBreakdown и только описывает его словами.
 */

import {
  CRITICAL_THRESHOLD,
  DISTRICTS,
  HORIZON,
  INDICATORS,
  INDICATOR_META,
  MEASURE_BY_ID,
  SYNERGIES,
  type Decision,
  type DistrictId,
  type Indicator,
  type MeasureId,
} from "@/lib/domain/city"
import { totalCost } from "@/lib/engine/validate"

const D_COUNT = DISTRICTS.length
const I_COUNT = INDICATORS.length

const WEIGHTS = INDICATORS.map((k) => INDICATOR_META[k].weight)
const POPULATION = DISTRICTS.map((d) => d.population)
const DISTRICT_INDEX = new Map<DistrictId, number>(DISTRICTS.map((d, i) => [d.id, i]))
const INDICATOR_INDEX = new Map<Indicator, number>(INDICATORS.map((k, i) => [k, i]))

/** Базовые значения, разложенные в плоский массив: индекс = район × 10 + показатель. */
const BASE_VALUES = (() => {
  const flat = new Float64Array(D_COUNT * I_COUNT)
  DISTRICTS.forEach((district, d) => {
    INDICATORS.forEach((indicator, k) => {
      flat[d * I_COUNT + k] = district.values[indicator]
    })
  })
  return flat
})()

const clip = (value: number) => (value < 0 ? 0 : value > 100 ? 100 : value)

/**
 * Применяет решения к базовым значениям. Горячий путь: солвер зовёт это
 * сотни тысяч раз, поэтому работаем с плоским Float64Array без аллокаций объектов.
 */
function applyDecisions(decisions: Decision[]): Float64Array {
  const values = BASE_VALUES.slice()
  const chosen = new Set<MeasureId>()

  for (const decision of decisions) {
    const measure = MEASURE_BY_ID.get(decision.measureId)
    if (!measure) continue
    chosen.add(measure.id)

    const factor = (HORIZON - measure.lag) / HORIZON
    const targets =
      measure.scope === "city"
        ? undefined
        : decision.districtId
          ? [DISTRICT_INDEX.get(decision.districtId)!]
          : []

    for (const [indicator, effect] of Object.entries(measure.effects)) {
      const k = INDICATOR_INDEX.get(indicator as Indicator)!
      const delta = (effect as number) * factor
      if (targets === undefined) {
        for (let d = 0; d < D_COUNT; d++) values[d * I_COUNT + k] += delta
      } else {
        for (const d of targets) values[d * I_COUNT + k] += delta
      }
    }
  }

  // Синергия не масштабируется лагом. Для пары с «районной» первой мерой
  // бонус падает в её район, для «городской» — во все районы сразу.
  for (const synergy of SYNERGIES) {
    if (!synergy.pair.every((id) => chosen.has(id))) continue
    const anchor = decisions.find((d) => d.measureId === synergy.pair[0])
    if (!anchor) continue
    const k = INDICATOR_INDEX.get(synergy.indicator)!
    const anchorMeasure = MEASURE_BY_ID.get(anchor.measureId)!
    if (anchorMeasure.scope === "city") {
      for (let d = 0; d < D_COUNT; d++) values[d * I_COUNT + k] += synergy.bonus
    } else if (anchor.districtId) {
      values[DISTRICT_INDEX.get(anchor.districtId)! * I_COUNT + k] += synergy.bonus
    }
  }

  for (let i = 0; i < values.length; i++) values[i] = clip(values[i])
  return values
}

/** Быстрый путь: только итоговый балл. Используется солвером при переборе. */
export function rawScore(decisions: Decision[]): number {
  const values = applyDecisions(decisions)
  let dAvg = 0
  let dMin = Infinity
  let critical = 0

  for (let d = 0; d < D_COUNT; d++) {
    let districtScore = 0
    for (let k = 0; k < I_COUNT; k++) {
      const value = values[d * I_COUNT + k]
      districtScore += WEIGHTS[k] * value
      if (value < CRITICAL_THRESHOLD) critical++
    }
    dAvg += POPULATION[d] * districtScore
    if (districtScore < dMin) dMin = districtScore
  }

  return 0.7 * dAvg + 0.3 * dMin - critical
}

/** Балл ничего не делающего сценария — точка отсчёта для всех дельт. */
export const BASE_SCORE = rawScore([])

export interface IndicatorBreakdown {
  key: Indicator
  label: string
  before: number
  after: number
  delta: number
  /** Значение ниже 40 после всех эффектов — штраф 1 балл. */
  critical: boolean
  wasCritical: boolean
}

export interface DistrictBreakdown {
  id: DistrictId
  name: string
  population: number
  profile: string
  before: number
  after: number
  delta: number
  isWeakest: boolean
  indicators: IndicatorBreakdown[]
}

export interface ScenarioBreakdown {
  score: number
  baseScore: number
  delta: number
  dAvg: number
  weakest: { id: DistrictId; name: string; value: number }
  criticalCount: number
  criticalPairs: Array<{ district: string; indicator: string; value: number }>
  fixedCriticals: Array<{ district: string; indicator: string }>
  cost: number
  budgetLeft: number
  synergies: Array<{ label: string; indicator: string; bonus: number; district: string }>
  districts: DistrictBreakdown[]
  decisions: Array<{
    measureId: MeasureId
    measureName: string
    direction: string
    district: string
    cost: number
    lag: number
    /** Доля эффекта, которая успевает реализоваться за горизонт в 8 кварталов. */
    realized: number
  }>
}

const round = (value: number, digits = 2) => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/**
 * Полный разбор сценария: все числа, которые нужны интерфейсу и языковой модели.
 * Это единственный числовой вход для ИИ — считать ему больше нечего.
 */
export function scoreScenario(decisions: Decision[]): ScenarioBreakdown {
  const after = applyDecisions(decisions)
  const before = BASE_VALUES

  const districts: DistrictBreakdown[] = []
  const criticalPairs: ScenarioBreakdown["criticalPairs"] = []
  const fixedCriticals: ScenarioBreakdown["fixedCriticals"] = []
  let dAvg = 0
  let dMin = Infinity
  let weakestIndex = 0
  let criticalCount = 0

  DISTRICTS.forEach((district, d) => {
    const indicators: IndicatorBreakdown[] = []
    let scoreBefore = 0
    let scoreAfter = 0

    INDICATORS.forEach((indicator, k) => {
      const valueBefore = before[d * I_COUNT + k]
      const valueAfter = after[d * I_COUNT + k]
      scoreBefore += WEIGHTS[k] * valueBefore
      scoreAfter += WEIGHTS[k] * valueAfter

      const isCritical = valueAfter < CRITICAL_THRESHOLD
      const wasCritical = valueBefore < CRITICAL_THRESHOLD
      if (isCritical) {
        criticalCount++
        criticalPairs.push({
          district: district.name,
          indicator: INDICATOR_META[indicator].label,
          value: round(valueAfter, 1),
        })
      }
      if (wasCritical && !isCritical) {
        fixedCriticals.push({ district: district.name, indicator: INDICATOR_META[indicator].label })
      }

      indicators.push({
        key: indicator,
        label: INDICATOR_META[indicator].label,
        before: round(valueBefore, 1),
        after: round(valueAfter, 1),
        delta: round(valueAfter - valueBefore, 1),
        critical: isCritical,
        wasCritical,
      })
    })

    dAvg += district.population * scoreAfter
    if (scoreAfter < dMin) {
      dMin = scoreAfter
      weakestIndex = d
    }

    districts.push({
      id: district.id,
      name: district.name,
      population: district.population,
      profile: district.profile,
      before: round(scoreBefore),
      after: round(scoreAfter),
      delta: round(scoreAfter - scoreBefore),
      isWeakest: false,
      indicators,
    })
  })

  districts[weakestIndex].isWeakest = true

  const chosen = new Set(decisions.map((d) => d.measureId))
  const synergies = SYNERGIES.filter((s) => s.pair.every((id) => chosen.has(id))).map((s) => {
    const anchor = decisions.find((d) => d.measureId === s.pair[0])
    const anchorMeasure = anchor ? MEASURE_BY_ID.get(anchor.measureId) : undefined
    return {
      label: s.label,
      indicator: INDICATOR_META[s.indicator].label,
      bonus: s.bonus,
      district:
        anchorMeasure?.scope === "city"
          ? "весь город"
          : (DISTRICTS.find((d) => d.id === anchor?.districtId)?.name ?? "—"),
    }
  })

  const cost = totalCost(decisions)
  const score = 0.7 * dAvg + 0.3 * dMin - criticalCount

  return {
    score: round(score),
    baseScore: round(BASE_SCORE),
    delta: round(score - BASE_SCORE),
    dAvg: round(dAvg),
    weakest: {
      id: DISTRICTS[weakestIndex].id,
      name: DISTRICTS[weakestIndex].name,
      value: round(dMin),
    },
    criticalCount,
    criticalPairs,
    fixedCriticals,
    cost,
    budgetLeft: 100 - cost,
    synergies,
    districts,
    decisions: decisions.map((decision) => {
      const measure = MEASURE_BY_ID.get(decision.measureId)!
      return {
        measureId: measure.id,
        measureName: measure.name,
        direction: measure.direction,
        district:
          measure.scope === "city"
            ? "весь город"
            : (DISTRICTS.find((d) => d.id === decision.districtId)?.name ?? "—"),
        cost: measure.cost,
        lag: measure.lag,
        realized: round((HORIZON - measure.lag) / HORIZON, 3),
      }
    }),
  }
}
