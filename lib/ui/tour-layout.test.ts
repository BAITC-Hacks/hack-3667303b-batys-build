import assert from "node:assert/strict"
import test from "node:test"

import { getTourLayout, type TourRect } from "./tour-layout"

const desktop = { width: 1440, height: 900 }
const mobile = { width: 390, height: 844 }
const panel = { width: 300, height: 180 }

function overlaps(first: TourRect, second: TourRect): boolean {
  return first.left < second.left + second.width
    && first.left + first.width > second.left
    && first.top < second.top + second.height
    && first.top + first.height > second.top
}

test("подсветка добавляет отступ, а подсказка предпочитает правую сторону", () => {
  const layout = getTourLayout({
    target: { left: 500, top: 250, width: 100, height: 80 },
    viewport: desktop,
    panel,
  })

  assert.deepEqual(layout.spotlight, { left: 494, top: 244, width: 112, height: 92 })
  assert.deepEqual(layout.panel, { left: 618, top: 200 })
})

test("у правого края подсказка располагается слева и не выходит за верх экрана", () => {
  const layout = getTourLayout({
    target: { left: 1250, top: 0, width: 170, height: 44 },
    viewport: desktop,
    panel,
  })

  assert.equal(layout.panel.left + panel.width + 12, layout.spotlight.left)
  assert.equal(layout.panel.top, 8)
  assert.equal(overlaps(layout.spotlight, { ...layout.panel, ...panel }), false)
})

test("на телефоне подсказка располагается ниже широкой цели", () => {
  const layout = getTourLayout({
    target: { left: 16, top: 90, width: 358, height: 100 },
    viewport: mobile,
    panel,
  })

  assert.equal(layout.panel.top, 208)
  assert.equal(layout.panel.left, 45)
})

test("рядом с нижним краем подсказка переходит над целью", () => {
  const layout = getTourLayout({
    target: { left: 16, top: 730, width: 358, height: 70 },
    viewport: mobile,
    panel,
  })

  assert.equal(layout.panel.top + panel.height + 12, layout.spotlight.top)
  assert.equal(overlaps(layout.spotlight, { ...layout.panel, ...panel }), false)
})

test("частично скрытая цель обрезается по видимой области", () => {
  const layout = getTourLayout({
    target: { left: -30, top: -20, width: 100, height: 70 },
    viewport: mobile,
    panel,
  })

  assert.deepEqual(layout.spotlight, { left: 8, top: 8, width: 68, height: 48 })
  assert.equal(layout.panel.top, 68)
  assert.equal(layout.panel.left, 8)
})

test("цель за экраном не создаёт отрицательный размер подсветки", () => {
  for (const target of [
    { left: -800, top: -500, width: 120, height: 50 },
    { left: 900, top: 1000, width: 120, height: 50 },
  ]) {
    const layout = getTourLayout({ target, viewport: mobile, panel })
    assert.equal(layout.spotlight.width, 0)
    assert.equal(layout.spotlight.height, 0)
    assert.ok(layout.panel.left >= 8 && layout.panel.left + panel.width <= mobile.width - 8)
    assert.ok(layout.panel.top >= 8 && layout.panel.top + panel.height <= mobile.height - 8)
  }
})

test("если цель перекрывает экран, кнопки подсказки остаются в нижней видимой области", () => {
  const layout = getTourLayout({
    target: { left: -50, top: -50, width: 2000, height: 1500 },
    viewport: mobile,
    panel,
  })

  assert.deepEqual(layout.spotlight, { left: 8, top: 8, width: 374, height: 828 })
  assert.deepEqual(layout.panel, { left: 45, top: 656 })
})

test("маленькое и свёрнутое окно сохраняют допустимые координаты", () => {
  const target = { left: -20, top: -20, width: 100, height: 100 }
  assert.deepEqual(
    getTourLayout({ target, viewport: { width: 32, height: 24 }, panel: { width: 16, height: 8 } }),
    { spotlight: { left: 8, top: 8, width: 16, height: 8 }, panel: { left: 8, top: 8 } },
  )
  assert.deepEqual(
    getTourLayout({ target, viewport: { width: 12, height: 10 }, panel: { width: 0, height: 0 } }),
    { spotlight: { left: 6, top: 5, width: 0, height: 0 }, panel: { left: 6, top: 5 } },
  )
  assert.deepEqual(
    getTourLayout({ target, viewport: { width: 0, height: 0 }, panel: { width: 0, height: 0 } }),
    { spotlight: { left: 0, top: 0, width: 0, height: 0 }, panel: { left: 0, top: 0 } },
  )
})

test("подсказка остаётся в окне и не перекрывает цель, когда есть место с зазором", () => {
  for (const viewport of [mobile, { width: 768, height: 600 }, desktop]) {
    for (const left of [-60, 8, viewport.width / 2, viewport.width - 100]) {
      for (const top of [-40, 8, viewport.height / 2, viewport.height - 60]) {
        for (const width of [44, 240, viewport.width]) {
          const target = { left, top, width, height: 120 }
          const layout = getTourLayout({ target, viewport, panel })
          const spotlight = layout.spotlight
          const positionedPanel = { ...layout.panel, ...panel }

          assert.ok(spotlight.left >= 8 && spotlight.left + spotlight.width <= viewport.width - 8)
          assert.ok(spotlight.top >= 8 && spotlight.top + spotlight.height <= viewport.height - 8)
          assert.ok(positionedPanel.left >= 8 && positionedPanel.left + panel.width <= viewport.width - 8)
          assert.ok(positionedPanel.top >= 8 && positionedPanel.top + panel.height <= viewport.height - 8)

          const roomBeside = spotlight.left - 8 >= panel.width + 12
            || viewport.width - 8 - spotlight.left - spotlight.width >= panel.width + 12
          const roomAboveOrBelow = spotlight.top - 8 >= panel.height + 12
            || viewport.height - 8 - spotlight.top - spotlight.height >= panel.height + 12
          if (roomBeside || roomAboveOrBelow) assert.equal(overlaps(spotlight, positionedPanel), false)

          assert.deepEqual(getTourLayout({ target, viewport, panel }), layout)
        }
      }
    }
  }
})
