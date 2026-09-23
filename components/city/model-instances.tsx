"use client"

import { Component, Suspense, useLayoutEffect, useMemo, useRef, type ReactNode } from "react"
import { useGLTF } from "@react-three/drei"
import { useThree } from "@react-three/fiber"
import * as THREE from "three"

export type CityModel =
  | "residential-slab"
  | "residential-tower"
  | "residential-courtyard"
  | "tree"
  | "bus-shelter"
  | "civic-building"
  | "streetlight"
  | "utility-cover"

export interface ModelPlacement {
  key: string
  position: [number, number, number]
  scale?: [number, number, number]
  rotation?: [number, number, number]
  color?: THREE.Color
}

interface ModelInstancesProps {
  model: CityModel
  items: ModelPlacement[]
  fallback: ReactNode
}

interface ModelSource {
  geometry: THREE.BufferGeometry
  material: THREE.MeshStandardMaterial
  transform: THREE.Matrix4
}

/** Сбой отдельного файла не должен убирать с карты остальные модели и подписи. */
class ModelBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export function ModelInstances({ model, items, fallback }: ModelInstancesProps) {
  if (items.length === 0) return null

  return (
    <ModelBoundary key={model} fallback={fallback}>
      <Suspense fallback={fallback}>
        <LoadedModel model={model} items={items} />
      </Suspense>
    </ModelBoundary>
  )
}

function LoadedModel({ model, items }: Pick<ModelInstancesProps, "model" | "items">) {
  // Несжатые локальные GLB не требуют декодеров, которые drei по умолчанию ищет на CDN.
  const { scene, animations } = useGLTF(`/models/${model}.glb`, false, false)
  const source = useMemo<ModelSource>(() => {
    const meshes: THREE.Mesh[] = []
    scene.traverse((node) => {
      if (node instanceof THREE.Mesh) meshes.push(node)
    })
    const mesh = meshes[0]
    if (
      meshes.length !== 1 ||
      !mesh ||
      mesh instanceof THREE.SkinnedMesh ||
      mesh instanceof THREE.InstancedMesh ||
      animations.length > 0 ||
      Object.keys(mesh.geometry.morphAttributes).length > 0 ||
      !(mesh.material instanceof THREE.MeshStandardMaterial) ||
      mesh.material.transparent ||
      mesh.material.opacity !== 1 ||
      !mesh.material.vertexColors ||
      !mesh.geometry.getAttribute("color")
    ) {
      throw new Error(`Модель «${model}» должна содержать один статичный меш с непрозрачным материалом и цветами вершин.`)
    }

    // Сохраняем преобразования GLB, не меняя сцену из общего кэша useGLTF.
    const transform = new THREE.Matrix4()
    const local = new THREE.Matrix4()
    let node: THREE.Object3D | null = mesh
    while (node) {
      if (node.matrixAutoUpdate) {
        local.compose(node.position, node.quaternion, node.scale)
      } else {
        local.copy(node.matrix)
      }
      transform.premultiply(local)
      node = node.parent
    }

    return { geometry: mesh.geometry, material: mesh.material, transform }
  }, [animations, model, scene])

  // Размер буфера InstancedMesh неизменяем: новый размер требует нового экземпляра.
  const capacity = Math.max(1, items.length)
  return <InstanceBatch key={capacity} source={source} items={items} capacity={capacity} />
}

function InstanceBatch({
  source,
  items,
  capacity,
}: {
  source: ModelSource
  items: ModelPlacement[]
  capacity: number
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const invalidate = useThree((state) => state.invalidate)

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const placement = new THREE.Object3D()
    const matrix = new THREE.Matrix4()
    const white = new THREE.Color("white")

    items.forEach((item, index) => {
      placement.position.fromArray(item.position)
      placement.scale.fromArray(item.scale ?? [1, 1, 1])
      placement.rotation.set(...(item.rotation ?? [0, 0, 0]))
      placement.updateMatrix()
      matrix.multiplyMatrices(placement.matrix, source.transform)
      mesh.setMatrixAt(index, matrix)
      mesh.setColorAt(index, item.color ?? white)
    })

    mesh.count = items.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingBox()
    mesh.computeBoundingSphere()
    // Карта рисует кадры по запросу; обновление буферов само по себе кадр не запускает.
    invalidate()
  }, [invalidate, items, source])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    return () => {
      // Освобождаем только буферы экземпляров: геометрия и материал принадлежат кэшу GLB.
      mesh?.dispose()
    }
  }, [])

  return (
    <instancedMesh
      ref={meshRef}
      args={[source.geometry, source.material, capacity]}
      castShadow
      receiveShadow
      dispose={null}
    />
  )
}
