/**
 * Эталонные значения взяты прямо из технического задания:
 * база без решений — 52.56, пример допустимого набора — около 56.5 (+4.0).
 * ТЗ просит перепроверить это кодом, поэтому тесты прибивают числа намертво.
 */

import assert from "node:assert/strict"
import test from "node:test"

import type { Decision } from "@/lib/domain/city"
import { attribute } from "@/lib/engine/attribution"
import { BASE_SCORE, scoreScenario } from "@/lib/engine/score"
import { solve } from "@/lib/engine/solver"
import { validateScenario } from "@/lib/engine/validate"

/** Пример допустимого набора из раздела 3 ТЗ. */
const EXAMPLE: Decision[] = [
  { measureId: "M7", districtId: "nura" },
  { measureId: "M8", districtId: "nura" },
  { measureId: "M10", districtId: "nura" },
  { measureId: "M12", districtId: null },
  { measureId: "M5", districtId: "saryarka" },
]

test("базовый сценарий без решений даёт 52.56", () => {
  const breakdown = scoreScenario([])
  assert.equal(breakdown.score, 52.56)
  assert.equal(breakdown.dAvg, 56.86)
  assert.equal(breakdown.weakest.name, "Нура")
  assert.equal(breakdown.weakest.value, 49.18)
  // Школы и поликлиники в Нуре — единственные значения ниже 40.
  assert.equal(breakdown.criticalCount, 2)
  assert.equal(Math.round(BASE_SCORE * 100) / 100, 52.56)
})

test("оценка района Есиль совпадает с итогом D из ТЗ", () => {
  const breakdown = scoreScenario([])
  const esil = breakdown.districts.find((d) => d.id === "esil")
  assert.equal(esil?.before, 62.99)
})

test("пример из ТЗ стоит 95 и даёт 56.54", () => {
  assert.deepEqual(validateScenario(EXAMPLE), [])
  const breakdown = scoreScenario(EXAMPLE)
  assert.equal(breakdown.cost, 95)
  assert.equal(breakdown.score, 56.54)
  assert.equal(breakdown.delta, 3.99)
  assert.equal(breakdown.criticalCount, 0)
  assert.equal(breakdown.synergies.length, 1)
  assert.equal(breakdown.synergies[0].district, "Нура")
})

test("лаг срезает эффект пропорционально горизонту", () => {
  // M7 даёт S1 +16 с лагом 3, значит реализуется 5/8 = +10 к базовым 38.
  const breakdown = scoreScenario([{ measureId: "M7", districtId: "nura" }])
  const nura = breakdown.districts.find((d) => d.id === "nura")
  const schools = nura?.indicators.find((i) => i.key === "S1")
  assert.equal(schools?.before, 38)
  assert.equal(schools?.after, 48)
  assert.equal(breakdown.decisions[0].realized, 0.625)
})

test("изменение набора решений меняет балл", () => {
  // Меняем чистое топливо в Сарыарке на ЛРТ в Нуре — состав и балл обязаны разойтись.
  const swapped: Decision[] = [...EXAMPLE.slice(0, 4), { measureId: "M3", districtId: "nura" }]
  assert.deepEqual(validateScenario(swapped), [])
  assert.notEqual(scoreScenario(swapped).score, scoreScenario(EXAMPLE).score)
})

test("валидатор называет причину для каждого нарушенного правила", () => {
  const codes = (decisions: Decision[]) => validateScenario(decisions).map((v) => v.code)

  assert.deepEqual(codes(EXAMPLE.slice(0, 4)), ["count"])
  assert.ok(codes([...EXAMPLE.slice(0, 4), { measureId: "M7", districtId: "esil" }]).includes("duplicate"))

  // Три самые дорогие меры уже выходят за 100.
  const expensive: Decision[] = [
    { measureId: "M3", districtId: "nura" },
    { measureId: "M13", districtId: "esil" },
    { measureId: "M5", districtId: "almaty" },
    { measureId: "M7", districtId: "baikonur" },
    { measureId: "M8", districtId: "saryarka" },
  ]
  assert.ok(codes(expensive).includes("budget"))

  // Три меры по экологии при лимите в две.
  const threeEco: Decision[] = [
    { measureId: "M4", districtId: "nura" },
    { measureId: "M5", districtId: "saryarka" },
    { measureId: "M6", districtId: null },
    { measureId: "M9", districtId: "nura" },
    { measureId: "M10", districtId: "nura" },
  ]
  assert.ok(codes(threeEco).includes("direction"))

  const missingDistrict: Decision[] = [...EXAMPLE.slice(0, 4), { measureId: "M4", districtId: null }]
  assert.ok(codes(missingDistrict).includes("missing_district"))

  const cityWithDistrict: Decision[] = [...EXAMPLE.slice(0, 4), { measureId: "M14", districtId: "nura" }]
  assert.ok(codes(cityWithDistrict).includes("unexpected_district"))
})

test("несовместимые пары отклоняются", () => {
  // M1 и M3 нельзя вместе ни в каком районе.
  const brt: Decision[] = [
    { measureId: "M1", districtId: "nura" },
    { measureId: "M3", districtId: "esil" },
    { measureId: "M9", districtId: "nura" },
    { measureId: "M10", districtId: "nura" },
    { measureId: "M12", districtId: null },
  ]
  assert.ok(validateScenario(brt).some((v) => v.code === "conflict"))

  // M4 и M7 конфликтуют только в одном районе.
  const sameDistrict: Decision[] = [
    { measureId: "M4", districtId: "nura" },
    { measureId: "M7", districtId: "nura" },
    { measureId: "M9", districtId: "esil" },
    { measureId: "M10", districtId: "nura" },
    { measureId: "M12", districtId: null },
  ]
  assert.ok(validateScenario(sameDistrict).some((v) => v.code === "conflict"))

  const otherDistrict: Decision[] = [...sameDistrict.slice(1), { measureId: "M4", districtId: "esil" }]
  assert.deepEqual(validateScenario(otherDistrict), [])
})

test("солвер находит оптимум 57.24 и возвращает валидный набор", () => {
  const [best] = solve({ limit: 3 })
  assert.equal(Math.round(best.score * 100) / 100, 57.24)
  assert.ok(best.cost <= 100)
  assert.deepEqual(validateScenario(best.decisions), [])
  // Оптимум закрывает оба критических провала Нуры.
  assert.equal(scoreScenario(best.decisions).criticalCount, 0)
})

test("солвер уважает ограничения по бюджету и запрещённым мерам", () => {
  const cheap = solve({ budget: 61, limit: 1 })[0]
  assert.ok(cheap.cost <= 61)

  const withoutLrt = solve({ exclude: ["M3"], limit: 1 })[0]
  assert.ok(!withoutLrt.decisions.some((d) => d.measureId === "M3"))

  const forced = solve({ include: [{ measureId: "M4", districtId: "esil" }], limit: 1 })[0]
  assert.ok(forced.decisions.some((d) => d.measureId === "M4" && d.districtId === "esil"))
  assert.equal(forced.decisions.length, 5)
})

test("сумма вкладов по Шепли равна общему приросту балла", () => {
  const contributions = attribute(EXAMPLE)
  const total = contributions.reduce((sum, c) => sum + c.shapley, 0)
  const breakdown = scoreScenario(EXAMPLE)
  assert.ok(Math.abs(total - breakdown.delta) < 0.05)
  assert.equal(contributions.length, 5)
})
