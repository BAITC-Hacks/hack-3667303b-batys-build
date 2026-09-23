"use client"

import { Printer } from "lucide-react"

/** Печать страницы разбора — самый переносимый способ отдать команде готовый документ. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-1.5 text-sm font-medium transition hover:bg-panel-raised"
    >
      <Printer className="size-4" aria-hidden />
      Печать или PDF
    </button>
  )
}
