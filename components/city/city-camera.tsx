"use client"

import { type ComponentRef, useEffect, useRef, useState } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import { OrbitControls, PerspectiveCamera } from "@react-three/drei"
import { Vector3, type PerspectiveCamera as ThreePerspectiveCamera } from "three"

type Position = [number, number, number]
type View = "orbit" | "top"

interface CameraPose {
  position: Position
  target: Position
}

interface CameraTransition {
  fromPosition: Vector3
  fromTarget: Vector3
  toPosition: Vector3
  toTarget: Vector3
  elapsed: number
}

function cameraPose(view: View, focus: Position | null, aspect: number): CameraPose {
  let pose: CameraPose
  if (focus) {
    const [x, y, z] = focus
    pose = {
      position: view === "top" ? [x, y + 23, z + 0.01] : [x + 9, y + 9, z + 13],
      target: [x, y + 2.2, z],
    }
  } else {
    pose = {
      position: view === "top" ? [0, 53, 2.01] : [28, 34, 42],
      target: view === "top" ? [0, 0, 2] : [0, 0, 7],
    }
  }

  // В узком окне отступ сохраняет весь город, не меняя ракурс широкого экрана.
  const distanceFactor = Math.max(1, 1.35 / aspect)
  const [x, y, z] = pose.position
  const [targetX, targetY, targetZ] = pose.target
  return {
    position: [
      targetX + (x - targetX) * distanceFactor,
      targetY + (y - targetY) * distanceFactor,
      targetZ + (z - targetZ) * distanceFactor,
    ],
    target: pose.target,
  }
}

export function CityCamera({ view, focus, revision }: { view: View; focus: Position | null; revision: number }) {
  const cameraRef = useRef<ThreePerspectiveCamera>(null)
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null)
  const transition = useRef<CameraTransition | null>(null)
  const reducedMotion = useRef(false)
  const activeCamera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const aspect = useThree(({ size }) => (
    size.width > 0 && size.height > 0 ? size.width / size.height : 1.35
  ))
  const [initialPose] = useState(() => cameraPose(view, focus, aspect))
  const hasFocus = focus !== null
  const [focusX, focusY, focusZ] = focus ?? [0, 0, 2]

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)")
    const syncPreference = () => {
      reducedMotion.current = preference.matches
      if (transition.current) invalidate()
    }

    syncPreference()
    preference.addEventListener("change", syncPreference)
    return () => preference.removeEventListener("change", syncPreference)
  }, [invalidate])

  useEffect(() => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls || activeCamera !== camera) return

    const pose = cameraPose(view, hasFocus ? [focusX, focusY, focusZ] : null, aspect)
    const toPosition = new Vector3(...pose.position)
    const toTarget = new Vector3(...pose.target)

    if (reducedMotion.current) {
      transition.current = null
      camera.position.copy(toPosition)
      controls.target.copy(toTarget)
      controls.update()
      invalidate()
      return
    }

    if (
      camera.position.distanceToSquared(toPosition) < 0.000001 &&
      controls.target.distanceToSquared(toTarget) < 0.000001
    ) {
      transition.current = null
      return
    }

    transition.current = {
      fromPosition: camera.position.clone(),
      fromTarget: controls.target.clone(),
      toPosition,
      toTarget,
      elapsed: 0,
    }
    invalidate()
  }, [view, hasFocus, focusX, focusY, focusZ, aspect, revision, activeCamera, invalidate])

  useFrame((_, delta) => {
    const movement = transition.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!movement || !camera || !controls) return

    // После паузы вкладки камера продолжает движение без резкого скачка.
    movement.elapsed += Math.min(delta, 0.05)
    const progress = reducedMotion.current ? 1 : Math.min(movement.elapsed / 0.6, 1)
    const eased = progress * progress * (3 - 2 * progress)
    camera.position.lerpVectors(movement.fromPosition, movement.toPosition, eased)
    controls.target.lerpVectors(movement.fromTarget, movement.toTarget, eased)
    controls.update()

    if (progress < 1) invalidate()
    else transition.current = null
  })

  return (
    <>
      <PerspectiveCamera
        ref={cameraRef}
        makeDefault
        position={initialPose.position}
        fov={45}
        near={0.1}
        far={350}
      />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={initialPose.target}
        enableDamping={false}
        enableRotate={view === "orbit"}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={7}
        maxDistance={200}
        onStart={() => {
          // Ручное управление сразу отменяет автоматический перелёт.
          transition.current = null
        }}
      />
    </>
  )
}
