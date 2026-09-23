import assert from "node:assert/strict"
import test from "node:test"

import { describeScenario } from "@/lib/ai/explain"
import { agentResponseSchema, apiErrorSchema, explanationResponseSchema } from "@/lib/ai/schema"
import type { Decision } from "@/lib/domain/city"
import { attribute } from "@/lib/engine/attribution"
import { scoreScenario } from "@/lib/engine/score"

const EXAMPLE: Decision[] = [
  { measureId: "M7", districtId: "nura" },
  { measureId: "M8", districtId: "nura" },
  { measureId: "M10", districtId: "nura" },
  { measureId: "M12", districtId: null },
  { measureId: "M5", districtId: "saryarka" },
]

test("советник принимает ответ без предложения и корректный сценарий для применения", () => {
  const reply = { reply: "Можно начать с районов с низкими показателями.", trace: [], suggestion: null }
  assert.ok(agentResponseSchema.safeParse(reply).success)
  assert.ok(agentResponseSchema.safeParse({ ...reply, suggestion: EXAMPLE }).success)
})

test("мусор и ответ с ошибкой не могут превратиться в сообщение советника", () => {
  for (const payload of [
    null,
    { error: "Сервис недоступен" },
    { reply: " ", trace: [], suggestion: null },
    { reply: "Ответ", trace: null, suggestion: null },
    { reply: "Ответ", trace: [{ name: "optimize", summary: {} }], suggestion: null },
  ]) {
    assert.equal(agentResponseSchema.safeParse(payload).success, false)
  }
  assert.equal(apiErrorSchema.safeParse({ error: { message: "Ошибка" } }).success, false)
  assert.deepEqual(apiErrorSchema.parse({ error: "Сервис недоступен" }), { error: "Сервис недоступен" })
})

test("неверный район и невалидный набор нельзя применить из ответа советника", () => {
  const reply = { reply: "Предлагаю другой набор.", trace: [] }
  for (const suggestion of [
    [],
    EXAMPLE.slice(1),
    EXAMPLE.map((decision) => ({ ...decision, districtId: "unknown" })),
    [EXAMPLE[0], EXAMPLE[0], ...EXAMPLE.slice(2)],
    EXAMPLE.map((decision) => ({ ...decision, districtId: null })),
  ]) {
    assert.equal(agentResponseSchema.safeParse({ ...reply, suggestion }).success, false)
  }
})

test("разбор движка проходит проверку, а сломанные списки и источник отклоняются", () => {
  const explanation = describeScenario(scoreScenario(EXAMPLE), attribute(EXAMPLE))
  assert.ok(explanationResponseSchema.safeParse(explanation).success)
  assert.equal(explanationResponseSchema.safeParse({ ...explanation, risks: null }).success, false)
  assert.equal(explanationResponseSchema.safeParse({ ...explanation, source: "unknown" }).success, false)
  assert.equal(explanationResponseSchema.safeParse({ error: "Ошибка" }).success, false)
})
