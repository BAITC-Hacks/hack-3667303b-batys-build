/**
 * Компактная запись сценария строкой: M7:nura,M8:nura,M12,M5:saryarka
 *
 * Базы данных в проекте нет намеренно, поэтому сценарий живёт в адресе страницы.
 * Побочная польза: ссылкой можно обменяться — команды сравнивают наборы, просто
 * переслав друг другу URL.
 */

import { DISTRICT_BY_ID, MEASURE_BY_ID, type Decision, type DistrictId, type MeasureId } from "@/lib/domain/city"

export function encodeDecisions(decisions: Decision[]): string {
  return decisions
    .map((decision) => (decision.districtId ? `${decision.measureId}:${decision.districtId}` : decision.measureId))
    .join(",")
}

export function decodeDecisions(value: string | undefined | null): Decision[] {
  if (!value) return []

  const decisions: Decision[] = []
  for (const token of value.split(",").slice(0, 5)) {
    const [measureId, districtId] = token.trim().split(":")
    if (!MEASURE_BY_ID.has(measureId as MeasureId)) continue
    if (districtId && !DISTRICT_BY_ID.has(districtId as DistrictId)) continue
    decisions.push({
      measureId: measureId as MeasureId,
      districtId: (districtId as DistrictId) ?? null,
    })
  }
  return decisions
}
