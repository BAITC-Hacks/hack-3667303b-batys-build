/**
 * Контракт ответа модели. Проверяем, что мусор не проходит, а валидный ответ
 * разбирается — именно на этом держится обещание «ИИ не может сломать продукт».
 */

import assert from "node:assert/strict"
import test from "node:test"

import type { Decision } from "@/lib/domain/city"
import { describeScenario, readExplanation } from "@/lib/ai/explain"
import { attribute } from "@/lib/engine/attribution"
import { scoreScenario } from "@/lib/engine/score"

const EXAMPLE: Decision[] = [
  { measureId: "M7", districtId: "nura" },
  { measureId: "M8", districtId: "nura" },
  { measureId: "M10", districtId: "nura" },
  { measureId: "M12", districtId: null },
  { measureId: "M5", districtId: "saryarka" },
]

const VALID = JSON.stringify({
  summary: "Сценарий набрал 56.54 балла против 52.56 без вмешательства.",
  strengths: ["Закрыты провалы по школам и поликлиникам в Нуре."],
  risks: ["Слабейшим районом осталась Нура."],
  tradeoff: "Деньги ушли в один район.",
})

test("ответ модели разбирается даже в markdown-обёртке", () => {
  const parsed = readExplanation("Вот разбор:\n```json\n" + VALID + "\n```\nГотово.")
  assert.ok(parsed)
  assert.equal(parsed.strengths.length, 1)
  assert.equal(parsed.risks.length, 1)
})

test("ответ не по контракту отбрасывается", () => {
  assert.equal(readExplanation(null), null)
  assert.equal(readExplanation("просто текст без json"), null)
  assert.equal(readExplanation("{сломанный json"), null)
  // Пустые списки и слишком короткое summary — не контракт.
  assert.equal(readExplanation(JSON.stringify({ summary: "мало", strengths: [], risks: [] })), null)
  assert.equal(
    readExplanation(JSON.stringify({ summary: "x".repeat(30), strengths: ["ок"], risks: [] })),
    null,
  )
  // Массив вместо объекта.
  assert.equal(readExplanation("[1,2,3]"), null)
})

test("детерминированный разбор работает без модели и называет главные числа", () => {
  const breakdown = scoreScenario(EXAMPLE)
  const summary = describeScenario(breakdown, attribute(EXAMPLE))

  assert.equal(summary.source, "engine")
  assert.ok(summary.summary.includes("56,54"))
  assert.ok(summary.summary.includes("52,56"))
  assert.ok(summary.strengths.length > 0)
  assert.ok(summary.risks.length > 0)
  // Слабейший район обязан быть назван: на нём висит 30% итога.
  assert.ok(summary.risks.some((risk) => risk.includes("Нура")))
})

test("разбор отдельно проговаривает стресс-тест", () => {
  const breakdown = scoreScenario(EXAMPLE, {
    id: "test",
    name: "Проверочная авария",
    description: "",
    mitigation: "Резервные мощности помогли бы.",
    scope: "city",
    districtId: null,
    effects: { C1: -10 },
  })
  const summary = describeScenario(breakdown, attribute(EXAMPLE))
  assert.ok(summary.risks.some((risk) => risk.includes("Проверочная авария")))
})
