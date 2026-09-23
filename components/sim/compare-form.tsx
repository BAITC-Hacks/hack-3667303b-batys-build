"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

/**
 * Поля принимают и голый код сценария, и целиком ссылку из адресной строки —
 * командам удобнее кидать друг другу ссылку, чем выковыривать из неё параметр.
 */
function extractCode(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  const match = trimmed.match(/[?&]s=([^&#\s]+)/)
  const raw = match ? match[1] : trimmed
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export function CompareForm({ initialA, initialB }: { initialA: string; initialB: string }) {
  const router = useRouter()
  const [a, setA] = useState(initialA)
  const [b, setB] = useState(initialB)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const params = new URLSearchParams()
    const codeA = extractCode(a)
    const codeB = extractCode(b)
    if (codeA) params.set("a", codeA)
    if (codeB) params.set("b", codeB)
    router.push(`/compare?${params.toString()}`)
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-panel p-5 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Сценарий A</span>
          <input
            value={a}
            onChange={(event) => setA(event.target.value)}
            autoCapitalize="none"
            spellCheck={false}
            placeholder="ссылка на сценарий или код вида M7:nura,M8:nura,…"
            className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel-raised px-3 py-2 text-base placeholder:text-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Сценарий B</span>
          <input
            value={b}
            onChange={(event) => setB(event.target.value)}
            autoCapitalize="none"
            spellCheck={false}
            placeholder="ссылка второй команды"
            className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel-raised px-3 py-2 text-base placeholder:text-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:text-sm"
          />
        </label>
      </div>
      <button
        type="submit"
        className="mt-4 min-h-11 w-full rounded-xl border border-accent/40 bg-accent-soft px-4 py-2 text-sm font-semibold text-accent transition hover:border-accent/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
      >
        Сравнить
      </button>
    </form>
  )
}
