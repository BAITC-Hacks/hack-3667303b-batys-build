"use client"

import { Calculator, ChevronDown } from "lucide-react"

import {
  CRITICAL_THRESHOLD,
  DIRECTION_LABELS,
  HORIZON,
  INDICATORS,
  INDICATOR_META,
  type Direction,
} from "@/lib/domain/city"

/**
 * «Как считается Score» — формула, вынутая из README на экран.
 *
 * Раскрытие в два уровня: сначала три строки словами, и только по отдельному
 * запросу — веса всех десяти показателей. Судья должен понять принцип за
 * пятнадцать секунд, а не читать таблицу, которая ему не нужна.
 */

const DIRECTION_ORDER: Direction[] = ["transport", "eco", "social", "safety", "service"]

/** Вес направления — сумма весов его показателей. Считается из тех же данных, что и балл. */
const DIRECTION_WEIGHT = DIRECTION_ORDER.map((direction) => ({
  direction,
  weight: INDICATORS.filter((key) => INDICATOR_META[key].direction === direction).reduce(
    (sum, key) => sum + INDICATOR_META[key].weight,
    0,
  ),
}))

export function ScoreFormula() {
  return (
    <details className="@container group/formula rounded-2xl border border-line bg-panel shadow-sm">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2.5 px-4 py-4 text-sm font-semibold text-foreground transition hover:text-accent sm:px-5">
        <Calculator className="size-4 shrink-0 text-accent" aria-hidden />
        Как считается балл?
        <ChevronDown
          className="ml-auto size-4 shrink-0 text-muted transition group-open/formula:rotate-180 motion-reduce:transition-none"
          aria-hidden
        />
      </summary>

      <div className="px-4 pb-5 text-xs leading-relaxed text-muted sm:px-5">
        <div className="grid gap-5 @[720px]:grid-cols-2">
          <div className="space-y-3">
            <h3 className="font-semibold text-foreground">Из чего складывается итог</h3>
            <ul className="space-y-2">
              <li className="flex gap-2">
                <span className="font-semibold tabular text-foreground">70%</span>
                <span>среднее качество жизни по городу, с поправкой на население районов</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold tabular text-foreground">30%</span>
                <span>оценка самого слабого района — вытянуть его выгоднее, чем усилить лидера</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold tabular text-loss">−1</span>
                <span>за каждый показатель ниже {CRITICAL_THRESHOLD}</span>
              </li>
            </ul>

            <p className="rounded-xl bg-panel-raised px-3 py-3 font-mono text-[11px] leading-relaxed text-foreground">
              Score = 0,7 × среднее по городу + 0,3 × слабейший район − число провалов
            </p>

            <p>
              Эффект меры срезается лагом: за горизонт в {HORIZON} кварталов успевает
              доля (<span className="tabular">{HORIZON}</span> − лаг) / <span className="tabular">{HORIZON}</span>.
              Мера с лагом 4 отдаёт ровно половину.
            </p>
          </div>

          <div className="rounded-xl bg-panel-raised/60 p-4">
            <h3 className="font-semibold text-foreground">Вес направлений</h3>
            <ul className="mt-2 divide-y divide-line">
              {DIRECTION_WEIGHT.map(({ direction, weight }) => (
                <li key={direction} className="flex justify-between gap-2 py-1.5">
                  <span>{DIRECTION_LABELS[direction]}</span>
                  <span className="tabular">{Math.round(weight * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <details className="mt-4 border-t border-line pt-2">
          <summary className="min-h-11 cursor-pointer py-3 font-medium text-accent">
            Показать веса показателей
          </summary>
          <ul className="mt-1 grid gap-x-8 gap-y-2 @[720px]:grid-cols-2">
            {INDICATORS.map((key) => (
              <li key={key} className="flex justify-between gap-2">
                <span>
                  <span className="tabular">{key}</span> · {INDICATOR_META[key].label}
                </span>
                <span className="tabular">{Math.round(INDICATOR_META[key].weight * 100)}%</span>
              </li>
            ))}
          </ul>
        </details>

        <p className="mt-4 rounded-xl border border-accent/20 bg-accent-soft p-3 text-accent">
          Балл считает детерминированная модель, а не ИИ. Все числа на экране — из неё.
          Языковая модель только объясняет результат словами и не может изменить ни одну цифру.
        </p>
      </div>
    </details>
  )
}
