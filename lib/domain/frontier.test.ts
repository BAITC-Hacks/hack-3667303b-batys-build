/**
 * Граница достижимого лежит в репозитории готовым JSON, поэтому её легко
 * забыть пересчитать после правки данных. Тест ловит именно это: кривая
 * обязана совпадать с тем, что движок считает прямо сейчас.
 */

import assert from "node:assert/strict"
import test from "node:test"

import frontier from "@/lib/domain/frontier.json"
import { BASE_SCORE, scoreScenario } from "@/lib/engine/score"
import { solve } from "@/lib/engine/solver"
import { totalCost, validateScenario } from "@/lib/engine/validate"
import type { Decision } from "@/lib/domain/city"

test("кривая не убывает с ростом бюджета", () => {
  assert.ok(frontier.points.length >= 5)
  for (let i = 1; i < frontier.points.length; i++) {
    const previous = frontier.points[i - 1]
    const current = frontier.points[i]
    assert.ok(current.budget > previous.budget)
    // Больший потолок расходов не может дать худший результат: прежний набор
    // остаётся допустимым, значит потолок только растёт или стоит на месте.
    assert.ok(current.score >= previous.score, `${current.budget} хуже, чем ${previous.budget}`)
  }
})

test("каждая точка кривой — валидный набор с заявленным баллом", () => {
  for (const point of frontier.points) {
    const decisions = point.decisions as Decision[]
    assert.deepEqual(validateScenario(decisions), [], `набор для бюджета ${point.budget} невалиден`)
    assert.ok(point.cost <= point.budget)
    assert.equal(scoreScenario(decisions).score, point.score)
  }
})

test("кривая не отстала от движка", () => {
  assert.equal(frontier.baseScore, Math.round(BASE_SCORE * 100) / 100)

  const last = frontier.points[frontier.points.length - 1]
  const best = solve({ budget: last.budget, limit: 1 })[0]
  assert.equal(Math.round(best.score * 100) / 100, last.score, "пересчитайте: pnpm frontier")
})

test("отдача от бюджета падает", () => {
  // Смысл всей картинки: единица бюджета в начале кривой покупает заметно больше
  // балла, чем в конце. Считаем именно скорость, а не прирост на отрезке —
  // отрезки разной длины, и сравнивать их напрямую было бы враньём.
  const points = frontier.points
  const knee = points.find((point) => point.budget >= 70) ?? points[points.length - 1]
  const last = points[points.length - 1]

  const earlyRate = (knee.score - points[0].score) / (knee.budget - points[0].budget)
  const lateRate = (last.score - knee.score) / (last.budget - knee.budget)

  assert.ok(earlyRate > lateRate * 2, "текст под графиком обещает резко убывающую отдачу")
})

test("минимальная стоимость допустимого набора совпадает с ТЗ", () => {
  // ТЗ: «Самый дешёвый набор M9 + M11 + M10 + M12 + M4 стоит 61».
  assert.equal(frontier.minimumCost, 61)

  const cheapest: Decision[] = [
    { measureId: "M9", districtId: "esil" },
    { measureId: "M11", districtId: "esil" },
    { measureId: "M10", districtId: "esil" },
    { measureId: "M12", districtId: null },
    { measureId: "M4", districtId: "esil" },
  ]
  assert.deepEqual(validateScenario(cheapest), [])
  assert.equal(totalCost(cheapest), 61)

  // Кривая обязана начинаться ровно там, где появляются допустимые наборы.
  assert.equal(frontier.points[0].budget, frontier.minimumCost)
})
