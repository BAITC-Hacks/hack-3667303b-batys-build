"use client"

import { Suspense, useMemo, useRef, useState } from "react"
import { Canvas } from "@react-three/fiber"
import { Html, Instance, Instances, OrbitControls, PerspectiveCamera } from "@react-three/drei"
import * as THREE from "three"

import { MEASURE_BY_ID, type Decision, type Direction, type DistrictId } from "@/lib/domain/city"
import type { DistrictBreakdown, ScenarioBreakdown } from "@/lib/engine/score"

/**
 * Карта города: пять кварталов, высота и цвет застройки отражают оценку района,
 * а принятые меры появляются на земле предметами — деревьями, остановками,
 * фонарями, корпусами школ и поликлиник.
 *
 * Геометрия целиком процедурная: ни одной внешней модели, чтобы страница
 * оставалась лёгкой и ничего не нужно было докачивать.
 */

interface Plot {
  id: DistrictId
  x: number
  z: number
  width: number
  depth: number
}

/** Условная схема города: левый берег, правый берег и южная полоса. */
const PLOTS: Plot[] = [
  { id: "esil", x: -7.5, z: -5.5, width: 13, depth: 9 },
  { id: "almaty", x: 7.5, z: -5.5, width: 13, depth: 9 },
  { id: "saryarka", x: -7.5, z: 4.5, width: 13, depth: 9 },
  { id: "baikonur", x: 7.5, z: 4.5, width: 13, depth: 9 },
  { id: "nura", x: 0, z: 13, width: 28, depth: 6 },
]

const PLOT_BY_ID = new Map(PLOTS.map((plot) => [plot.id, plot]))

/** Оценка района → цвет: 45 и ниже красный, 65 и выше зелёный. */
function scoreColor(score: number): THREE.Color {
  const t = THREE.MathUtils.clamp((score - 45) / 20, 0, 1)
  return new THREE.Color().setHSL(THREE.MathUtils.lerp(0.02, 0.36, t), 0.55, 0.45)
}

/** Детерминированный псевдослучайный разброс, чтобы кварталы не выглядели решёткой. */
function jitter(seed: number): number {
  const value = Math.sin(seed * 127.1) * 43758.5453
  return value - Math.floor(value)
}

interface Building {
  key: string
  position: [number, number, number]
  scale: [number, number, number]
  color: THREE.Color
}

function buildingsFor(district: DistrictBreakdown, plot: Plot): Building[] {
  const buildings: Building[] = []
  const color = scoreColor(district.after)
  const cols = Math.max(3, Math.round(plot.width / 2.4))
  const rows = Math.max(2, Math.round(plot.depth / 2.4))
  const stepX = plot.width / cols
  const stepZ = plot.depth / rows

  let seed = plot.x * 13 + plot.z * 7
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      seed += 1
      const roll = jitter(seed)
      if (roll < 0.22) continue // пустыри и дворы

      // Чем выше оценка района, тем плотнее и выше застройка.
      const quality = THREE.MathUtils.clamp((district.after - 45) / 20, 0, 1)
      const height = 0.6 + roll * (0.8 + quality * 3.2)
      const footprint = 0.9 + jitter(seed * 2.7) * 0.6

      buildings.push({
        key: `${plot.id}-${col}-${row}`,
        position: [
          plot.x - plot.width / 2 + stepX * (col + 0.5) + (jitter(seed * 3.1) - 0.5) * 0.4,
          height / 2,
          plot.z - plot.depth / 2 + stepZ * (row + 0.5) + (jitter(seed * 5.3) - 0.5) * 0.4,
        ],
        scale: [footprint, height, footprint],
        color,
      })
    }
  }
  return buildings
}

/** Какой предмет ставим на землю за принятую меру. */
const PROP_BY_DIRECTION: Record<Direction, "tree" | "stop" | "block" | "light" | "pipe"> = {
  eco: "tree",
  transport: "stop",
  social: "block",
  safety: "light",
  service: "pipe",
}

interface Prop {
  key: string
  kind: "tree" | "stop" | "block" | "light" | "pipe"
  position: [number, number, number]
}

function propsFor(decisions: Decision[]): Prop[] {
  const props: Prop[] = []

  decisions.forEach((decision, index) => {
    const measure = MEASURE_BY_ID.get(decision.measureId)
    if (!measure) return
    const kind = PROP_BY_DIRECTION[measure.direction]
    // Городские меры рассыпаются по всем районам, районные — только в своём.
    const targets = measure.scope === "city" ? PLOTS : PLOTS.filter((plot) => plot.id === decision.districtId)

    for (const plot of targets) {
      const count = measure.scope === "city" ? 3 : 6
      for (let i = 0; i < count; i++) {
        const seed = index * 31 + i * 7 + plot.x
        props.push({
          key: `${decision.measureId}-${plot.id}-${i}`,
          kind,
          position: [
            plot.x - plot.width / 2 + jitter(seed) * plot.width,
            0,
            plot.z - plot.depth / 2 + jitter(seed * 1.7) * plot.depth,
          ],
        })
      }
    }
  })

  return props
}

export default function CityMap({
  breakdown,
  decisions,
}: {
  breakdown: ScenarioBreakdown
  decisions: Decision[]
}) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [view, setView] = useState<"orbit" | "top">("orbit")

  const buildings = useMemo(
    () =>
      breakdown.districts.flatMap((district) => {
        const plot = PLOT_BY_ID.get(district.id)
        return plot ? buildingsFor(district, plot) : []
      }),
    [breakdown.districts],
  )
  const props = useMemo(() => propsFor(decisions), [decisions])

  const screenshot = () => {
    if (!canvas) return
    const link = document.createElement("a")
    link.download = `akim-city-${breakdown.score.toFixed(2)}.png`
    link.href = canvas.toDataURL("image/png")
    link.click()
  }

  return (
    <section className="mt-6" aria-label="Карта города">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Город</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setView(view === "orbit" ? "top" : "orbit")}
            className="rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs font-medium transition hover:bg-panel-raised"
          >
            {view === "orbit" ? "Вид сверху" : "Вид с орбиты"}
          </button>
          <button
            type="button"
            onClick={screenshot}
            disabled={!canvas}
            className="rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs font-medium transition hover:bg-panel-raised disabled:opacity-40"
          >
            Сохранить кадр
          </button>
        </div>
      </div>

      <div className="h-[460px] overflow-hidden rounded-lg border border-line bg-panel">
        <Canvas
          shadows
          dpr={[1, 1.5]}
          frameloop="demand"
          gl={{ antialias: true, preserveDrawingBuffer: true }}
          onCreated={({ gl }) => setCanvas(gl.domElement)}
        >
          <color attach="background" args={["#1b1d22"]} />
          <ambientLight intensity={1.1} />
          <directionalLight
            castShadow
            position={[14, 20, 8]}
            intensity={2}
            shadow-mapSize={[1024, 1024]}
            shadow-camera-left={-26}
            shadow-camera-right={26}
            shadow-camera-top={26}
            shadow-camera-bottom={-26}
          />

          {view === "top" ? (
            <PerspectiveCamera makeDefault position={[0, 42, 6]} fov={45} />
          ) : (
            <PerspectiveCamera makeDefault position={[0, 22, 30]} fov={50} />
          )}
          <OrbitControls
            makeDefault
            target={[0, 0, 3]}
            maxPolarAngle={Math.PI / 2.05}
            minDistance={12}
            maxDistance={70}
            enableRotate={view === "orbit"}
          />

          <Suspense fallback={null}>
            <Ground />
            <Plots districts={breakdown.districts} />
            <Buildings buildings={buildings} />
            <Props props={props} />
            <Labels districts={breakdown.districts} />
          </Suspense>
        </Canvas>
      </div>

      <p className="mt-2 text-xs text-muted">
        Высота и цвет застройки отражают оценку района: красный — ниже 45, зелёный — выше 65.
        Предметы на земле появляются за принятые меры: деревья за экологию, остановки за
        транспорт, корпуса за соцсферу, фонари за безопасность, люки за городские сервисы.
      </p>
    </section>
  )
}

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 3]} receiveShadow>
      <planeGeometry args={[60, 48]} />
      <meshStandardMaterial color="#2a2d33" />
    </mesh>
  )
}

/** Подложка квартала: цвет держит оценку района, читается и сверху, и с орбиты. */
function Plots({ districts }: { districts: DistrictBreakdown[] }) {
  return (
    <>
      {districts.map((district) => {
        const plot = PLOT_BY_ID.get(district.id)
        if (!plot) return null
        const color = scoreColor(district.after)
        return (
          <mesh
            key={district.id}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[plot.x, 0, plot.z]}
            receiveShadow
          >
            <planeGeometry args={[plot.width, plot.depth]} />
            <meshStandardMaterial color={color} opacity={0.35} transparent />
          </mesh>
        )
      })}
    </>
  )
}

function Buildings({ buildings }: { buildings: Building[] }) {
  return (
    <Instances limit={Math.max(1, buildings.length)} castShadow receiveShadow>
      <boxGeometry />
      <meshStandardMaterial roughness={0.75} />
      {buildings.map((building) => (
        <Instance
          key={building.key}
          position={building.position}
          scale={building.scale}
          color={building.color}
        />
      ))}
    </Instances>
  )
}

function Props({ props }: { props: Prop[] }) {
  const groups = useMemo(() => {
    const byKind = new Map<Prop["kind"], Prop[]>()
    for (const prop of props) {
      const list = byKind.get(prop.kind) ?? []
      list.push(prop)
      byKind.set(prop.kind, list)
    }
    return byKind
  }, [props])

  return (
    <>
      {[...groups.entries()].map(([kind, items]) => (
        <PropGroup key={kind} kind={kind} items={items} />
      ))}
    </>
  )
}

const PROP_STYLE: Record<
  Prop["kind"],
  { color: string; height: number; radius: number; shape: "cone" | "box" | "cylinder" }
> = {
  tree: { color: "#3f9c5a", height: 1.6, radius: 0.5, shape: "cone" },
  stop: { color: "#4a8fd4", height: 0.9, radius: 0.55, shape: "box" },
  block: { color: "#d9b44a", height: 1.9, radius: 0.85, shape: "box" },
  light: { color: "#e6693c", height: 2.2, radius: 0.12, shape: "cylinder" },
  pipe: { color: "#a678d0", height: 0.25, radius: 0.45, shape: "cylinder" },
}

function PropGroup({ kind, items }: { kind: Prop["kind"]; items: Prop[] }) {
  const style = PROP_STYLE[kind]
  const geometry = useRef<THREE.BufferGeometry>(null)

  return (
    <Instances limit={Math.max(1, items.length)} castShadow>
      {style.shape === "cone" ? (
        <coneGeometry ref={geometry} args={[style.radius, style.height, 7]} />
      ) : style.shape === "cylinder" ? (
        <cylinderGeometry ref={geometry} args={[style.radius, style.radius, style.height, 8]} />
      ) : (
        <boxGeometry ref={geometry} args={[style.radius * 2, style.height, style.radius * 2]} />
      )}
      <meshStandardMaterial color={style.color} roughness={0.6} />
      {items.map((item) => (
        <Instance
          key={item.key}
          position={[item.position[0], style.height / 2, item.position[2]]}
        />
      ))}
    </Instances>
  )
}

/**
 * Подписи районов сделаны через Html, а не через drei Text: троика тянет шрифт
 * из сети и не гарантирует кириллицу, а DOM-подпись рисуется всегда и наследует
 * шрифт страницы.
 */
function Labels({ districts }: { districts: DistrictBreakdown[] }) {
  return (
    <>
      {districts.map((district) => {
        const plot = PLOT_BY_ID.get(district.id)
        if (!plot) return null
        return (
          <Html
            key={district.id}
            position={[plot.x, 5.4, plot.z]}
            center
            distanceFactor={26}
            zIndexRange={[10, 0]}
            style={{ pointerEvents: "none" }}
          >
            <div
              style={{
                whiteSpace: "nowrap",
                borderRadius: 6,
                padding: "2px 8px",
                fontSize: 13,
                fontWeight: 600,
                color: district.isWeakest ? "#f0a23c" : "#ececed",
                background: "rgba(16, 18, 22, 0.78)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              {district.name} {district.after.toFixed(1)}
            </div>
          </Html>
        )
      })}
    </>
  )
}
