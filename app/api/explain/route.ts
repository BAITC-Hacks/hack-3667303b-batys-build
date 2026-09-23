import { NextResponse } from "next/server"

import { attribute } from "@/lib/engine/attribution"
import { scoreScenario } from "@/lib/engine/score"
import { validateScenario } from "@/lib/engine/validate"
import { explainScenario } from "@/lib/ai/explain"
import { decisionsSchema } from "@/lib/ai/schema"
import type { Decision } from "@/lib/domain/city"

/** Разбор сценария: детерминированные числа плюс пересказ моделью. */
/** Один запрос к модели с таймаутом 45 секунд не должен упереться в лимит функции. */
export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = decisionsSchema.safeParse((body as { decisions?: unknown } | null)?.decisions)
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректный набор решений" }, { status: 400 })
  }

  const decisions = parsed.data as Decision[]
  const violations = validateScenario(decisions)
  if (violations.length) {
    return NextResponse.json({ error: violations[0].message }, { status: 422 })
  }

  const breakdown = scoreScenario(decisions)
  const explanation = await explainScenario(breakdown, attribute(decisions))
  return NextResponse.json(explanation)
}
