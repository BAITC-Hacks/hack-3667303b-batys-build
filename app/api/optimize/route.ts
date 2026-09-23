import { NextResponse } from "next/server"
import { z } from "zod"

import { scoreScenario } from "@/lib/engine/score"
import { solve } from "@/lib/engine/solver"
import { decisionsSchema } from "@/lib/ai/schema"
import { MEASURES, type Decision, type MeasureId } from "@/lib/domain/city"

const requestSchema = z.object({
  budget: z.number().min(0).max(100).optional(),
  include: decisionsSchema.optional(),
  exclude: z.array(z.enum(MEASURES.map((m) => m.id) as [string, ...string[]])).optional(),
  limit: z.number().int().min(1).max(5).default(3),
})

/**
 * Полный перебор пространства решений. Вынесен в маршрут, потому что занимает
 * секунды процессорного времени — в браузере это подвесило бы интерфейс.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные ограничения" }, { status: 400 })
  }

  const started = Date.now()
  const results = solve({
    budget: parsed.data.budget,
    include: parsed.data.include as Decision[] | undefined,
    exclude: parsed.data.exclude as MeasureId[] | undefined,
    limit: parsed.data.limit,
  })

  return NextResponse.json({
    elapsedMs: Date.now() - started,
    results: results.map((result) => ({
      decisions: result.decisions,
      breakdown: scoreScenario(result.decisions),
    })),
  })
}
