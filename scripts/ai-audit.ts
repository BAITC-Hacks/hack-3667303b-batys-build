/**
 * Проверка обещания «агент не выдумывает числа»: pnpm ai:audit
 *
 * Гоняет агента по списку вопросов и механически сверяет каждое число из его
 * ответа с тем, что вернули инструменты. Любая цифра, которой не было ни в
 * выводе движка, ни среди констант правил игры, считается выдумкой, и скрипт
 * завершается с ненулевым кодом.
 *
 * Это и есть доказательство архитектурного принципа: считает код, говорит модель.
 */

import { askAgent } from "@/lib/ai/agent"
import { auditReply } from "@/lib/ai/audit"
import { activeProvider, isAiConfigured } from "@/lib/ai/provider"
import type { Decision } from "@/lib/domain/city"
import { loadEnv } from "./load-env"

loadEnv()

const SCENARIO: Decision[] = [
  { measureId: "M7", districtId: "nura" },
  { measureId: "M8", districtId: "nura" },
  { measureId: "M10", districtId: "nura" },
  { measureId: "M12", districtId: null },
  { measureId: "M5", districtId: "saryarka" },
]

const QUESTIONS: Array<{ question: string; decisions: Decision[] }> = [
  { question: "Как улучшить мой сценарий, не выходя за бюджет?", decisions: SCENARIO },
  { question: "Почему Нура тянет балл вниз?", decisions: SCENARIO },
  { question: "Что будет, если отказаться от ЛРТ?", decisions: SCENARIO },
  { question: "А если бюджет урежут до 70 единиц?", decisions: SCENARIO },
  { question: "Какой набор лучший, если начинать с нуля?", decisions: [] },
  { question: "Сравни мой сценарий с оптимальным и скажи, чем я плачу за разницу.", decisions: SCENARIO },
]

async function main() {
  if (!isAiConfigured()) {
    console.log("Ключ не задан — проверять нечего. Добавьте ключ в .env.local")
    process.exit(0)
  }

  const provider = activeProvider()!
  console.log(`Провайдер: ${provider.label} · модель: ${provider.model}`)
  console.log(`Вопросов: ${QUESTIONS.length}\n`)

  let failures = 0
  let totalNumbers = 0

  for (const [index, item] of QUESTIONS.entries()) {
    const reply = await askAgent(item.question, item.decisions, { captureOutputs: true })
    const audit = auditReply(reply.reply, reply.toolOutputs ?? [])
    totalNumbers += audit.checked

    const tools = reply.trace.map((step) => step.name).join(", ") || "без инструментов"
    const status = audit.ok ? "OK  " : "ВРЁТ"
    console.log(`${status} ${index + 1}. ${item.question}`)
    console.log(`      инструменты: ${tools}`)
    console.log(`      чисел в ответе: ${audit.checked}`)

    if (!audit.ok) {
      failures++
      console.log(`      НЕ НАЙДЕНЫ В РАСЧЁТЕ: ${audit.invented.join(", ")}`)
      console.log(`      ответ: ${reply.reply.replace(/\s+/g, " ").slice(0, 400)}`)
    }
    console.log()
  }

  console.log(`Проверено чисел: ${totalNumbers}. Вопросов с выдуманными числами: ${failures}.`)
  if (failures > 0) {
    console.log("\nАгент назвал числа, которых не было в ответах инструментов.")
    process.exit(1)
  }
  console.log("Каждое число в ответах агента взято из расчёта движка.")
}

main()
