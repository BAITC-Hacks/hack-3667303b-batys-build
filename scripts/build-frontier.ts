/**
 * Считает границу достижимого: какой максимальный балл можно получить при каждом
 * уровне бюджета. Запуск: pnpm frontier
 *
 * Перебор одного уровня занимает секунды, поэтому кривая считается заранее и
 * кладётся в lib/domain/frontier.json — страница получает её мгновенно.
 * Пересчитывать нужно только если менялись данные в lib/domain/city.ts.
 */

import fs from "node:fs"
import path from "node:path"

import { DISTRICT_IDS, MEASURES, type Decision, type DistrictId } from "@/lib/domain/city"
import { BASE_SCORE, scoreScenario } from "@/lib/engine/score"
import { solve } from "@/lib/engine/solver"
import { validateScenario } from "@/lib/engine/validate"

// Шаг мельче у левого края: допустимые наборы появляются только с 61 единицы,
// и самый интересный участок кривой — сразу за этой границей.
const STEPS = [61, 62, 63, 64, 65, 70, 75, 80, 85, 90, 95, 100]

interface FrontierPoint {
  budget: number
  score: number
  /** Прирост к базовому баллу города. */
  delta: number
  /** Сколько на самом деле потрачено: лучший набор не всегда тратит потолок. */
  cost: number
  decisions: Array<{ measureId: string; districtId: string | null }>
}

const started = Date.now()
const points: FrontierPoint[] = []

for (const budget of STEPS) {
  const best = solve({ budget, limit: 1 })[0]
  if (!best) {
    console.log(`${budget}: допустимых наборов нет`)
    continue
  }
  const breakdown = scoreScenario(best.decisions)
  points.push({
    budget,
    score: breakdown.score,
    delta: breakdown.delta,
    cost: breakdown.cost,
    decisions: best.decisions,
  })
  console.log(`${String(budget).padStart(3)} → ${breakdown.score.toFixed(2)} (потрачено ${breakdown.cost})`)
}

/**
 * Самый дешёвый допустимый набор. Это не то же самое, что стоимость лучшего
 * набора при малом бюджете: минимум по деньгам и максимум по баллу — разные
 * задачи, и путать их нельзя.
 */
function cheapestValid(): { cost: number; decisions: Decision[] } {
  function* combos<T>(items: T[], k: number, start = 0, acc: T[] = []): Generator<T[]> {
    if (acc.length === k) {
      yield acc
      return
    }
    for (let i = start; i <= items.length - (k - acc.length); i++) {
      yield* combos(items, k, i + 1, [...acc, items[i]])
    }
  }

  let best: { cost: number; decisions: Decision[] } | null = null
  for (const combo of combos(MEASURES, 5)) {
    const cost = combo.reduce((sum, m) => sum + m.cost, 0)
    if (best && cost >= best.cost) continue

    // Достаточно найти хотя бы одну раскладку по районам без конфликтов.
    const assign = (index: number, acc: Decision[]): Decision[] | null => {
      if (index === combo.length) return validateScenario(acc).length ? null : acc
      const options: Array<DistrictId | null> = combo[index].scope === "district" ? DISTRICT_IDS : [null]
      for (const districtId of options) {
        const found = assign(index + 1, [...acc, { measureId: combo[index].id, districtId }])
        if (found) return found
      }
      return null
    }

    const decisions = assign(0, [])
    if (decisions) best = { cost, decisions }
  }
  return best!
}

const cheapest = cheapestValid()
console.log(`
Самый дешёвый допустимый набор: ${cheapest.cost}`)

const payload = {
  baseScore: Math.round(BASE_SCORE * 100) / 100,
  minimumCost: cheapest.cost,
  generatedAt: new Date().toISOString().slice(0, 10),
  points,
}

const out = path.join(process.cwd(), "lib", "domain", "frontier.json")
fs.writeFileSync(out, JSON.stringify(payload, null, 2) + "\n", "utf8")
console.log(`\nГотово за ${((Date.now() - started) / 1000).toFixed(1)} с → ${out}`)
