/**
 * Проверяем сам детектор: он обязан пропускать числа из ответов инструментов
 * и ловить те, которых там не было.
 */

import assert from "node:assert/strict"
import test from "node:test"

import { auditReply, extractNumbers } from "@/lib/ai/audit"

const TOOL_OUTPUT = JSON.stringify({ score: 56.54, delta: 3.99, cost: 95, weakest: { value: 52.96 } })

test("числа вытаскиваются и в точке, и в запятой", () => {
  assert.deepEqual(extractNumbers("балл 56,54 против 52.56"), [56.54, 52.56])
  assert.deepEqual(extractNumbers("без чисел"), [])
})

test("числа из ответа инструмента считаются обоснованными", () => {
  const result = auditReply("Сценарий набрал 56,54 балла, прирост 3,99 при расходах 95.", [TOOL_OUTPUT])
  assert.ok(result.ok, `ложная тревога: ${result.invented.join(", ")}`)
  assert.equal(result.checked, 3)
})

test("константы правил игры не требуют вызова инструмента", () => {
  // Бюджет 100, ровно 5 решений, горизонт 8 кварталов, порог 40, стоимость меры 24.
  const result = auditReply("Из 100 единиц на 5 решений при горизонте 8 кварталов и пороге 40; школа стоит 24.", [])
  assert.ok(result.ok, `ложная тревога: ${result.invented.join(", ")}`)
})

test("выдуманное число ловится", () => {
  const result = auditReply("Сценарий набрал 61,3 балла — это лучший результат.", [TOOL_OUTPUT])
  assert.equal(result.ok, false)
  assert.deepEqual(result.invented, [61.3])
})

test("округление модели не считается выдумкой", () => {
  // 56.54 названо как «примерно 56,5» — то же число, просто короче.
  const result = auditReply("Балл около 56,5.", [TOOL_OUTPUT])
  assert.ok(result.ok, `ложная тревога: ${result.invented.join(", ")}`)
})
