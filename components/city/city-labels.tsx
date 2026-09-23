"use client"

import { type ReactNode, type RefObject, useLayoutEffect, useMemo } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import { MathUtils, Vector3 } from "three"

export interface CityLabel {
  id: string
  position: [number, number, number]
  content: ReactNode
}

export type CityLabelRefs = RefObject<Map<string, HTMLDivElement>>

interface CityLabelProps {
  labels: CityLabel[]
  labelRefs: CityLabelRefs
}

/** Единый DOM-слой сохраняет подписи в корне страницы при пересоздании сцены. */
export function CityLabelLayer({ labels, labelRefs }: CityLabelProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {labels.map((label) => (
        <div
          key={label.id}
          ref={(element) => {
            if (element) labelRefs.current.set(label.id, element)
            else labelRefs.current.delete(label.id)
          }}
          className="absolute left-0 top-0 origin-center whitespace-nowrap"
          style={{ visibility: "hidden" }}
        >
          {label.content}
        </div>
      ))}
    </div>
  )
}

export function ProjectCityLabels({ labels, labelRefs }: CityLabelProps) {
  const invalidate = useThree((state) => state.invalidate)
  const vectors = useMemo(
    () => ({ world: new Vector3(), projected: new Vector3(), cameraPosition: new Vector3() }),
    [],
  )

  useLayoutEffect(() => {
    invalidate()
  }, [labels, invalidate])

  useFrame(({ camera, size }) => {
    // Камера могла сдвинуться в этом же кадре; проекция должна видеть новую матрицу.
    camera.updateMatrixWorld()
    camera.getWorldPosition(vectors.cameraPosition)

    for (const label of labels) {
      const element = labelRefs.current.get(label.id)
      if (!element) continue

      vectors.world.fromArray(label.position)
      vectors.projected.copy(vectors.world).applyMatrix4(camera.matrixWorldInverse)
      if (vectors.projected.z >= 0) {
        element.style.visibility = "hidden"
        continue
      }

      vectors.projected.copy(vectors.world).project(camera)
      const { x, y, z } = vectors.projected
      if (
        !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) ||
        Math.abs(x) > 1 || Math.abs(y) > 1 || Math.abs(z) > 1
      ) {
        element.style.visibility = "hidden"
        continue
      }

      const screenX = (x + 1) * size.width / 2
      const screenY = (1 - y) * size.height / 2
      const distance = vectors.world.distanceTo(vectors.cameraPosition)
      const scale = MathUtils.clamp(30 / Math.max(distance, 0.01), 0.7, 1.1)
      element.style.transform = `translate(${screenX}px, ${screenY}px) translate(-50%, -50%) scale(${scale})`
      element.style.visibility = "visible"
    }
  })

  return null
}
