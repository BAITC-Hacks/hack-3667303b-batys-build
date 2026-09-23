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

import { BASE_SCORE, scoreScenario } from "@/lib/engine/score"
import { solve } from "@/lib/engine/solver"

const STEPS = [40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]

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

const payload = {
  baseScore: Math.round(BASE_SCORE * 100) / 100,
  generatedAt: new Date().toISOString().slice(0, 10),
  points,
}

const out = path.join(process.cwd(), "lib", "domain", "frontier.json")
fs.writeFileSync(out, JSON.stringify(payload, null, 2) + "\n", "utf8")
console.log(`\nГотово за ${((Date.now() - started) / 1000).toFixed(1)} с → ${out}`)
