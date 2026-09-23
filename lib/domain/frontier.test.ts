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
import { validateScenario } from "@/lib/engine/validate"
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
  // Смысл всей картинки: первые единицы сверх минимума дают заметно больше,
  // чем последние. Если это перестанет быть правдой, текст под графиком соврёт.
  const points = frontier.points
  const firstStep = points[1].score - points[0].score
  const tail = points[points.length - 1].score - points[1].score
  assert.ok(firstStep > tail, "текст под графиком обещает убывающую отдачу")
})
