/**
 * Исходные данные симулятора: районы, показатели, каталог мероприятий и правила.
 * Все числа взяты из технического задания без изменений — это эталон, на который
 * опираются тесты в lib/engine.
 */

/** Показатели. Шкала 0–100, больше — лучше (проблемы уже «перевёрнуты»). */
export const INDICATORS = [
  "T1",
  "T2",
  "E1",
  "E2",
  "S1",
  "S2",
  "B1",
  "B2",
  "C1",
  "C2",
] as const

export type Indicator = (typeof INDICATORS)[number]

export type Direction = "transport" | "eco" | "social" | "safety" | "service"

export const DIRECTION_LABELS: Record<Direction, string> = {
  transport: "Транспорт",
  eco: "Экология",
  social: "Соцсфера",
  safety: "Безопасность",
  service: "Городской сервис",
}

export const INDICATOR_META: Record<
  Indicator,
  { direction: Direction; label: string; hint: string; weight: number }
> = {
  T1: { direction: "transport", label: "Разгрузка дорог", hint: "100 — нет пробок в час пик", weight: 0.1 },
  T2: { direction: "transport", label: "Доступность транспорта", hint: "100 — остановка в 500 м, интервал ≤10 мин", weight: 0.1 },
  E1: { direction: "eco", label: "Озеленение", hint: "100 — ≥20 м² зелени на жителя", weight: 0.09 },
  E2: { direction: "eco", label: "Качество воздуха", hint: "100 — зимой AQI ≤50", weight: 0.11 },
  S1: { direction: "social", label: "Школы и детсады", hint: "100 — норматив закрыт, без второй смены", weight: 0.11 },
  S2: { direction: "social", label: "Поликлиники", hint: "100 — норматив первичной медпомощи выполнен", weight: 0.11 },
  B1: { direction: "safety", label: "Безопасность улиц", hint: "100 — освещение и камеры везде", weight: 0.09 },
  B2: { direction: "safety", label: "Безопасность на дорогах", hint: "100 — минимум ДТП с пострадавшими", weight: 0.09 },
  C1: { direction: "service", label: "Надёжность ЖКХ", hint: "100 — нет аварий тепла и воды за год", weight: 0.1 },
  C2: { direction: "service", label: "Скорость ответа на обращения", hint: "100 — все обращения закрыты в срок", weight: 0.1 },
}

export type DistrictId = "esil" | "almaty" | "saryarka" | "baikonur" | "nura"

export interface District {
  id: DistrictId
  name: string
  /** Доля населения города, сумма по районам = 1. */
  population: number
  profile: string
  values: Record<Indicator, number>
}

export const DISTRICTS: District[] = [
  {
    id: "esil",
    name: "Есиль",
    population: 0.27,
    profile: "Богатый район, но мосты стоят в пробках, а школы переполнены.",
    values: { T1: 45, T2: 62, E1: 68, E2: 72, S1: 48, S2: 55, B1: 78, B2: 60, C1: 75, C2: 70 },
  },
  {
    id: "almaty",
    name: "Алматы",
    population: 0.24,
    profile: "Старые сети ЖКХ и хронические пробки.",
    values: { T1: 40, T2: 75, E1: 50, E2: 55, S1: 60, S2: 65, B1: 62, B2: 52, C1: 50, C2: 60 },
  },
  {
    id: "saryarka",
    name: "Сарыарка",
    population: 0.2,
    profile: "Смог от частного сектора, слабое озеленение.",
    values: { T1: 50, T2: 70, E1: 42, E2: 40, S1: 62, S2: 68, B1: 58, B2: 55, C1: 45, C2: 55 },
  },
  {
    id: "baikonur",
    name: "Байконур",
    population: 0.13,
    profile: "Середняк без ярких перекосов.",
    values: { T1: 52, T2: 68, E1: 55, E2: 50, S1: 58, S2: 60, B1: 52, B2: 58, C1: 55, C2: 58 },
  },
  {
    id: "nura",
    name: "Нура",
    population: 0.16,
    profile: "Главный аутсайдер: соцсфера и транспорт в провале.",
    values: { T1: 55, T2: 40, E1: 45, E2: 65, S1: 38, S2: 35, B1: 55, B2: 50, C1: 60, C2: 50 },
  },
]

export const DISTRICT_IDS = DISTRICTS.map((d) => d.id)

export type MeasureId =
  | "M1" | "M2" | "M3" | "M4" | "M5" | "M6" | "M7"
  | "M8" | "M9" | "M10" | "M11" | "M12" | "M13" | "M14"

export interface Measure {
  id: MeasureId
  direction: Direction
  name: string
  /** district — нужно выбрать район; city — эффект во всех пяти районах. */
  scope: "district" | "city"
  cost: number
  /** Лаг в кварталах: сколько ждать, пока мера заработает. */
  lag: number
  effects: Partial<Record<Indicator, number>>
}

export const MEASURES: Measure[] = [
  { id: "M1", direction: "transport", name: "Выделенные полосы для автобусов", scope: "district", cost: 18, lag: 2, effects: { T1: 6, T2: 9 } },
  { id: "M2", direction: "transport", name: "Умные светофоры", scope: "city", cost: 22, lag: 2, effects: { T1: 4, B2: 3 } },
  { id: "M3", direction: "transport", name: "Линия ЛРТ / расширение", scope: "district", cost: 30, lag: 4, effects: { T1: 16, T2: 20, E2: 4 } },
  { id: "M4", direction: "eco", name: "Парк или сквер", scope: "district", cost: 15, lag: 2, effects: { E1: 12, E2: 3, B1: 2 } },
  { id: "M5", direction: "eco", name: "Частный сектор на чистое топливо", scope: "district", cost: 25, lag: 3, effects: { E2: 14, C1: 4 } },
  { id: "M6", direction: "eco", name: "Озеленение и ветрозащитные полосы", scope: "city", cost: 20, lag: 4, effects: { E1: 5, E2: 3 } },
  { id: "M7", direction: "social", name: "Школа и детсад (модульные)", scope: "district", cost: 24, lag: 3, effects: { S1: 16 } },
  { id: "M8", direction: "social", name: "Центр семейного здоровья", scope: "district", cost: 20, lag: 3, effects: { S2: 14 } },
  { id: "M9", direction: "social", name: "Дворовые спорт-хабы", scope: "district", cost: 10, lag: 1, effects: { S1: 3, S2: 3, B1: 3 } },
  { id: "M10", direction: "safety", name: "Освещение и камеры (Safe City)", scope: "district", cost: 12, lag: 1, effects: { B1: 12, B2: 2 } },
  { id: "M11", direction: "safety", name: "Безопасные переходы и школьные зоны", scope: "district", cost: 10, lag: 1, effects: { B2: 12, T1: -2 } },
  { id: "M12", direction: "service", name: "Цифровая платформа обращений", scope: "city", cost: 14, lag: 1, effects: { C2: 5 } },
  { id: "M13", direction: "service", name: "Модернизация тепло- и водосетей", scope: "district", cost: 28, lag: 4, effects: { C1: 18, E2: 2 } },
  { id: "M14", direction: "service", name: "Аварийные бригады ЖКХ", scope: "city", cost: 16, lag: 1, effects: { C1: 5, C2: 2 } },
]

export const MEASURE_BY_ID = new Map(MEASURES.map((m) => [m.id, m]))
export const DISTRICT_BY_ID = new Map(DISTRICTS.map((d) => [d.id, d]))

/** Бонус начисляется, если выбраны обе меры пары. Лагом не масштабируется. */
export interface Synergy {
  pair: [MeasureId, MeasureId]
  indicator: Indicator
  bonus: number
  label: string
}

export const SYNERGIES: Synergy[] = [
  { pair: ["M1", "M2"], indicator: "T1", bonus: 2, label: "Выделенные полосы + умные светофоры" },
  { pair: ["M10", "M12"], indicator: "B1", bonus: 2, label: "Safe City + платформа обращений" },
  { pair: ["M5", "M6"], indicator: "E2", bonus: 2, label: "Чистое топливо + ветрозащитные полосы" },
]

/** Несовместимости: "global" — нельзя вместе вообще, "district" — нельзя в одном районе. */
export interface Conflict {
  pair: [MeasureId, MeasureId]
  kind: "global" | "district"
  reason: string
}

export const CONFLICTS: Conflict[] = [
  { pair: ["M1", "M3"], kind: "global", reason: "Либо выделенные полосы, либо ЛРТ — вместе не финансируются" },
  { pair: ["M4", "M7"], kind: "district", reason: "Парк и школа конкурируют за один участок" },
  { pair: ["M5", "M13"], kind: "district", reason: "Перевод на чистое топливо дублирует модернизацию сетей" },
]

/** Правила игры. */
export const BUDGET = 100
export const DECISION_COUNT = 5
export const MAX_PER_DIRECTION = 2
/** Горизонт симуляции в кварталах: доля реализованного эффекта = (HORIZON − лаг) / HORIZON. */
export const HORIZON = 8
/** Показатель ниже этого порога считается критическим и штрафуется. */
export const CRITICAL_THRESHOLD = 40

/** Одно управленческое решение: мера и, для мер типа «район», выбранный район. */
export interface Decision {
  measureId: MeasureId
  districtId: DistrictId | null
}
