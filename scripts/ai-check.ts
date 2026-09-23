/**
 * Проверка ИИ-слоя без запуска приложения: pnpm ai:check
 *
 * Отвечает на три вопроса: виден ли ключ, отвечает ли выбранная модель и
 * соблюдает ли она контракт ответа. Полезно перед демонстрацией — лучше
 * узнать о протухшем ключе заранее, чем на защите.
 */

import fs from "node:fs"
import path from "node:path"

import { activeProvider, chatCompletion, isAiConfigured } from "@/lib/ai/provider"
import { askAgent } from "@/lib/ai/agent"
import { explainScenario } from "@/lib/ai/explain"
import type { Decision } from "@/lib/domain/city"
import { attribute } from "@/lib/engine/attribution"
import { scoreScenario } from "@/lib/engine/score"

// Скрипт запускается вне Next, поэтому .env.local читаем сами. Провайдер смотрит
// в process.env только в момент вызова, так что порядок импортов роли не играет.
for (const file of [".env.local", ".env"]) {
  const full = path.join(process.cwd(), file)
  if (!fs.existsSync(full)) continue
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!match) continue
    const [, key, rawValue] = match
    if (process.env[key]) continue
    process.env[key] = rawValue.replace(/^["']|["']$/g, "")
  }
}

const EXAMPLE = [
  { measureId: "M7", districtId: "nura" },
  { measureId: "M8", districtId: "nura" },
  { measureId: "M10", districtId: "nura" },
  { measureId: "M12", districtId: null },
  { measureId: "M5", districtId: "saryarka" },
] as Decision[]

async function main() {
  const line = (label: string, value: string) => console.log(`${label.padEnd(22)} ${value}`)

  if (!isAiConfigured()) {
    console.log("Ключ не найден. Симулятор будет работать на детерминированном разборе.")
    console.log("Добавьте OPENAI_API_KEY, NVIDIA_API_KEY или OPENROUTER_API_KEY в .env.local")
    process.exit(0)
  }

  const provider = activeProvider()!
  line("Провайдер", provider.label)
  line("Модель", provider.model)

  console.log("\n1. Простой запрос")
  const started = Date.now()
  const ping = await chatCompletion([{ role: "user", content: "Ответь одним словом: работает?" }], {
    maxTokens: 20,
  })
  line("   ответ", `${ping.content?.trim()} (${Date.now() - started} мс, ${ping.provider}/${ping.model})`)

  console.log("\n2. Разбор сценария")
  const breakdown = scoreScenario(EXAMPLE)
  const explanation = await explainScenario(breakdown, attribute(EXAMPLE))
  line("   источник", explanation.source === "ai" ? "модель" : "движок (откат)")
  line("   summary", explanation.summary.slice(0, 160))
  line("   сильных сторон", String(explanation.strengths.length))
  line("   рисков", String(explanation.risks.length))

  if (explanation.source !== "ai") {
    console.log("\n   Модель не соблюла контракт — смотрите предупреждение [ai] выше.")
  }

  console.log("\n3. Агент с инструментами")
  const agent = await askAgent("Как выжать ещё балл, не выходя за бюджет?", EXAMPLE)
  for (const step of agent.trace) line(`   ${step.name}`, step.summary)
  line("   ответ", agent.reply.slice(0, 220))
  line("   предложение", agent.suggestion ? `${agent.suggestion.length} решений` : "нет")

  console.log("\nГотово.")
}

main()
