import { decodeDecisions } from "@/lib/domain/encode"
import { EVENT_BY_ID } from "@/lib/domain/events"
import { Simulator } from "@/components/sim/simulator"

/**
 * Сценарий читается из адреса на сервере и уходит в симулятор пропсами:
 * ссылкой можно поделиться, а разметка сервера и браузера совпадают.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; event?: string }>
}) {
  const params = await searchParams
  const eventId = params.event && EVENT_BY_ID.has(params.event) ? params.event : null

  return (
    <main>
      <Simulator initialDecisions={decodeDecisions(params.s)} initialEventId={eventId} />
    </main>
  )
}
