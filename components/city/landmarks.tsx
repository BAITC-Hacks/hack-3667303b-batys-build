"use client"

import { useMemo } from "react"
import { Instance, Instances } from "@react-three/drei"
import * as THREE from "three"
import { ModelInstances, type CityModel, type ModelPlacement } from "./model-instances"

export const LANDMARKS = [
  { id: "baiterek", name: "Байтерек", caption: "Золотая сфера над городом", position: [0, 0.10, -2.5], height: 6.8, radius: 2.7 },
  { id: "khan-shatyr", name: "Хан Шатыр", caption: "Город под одним шатром", position: [-9, 0.10, -13], height: 4.7, radius: 3.5 },
  { id: "peace-pyramid", name: "Дворец мира", caption: "Пирамида мира и согласия", position: [9, 0.10, -13], height: 3.5, radius: 2.8 },
  { id: "nur-alem", name: "Нур Алем", caption: "Сфера EXPO", position: [8, 0.10, 14], height: 4.4, radius: 3.0 },
] satisfies { id: CityModel; name: string; caption: string; position: [number, number, number]; height: number; radius: number }[]

export type LandmarkId = (typeof LANDMARKS)[number]["id"]

/** Площади остаются свободными при любом сценарии, чтобы модели не пересекались. */
export function occupiesLandmarkSite(x: number, z: number, padding: number) {
  return LANDMARKS.some(({ position, radius }) => Math.hypot(x - position[0], z - position[2]) < radius + padding)
}

export function Landmarks({ selected }: {
  selected: LandmarkId | null
}) {
  return LANDMARKS.map((landmark) => (
    <group key={landmark.id}>
      <mesh position={[landmark.position[0], 0.025, landmark.position[2]]} receiveShadow>
        <cylinderGeometry args={[landmark.radius, landmark.radius, 0.15, 48]} />
        <meshStandardMaterial color="#a7b4b1" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[landmark.position[0], 0.104, landmark.position[2]]}>
        <ringGeometry args={[landmark.radius - 0.16, landmark.radius - 0.10, 64]} />
        <meshBasicMaterial color={selected === landmark.id ? "#ffde8a" : "#e2c483"} />
      </mesh>
      <ModelInstances
        model={landmark.id}
        items={[{ key: landmark.id, position: landmark.position }]}
        fallback={<LandmarkFallback id={landmark.id} position={landmark.position} />}
      />
    </group>
  ))
}

function LandmarkFallback({ id, position }: { id: LandmarkId; position: [number, number, number] }) {
  if (id === "baiterek") return (
    <group position={position}>
      <mesh position={[0, 2.5, 0]} castShadow>
        <cylinderGeometry args={[0.55, 0.22, 5, 12]} />
        <meshStandardMaterial color="#e2e7e4" />
      </mesh>
      <mesh position={[0, 5.5, 0]} castShadow>
        <sphereGeometry args={[1.05, 20, 12]} />
        <meshStandardMaterial color="#e6b750" metalness={0.35} roughness={0.35} />
      </mesh>
    </group>
  )
  if (id === "nur-alem") return (
    <mesh position={[position[0], position[1] + 2.2, position[2]]} castShadow>
      <sphereGeometry args={[1.9, 24, 16]} />
      <meshStandardMaterial color="#438caa" roughness={0.3} metalness={0.25} />
    </mesh>
  )
  return (
    <mesh position={[position[0], position[1] + 1.9, position[2]]} rotation={[0, Math.PI / 4, 0]} castShadow>
      <coneGeometry args={[id === "khan-shatyr" ? 2.7 : 2.65, 3.8, id === "khan-shatyr" ? 32 : 4]} />
      <meshStandardMaterial color={id === "khan-shatyr" ? "#ded5b5" : "#5893a3"} roughness={0.5} />
    </mesh>
  )
}

const riverZ = (x: number) => 9.8 + Math.sin(x * 0.16) * 0.45

function riverStrip(halfWidth: number) {
  const shape = new THREE.Shape()
  for (let i = 0; i <= 64; i++) {
    const x = -21 + i * 42 / 64
    if (i === 0) shape.moveTo(x, riverZ(x) - halfWidth)
    else shape.lineTo(x, riverZ(x) - halfWidth)
  }
  for (let i = 64; i >= 0; i--) {
    const x = -21 + i * 42 / 64
    shape.lineTo(x, riverZ(x) + halfWidth)
  }
  shape.closePath()
  return shape
}

const PARK_TREES: ModelPlacement[] = [-17, -14, -11, -5, -2, 1, 4, 14, 17].flatMap((x, index) => [
  { key: `bank-${x}`, position: [x, 0, riverZ(x) + 1.65], scale: [0.7, 0.8 + (index % 3) * 0.1, 0.7] },
  { key: `boulevard-${x}`, position: [x, 0, -16.6], scale: [0.8, 1, 0.8] },
])

/** Постоянные городские ориентиры не зависят от балла и не изображают эффект мер. */
export function CityLandscape() {
  const water = useMemo(() => riverStrip(0.95), [])
  const banks = useMemo(() => riverStrip(1.28), [])
  return (
    <>
      <mesh position={[0, -0.36, 1]} receiveShadow>
        <boxGeometry args={[43, 0.65, 38]} />
        <meshStandardMaterial color="#24333a" roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.72, 1]}>
        <boxGeometry args={[43.5, 0.10, 38.5]} />
        <meshStandardMaterial color="#7eaaac" metalness={0.25} roughness={0.5} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.008, 0]} receiveShadow>
        <shapeGeometry args={[banks]} />
        <meshStandardMaterial color="#6b8d91" side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <shapeGeometry args={[water]} />
        <meshStandardMaterial color="#13687d" metalness={0.3} roughness={0.26} side={THREE.DoubleSide} />
      </mesh>
      {[-10.5, -0.5, 7.9, 18].map((z) => (
        <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, z]} receiveShadow>
          <planeGeometry args={[38, 0.6]} />
          <meshStandardMaterial color="#586369" />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.017, -3.5]} receiveShadow>
        <planeGeometry args={[1.65, 21]} />
        <meshStandardMaterial color="#a7b4b1" />
      </mesh>
      {[-7, 3].map((x) => (
        <group key={x} position={[x, 0, riverZ(x)]}>
          <mesh position={[0, 0.12, 0]} receiveShadow castShadow>
            <boxGeometry args={[1.9, 0.24, 3.3]} />
            <meshStandardMaterial color="#b7c1bc" />
          </mesh>
          {[-0.85, 0.85].map((offset) => (
            <mesh key={offset} position={[offset, 0.36, 0]} castShadow>
              <boxGeometry args={[0.08, 0.32, 3.3]} />
              <meshStandardMaterial color="#dce5dd" />
            </mesh>
          ))}
        </group>
      ))}
      <Instances limit={44} frames={1}>
        <boxGeometry args={[0.55, 0.016, 0.035]} />
        <meshBasicMaterial color="#a1b2b3" />
        {Array.from({ length: 22 }, (_, index) => [-10.5, 18].map((z) => (
          <Instance key={`${index}-${z}`} position={[-18 + index * 1.7, 0.029, z]} />
        )))}
      </Instances>
      <ModelInstances model="tree" items={PARK_TREES} fallback={null} />
    </>
  )
}
