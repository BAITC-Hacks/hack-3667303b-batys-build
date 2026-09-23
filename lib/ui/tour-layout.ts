export interface TourRect {
  left: number
  top: number
  width: number
  height: number
}

const EDGE = 8
const SPOTLIGHT_PADDING = 6
const PANEL_GAP = 12

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

/**
 * Подсказка следует за видимой частью цели, а не за её скрытым продолжением.
 * Размер самой панели ограничивает компонент: здесь выбирается только место.
 */
export function getTourLayout({
  target,
  viewport,
  panel,
}: {
  target: TourRect
  viewport: { width: number; height: number }
  panel: { width: number; height: number }
}): { spotlight: TourRect; panel: { left: number; top: number } } {
  const viewportWidth = Math.max(0, viewport.width)
  const viewportHeight = Math.max(0, viewport.height)
  // При свёрнутом окне отступы не должны создавать отрицательную область.
  const edgeX = Math.min(EDGE, viewportWidth / 2)
  const edgeY = Math.min(EDGE, viewportHeight / 2)
  const right = viewportWidth - edgeX
  const bottom = viewportHeight - edgeY

  const left = clamp(target.left - SPOTLIGHT_PADDING, edgeX, right)
  const top = clamp(target.top - SPOTLIGHT_PADDING, edgeY, bottom)
  const spotlightRight = clamp(
    target.left + Math.max(0, target.width) + SPOTLIGHT_PADDING,
    edgeX,
    right,
  )
  const spotlightBottom = clamp(
    target.top + Math.max(0, target.height) + SPOTLIGHT_PADDING,
    edgeY,
    bottom,
  )
  const spotlight: TourRect = {
    left,
    top,
    width: spotlightRight - left,
    height: spotlightBottom - top,
  }

  const panelWidth = Math.max(0, panel.width)
  const panelHeight = Math.max(0, panel.height)
  const maximumLeft = Math.max(edgeX, right - panelWidth)
  const maximumTop = Math.max(edgeY, bottom - panelHeight)
  const centeredLeft = clamp(left + spotlight.width / 2 - panelWidth / 2, edgeX, maximumLeft)
  const centeredTop = clamp(top + spotlight.height / 2 - panelHeight / 2, edgeY, maximumTop)

  const candidates = [
    { left: spotlightRight + PANEL_GAP, top: centeredTop },
    { left: left - PANEL_GAP - panelWidth, top: centeredTop },
    { left: centeredLeft, top: spotlightBottom + PANEL_GAP },
    { left: centeredLeft, top: top - PANEL_GAP - panelHeight },
  ]
  const position = candidates.find((candidate) => (
    candidate.left >= edgeX
    && candidate.top >= edgeY
    && candidate.left + panelWidth <= right
    && candidate.top + panelHeight <= bottom
  ))

  // Если цель занимает весь экран, сохраняем доступ к кнопкам подсказки внизу.
  return {
    spotlight,
    panel: position ?? { left: centeredLeft, top: maximumTop },
  }
}
