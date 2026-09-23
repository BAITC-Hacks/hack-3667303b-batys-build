"use client"

import { useId, useState } from "react"

import frontier from "@/lib/domain/frontier.json"
import { cn, fmt, fmtDelta } from "@/lib/utils"

/**
 * Граница достижимого: какой максимальный балл вообще можно получить при каждом
 * уровне бюджета. Кривая посчитана заранее полным перебором (pnpm frontier),
 * поэтому рисуется мгновенно.
 *
 * Главное, что она показывает: отдача от денег падает. Первые пять единиц сверх
 * минимально возможного набора дают заметный прирост, последние тридцать — почти
 * ничего. Для управленца это и есть ответ на вопрос «сколько стоит балл качества
 * жизни» и стоит ли добивать бюджет до потолка.
 */

const POINTS = frontier.points
const BASE = frontier.baseScore

// Тёмные акценты сохраняют читаемость линии и подписей на светлой подложке.
const LINE = "#087f70"
const MARK = "#b45309"

const WIDTH = 720
const HEIGHT = 260
const PAD = { top: 18, right: 18, bottom: 34, left: 44 }

const X_MIN = Math.min(...POINTS.map((p) => p.budget))
const X_MAX = Math.max(...POINTS.map((p) => p.budget))
const Y_MIN = 52
const Y_MAX = 58

const sx = (budget: number) =>
  PAD.left + ((budget - X_MIN) / (X_MAX - X_MIN)) * (WIDTH - PAD.left - PAD.right)
const sy = (score: number) =>
  HEIGHT - PAD.bottom - ((score - Y_MIN) / (Y_MAX - Y_MIN)) * (HEIGHT - PAD.top - PAD.bottom)

export function FrontierChart({
  currentCost,
  currentScore,
  valid,
}: {
  currentCost: number
  currentScore: number
  /** Сценарий из пяти корректных решений — только тогда точку есть смысл ставить. */
  valid: boolean
}) {
  const gradientId = useId()
  const [hover, setHover] = useState<number | null>(null)

  const linePath = POINTS.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.budget)},${sy(p.score)}`).join(" ")
  const areaPath = `${linePath} L${sx(X_MAX)},${sy(Y_MIN)} L${sx(X_MIN)},${sy(Y_MIN)} Z`

  const richest = POINTS[POINTS.length - 1]
  // Излом кривой: до этой точки деньги работают, после почти нет.
  const knee = POINTS.find((p) => p.budget >= 70) ?? POINTS[POINTS.length - 1]
  const perUnit = (from: (typeof POINTS)[number], to: (typeof POINTS)[number]) =>
    (to.score - from.score) / (to.budget - from.budget)
  const earlyRate = perUnit(POINTS[0], knee)
  const lateRate = perUnit(knee, richest)
  const ratio = Math.round(earlyRate / Math.max(lateRate, 0.0001))

  const active = hover === null ? null : POINTS[hover]
  const showMarker = valid && currentCost >= X_MIN

  return (
    <section aria-label="Граница достижимого">
      <h2 className="text-base font-semibold">
        Сколько даёт каждый бюджет
      </h2>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">
        Сравните ваш сценарий с лучшим возможным результатом при каждом уровне расходов.
      </p>

      <div className="mt-4 rounded-2xl border border-line bg-panel p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
          <span className="flex items-center gap-2">
            <span className="h-0.5 w-5 rounded-full" style={{ backgroundColor: LINE }} aria-hidden />
            Лучший результат
          </span>
          {showMarker && (
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: MARK }} aria-hidden />
              Ваш сценарий
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-auto w-full min-w-[520px]"
            role="img"
            aria-label={`Максимально достижимый балл растёт с ${fmt(POINTS[0].score)} при бюджете ${POINTS[0].budget} до ${fmt(richest.score)} при бюджете ${richest.budget}`}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={LINE} stopOpacity="0.16" />
                <stop offset="100%" stopColor={LINE} stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Сетка и подписи держатся в фоне, чтобы не спорить с данными. */}
            {[53, 54, 55, 56, 57, 58].map((value) => (
              <g key={value}>
                <line
                  x1={PAD.left}
                  y1={sy(value)}
                  x2={WIDTH - PAD.right}
                  y2={sy(value)}
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-line"
                  opacity="0.8"
                />
                <text
                  x={PAD.left - 8}
                  y={sy(value) + 4}
                  textAnchor="end"
                  className="fill-current text-[11px] text-muted"
                >
                  {value}
                </text>
              </g>
            ))}

            {POINTS.map((p) => (
              <text
                key={p.budget}
                x={sx(p.budget)}
                y={HEIGHT - PAD.bottom + 16}
                textAnchor="middle"
                className="fill-current text-[11px] text-muted"
              >
                {p.budget}
              </text>
            ))}
            <text
              x={WIDTH - PAD.right}
              y={HEIGHT - 6}
              textAnchor="end"
              className="fill-current text-[11px] text-muted"
            >
              бюджет, условных единиц
            </text>

            {/* Балл города, если не делать ничего — точка отсчёта для всей картины. */}
            <line
              x1={PAD.left}
              y1={sy(BASE)}
              x2={WIDTH - PAD.right}
              y2={sy(BASE)}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="5 4"
              className="text-muted"
              opacity="0.8"
            />
            <text
              x={PAD.left + 6}
              y={sy(BASE) - 6}
              className="fill-current text-[11px] text-muted"
            >
              без решений — {fmt(BASE)}
            </text>

            <path d={areaPath} fill={`url(#${gradientId})`} />
            <path d={linePath} fill="none" stroke={LINE} strokeWidth="2.5" strokeLinejoin="round" />

            {POINTS.map((p, index) => (
              <circle
                key={p.budget}
                cx={sx(p.budget)}
                cy={sy(p.score)}
                r={hover === index ? 5 : 3.5}
                fill={LINE}
                stroke="var(--panel)"
                strokeWidth="2"
              />
            ))}

            {/* Точка пользователя: крупнее линии и с кольцом подложки, чтобы читалась поверх. */}
            {showMarker && (
              <g>
                <line
                  x1={sx(currentCost)}
                  y1={sy(currentScore)}
                  x2={sx(currentCost)}
                  y2={HEIGHT - PAD.bottom}
                  stroke={MARK}
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                  opacity="0.6"
                />
                <circle
                  cx={sx(currentCost)}
                  cy={sy(currentScore)}
                  r="6"
                  fill={MARK}
                  stroke="var(--panel)"
                  strokeWidth="2.5"
                />
                <text
                  x={sx(currentCost) + (currentCost > (X_MIN + X_MAX) / 2 ? -10 : 10)}
                  y={sy(currentScore) - 10}
                  textAnchor={currentCost > (X_MIN + X_MAX) / 2 ? "end" : "start"}
                  className="fill-current text-[11px] font-semibold"
                  style={{ color: MARK }}
                >
                  ваш сценарий — {fmt(currentScore)}
                </text>
              </g>
            )}

            {/* Прозрачные полосы-мишени: попасть по ним проще, чем по точке. */}
            {POINTS.map((p, index) => {
              const previous = POINTS[index - 1]
              const next = POINTS[index + 1]
              const left = previous ? (sx(previous.budget) + sx(p.budget)) / 2 : PAD.left
              const right = next ? (sx(p.budget) + sx(next.budget)) / 2 : WIDTH - PAD.right
              return (
                <rect
                  key={p.budget}
                  x={left}
                  y={PAD.top}
                  width={right - left}
                  height={HEIGHT - PAD.top - PAD.bottom}
                  fill="transparent"
                  onPointerEnter={() => setHover(index)}
                  onPointerLeave={() => setHover(null)}
                  onClick={() => setHover(index)}
                />
              )
            })}
          </svg>
        </div>

        <p className="mt-3 min-h-10 rounded-xl bg-panel-raised/70 px-3 py-2.5 text-xs leading-relaxed tabular" aria-live="polite">
          {active ? (
            <span>
              Бюджет {active.budget}: потолок {fmt(active.score)} балла (
              {fmtDelta(active.delta)} к базе), лучший набор тратит {active.cost}.
            </span>
          ) : showMarker ? (
            <span className="text-muted">
              Ваш сценарий: {fmt(currentScore)} балла при расходах {currentCost}. До потолка{" "}
              {fmt(Math.max(0, richest.score - currentScore))}.
            </span>
          ) : (
            <span className="text-muted">Наведите на график или коснитесь его, чтобы посмотреть результат для выбранного бюджета.</span>
          )}
        </p>
      </div>

      <details className="mt-3 rounded-xl border border-line bg-panel px-4 py-3">
        <summary className="cursor-pointer text-xs font-medium text-muted hover:text-foreground">
          Как читать график
        </summary>
        <p className="mt-3 max-w-3xl text-xs leading-relaxed text-muted">
          Верхняя граница посчитана полным перебором: для каждого потолка расходов это лучший
          возможный результат. Кривая начинается с {frontier.minimumCost} единиц — дешевле
          допустимого набора из пяти решений не существует. Дальше отдача падает:
          от {POINTS[0].budget} до {knee.budget} каждая единица бюджета приносит{" "}
          {fmt(earlyRate, 3)} балла, а от {knee.budget} до {richest.budget} — всего{" "}
          {fmt(lateRate, 3)}, то есть примерно в {ratio} раз меньше.
        </p>
      </details>
      <details className="mt-2 rounded-xl border border-line bg-panel px-4 py-3">
        <summary className="cursor-pointer text-xs font-medium text-muted hover:text-foreground">
          Все значения в таблице
        </summary>
        <table className="mt-3 w-full max-w-lg border-collapse text-xs">
          <caption className="sr-only">Лучший результат для каждого уровня бюджета</caption>
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th scope="col" className="py-2 font-medium">Бюджет</th>
              <th scope="col" className="py-2 text-right font-medium">Потолок</th>
              <th scope="col" className="py-2 text-right font-medium">К базе</th>
              <th scope="col" className="py-2 text-right font-medium">Потрачено</th>
            </tr>
          </thead>
          <tbody>
            {POINTS.map((p) => (
              <tr key={p.budget} className={cn("border-b border-line/50")}>
                <td className="py-2 tabular">{p.budget}</td>
                <td className="py-2 text-right tabular font-semibold">{fmt(p.score)}</td>
                <td className="py-2 text-right tabular text-gain">{fmtDelta(p.delta)}</td>
                <td className="py-2 text-right tabular text-muted">{p.cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  )
}
