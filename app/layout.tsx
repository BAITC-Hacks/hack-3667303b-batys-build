import type { Metadata } from "next"

import "@fontsource/noto-sans/400.css"
import "@fontsource/noto-sans/500.css"
import "@fontsource/noto-sans/600.css"
import "@fontsource/noto-sans/700.css"
import "./globals.css"

export const metadata: Metadata = {
  title: "Аким на 5 часов — симулятор управления городом",
  description:
    "Распределите бюджет города между транспортом, экологией, соцсферой, безопасностью и сервисами и получите Astana Quality of Life Score с разбором компромиссов.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="h-full">
      <body className="min-h-full">
        <div className="app-shell">{children}</div>
      </body>
    </html>
  )
}
