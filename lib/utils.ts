import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Формат балла: всегда две цифры после запятой, чтобы колонки не прыгали. */
export const fmt = (value: number, digits = 2) =>
  value.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits })

/** Дельта со знаком: +4.68 / −1.20 / 0.00 */
export const fmtDelta = (value: number, digits = 2) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${fmt(Math.abs(value), digits)}`
