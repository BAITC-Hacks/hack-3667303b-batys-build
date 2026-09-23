import { z } from "zod"

import { DECISION_COUNT, DISTRICT_IDS, MEASURES, type DistrictId, type MeasureId } from "@/lib/domain/city"
import { validateScenario } from "@/lib/engine/validate"

const measureIds = MEASURES.map((m) => m.id) as [MeasureId, ...MeasureId[]]
const districtIds = DISTRICT_IDS as [DistrictId, ...DistrictId[]]

/** Решение, пришедшее из браузера. Схема отсекает мусор до того, как он дойдёт до движка. */
export const decisionSchema = z.object({
  measureId: z.enum(measureIds),
  districtId: z.enum(districtIds).nullable().catch(null),
})

export const decisionsSchema = z.array(decisionSchema).max(5)

export const apiErrorSchema = z.object({ error: z.string().trim().min(1) })

export const explanationResponseSchema = z.object({
  summary: z.string().trim().min(1),
  strengths: z.array(z.string()),
  risks: z.array(z.string()),
  tradeoff: z.string(),
  source: z.enum(["ai", "engine"]),
})

// Предложение можно применить одной кнопкой, поэтому ошибочный район нельзя
// молча заменить на null, как при восстановлении неполного набора из адреса.
const suggestedDecisionsSchema = z
  .array(decisionSchema.extend({ districtId: z.enum(districtIds).nullable() }))
  .length(DECISION_COUNT)
  .refine((decisions) => validateScenario(decisions).length === 0, {
    message: "Предложенный сценарий нарушает правила",
  })

export const agentResponseSchema = z.object({
  reply: z.string().trim().min(1),
  trace: z.array(z.object({ name: z.string().min(1), summary: z.string() })),
  suggestion: suggestedDecisionsSchema.nullable(),
})

export type ExplanationResponse = z.infer<typeof explanationResponseSchema>
export type AgentResponse = z.infer<typeof agentResponseSchema>
