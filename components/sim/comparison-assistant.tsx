"use client"

import { useState } from "react"

import type { Decision } from "@/lib/domain/city"
import type { ScenarioBreakdown } from "@/lib/engine/score"

import { AiAssistant } from "@/components/sim/ai-assistant"

interface ComparisonContext {
  id: "a" | "b"
  label: string
  decisions: Decision[]
  breakdown: ScenarioBreakdown
  complete: boolean
}

export function ComparisonAssistant({
  scenarios,
}: {
  scenarios: [ComparisonContext, ComparisonContext]
}) {
  const [selectedId, setSelectedId] = useState<ComparisonContext["id"]>("a")
  const selected = scenarios.find((scenario) => scenario.id === selectedId) ?? scenarios[0]

  return (
    <AiAssistant
      decisions={selected.decisions}
      breakdown={selected.breakdown}
      complete={selected.complete}
      contextLabel={selected.label}
      contextPicker={
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-foreground">
            Какой сценарий обсудим
            <select
              value={selected.id}
              onChange={(event) => {
                const value = event.target.value
                if (value === "a" || value === "b") setSelectedId(value)
              }}
              className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:text-sm"
            >
              {scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.label}{scenario.complete ? "" : " — не завершён"}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs leading-relaxed text-muted">
            Советник отвечает по выбранному сценарию. Здесь можно переключиться между A и B.
          </p>
        </div>
      }
    />
  )
}
