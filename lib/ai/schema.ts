import { z } from "zod"

import { DISTRICT_IDS, MEASURES } from "@/lib/domain/city"

const measureIds = MEASURES.map((m) => m.id) as [string, ...string[]]
const districtIds = DISTRICT_IDS as [string, ...string[]]

/** Решение, пришедшее из браузера. Схема отсекает мусор до того, как он дойдёт до движка. */
export const decisionSchema = z.object({
  measureId: z.enum(measureIds),
  districtId: z.enum(districtIds).nullable().catch(null),
})

export const decisionsSchema = z.array(decisionSchema).max(5)
