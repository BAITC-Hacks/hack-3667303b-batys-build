import { NextResponse } from "next/server"
import { z } from "zod"

import { askAgent } from "@/lib/ai/agent"
import { decisionsSchema } from "@/lib/ai/schema"
import type { Decision } from "@/lib/domain/city"

const requestSchema = z.object({
  question: z.string().min(1).max(600),
  decisions: decisionsSchema.default([]),
})

/** Агент-советник: планирует модель, считает движок. */
/**
 * Агент делает до четырёх обращений к модели и между ними гоняет перебор,
 * поэтому запрос легко выходит за стандартный лимит бессерверной функции.
 * Держим узел Node — перебор считает процессор, а неedge-рантайм.
 */
export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 })
  }

  try {
    const reply = await askAgent(parsed.data.question, parsed.data.decisions as Decision[])
    return NextResponse.json(reply)
  } catch (error) {
    console.warn("[agent] запрос не удался:", error)
    return NextResponse.json(
      { reply: "Не получилось связаться с моделью. Попробуйте ещё раз через минуту.", trace: [], suggestion: null },
      { status: 200 },
    )
  }
}
