"use client"

import { useMemo, useRef, useState } from "react"
import { Canvas } from "@react-three/fiber"
import { Instance, Instances } from "@react-three/drei"
import * as THREE from "three"

import { MEASURE_BY_ID, type Decision, type Direction, type DistrictId } from "@/lib/domain/city"
import type { DistrictBreakdown, ScenarioBreakdown } from "@/lib/engine/score"
import { ModelInstances, type CityModel, type ModelPlacement } from "./model-instances"
import { CityCamera } from "./city-camera"
import { CityLandscape, LANDMARKS, Landmarks, occupiesLandmarkSite, type LandmarkId } from "./landmarks"
import { CityLabelLayer, ProjectCityLabels, type CityLabel } from "./city-labels"

/**
 * Карта города: пять кварталов, высота и цвет застройки отражают оценку района,
 * а принятые меры появляются на земле предметами — деревьями, остановками,
 * фонарями, корпусами школ и поликлиник.
 *
 * Локальные GLB используют общую геометрию через инстансинг; пока модель
 * загружается или недоступна, карта показывает процедурную замену.
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
  { id: "saryarka", x: -7.5, z: 4, width: 13, depth: 8 },
  { id: "baikonur", x: 7.5, z: 4, width: 13, depth: 8 },
  { id: "nura", x: 0, z: 14, width: 28, depth: 6 },
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

const BUILDING_MODELS = [
  "residential-slab",
  "residential-tower",
  "residential-courtyard",
] as const satisfies readonly CityModel[]

interface Building extends ModelPlacement {
  model: (typeof BUILDING_MODELS)[number]
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
      const x = plot.x - plot.width / 2 + stepX * (col + 0.5) + (jitter(seed * 3.1) - 0.5) * 0.4
      const z = plot.z - plot.depth / 2 + stepZ * (row + 0.5) + (jitter(seed * 5.3) - 0.5) * 0.4
      if (occupiesLandmarkSite(x, z, footprint * 0.72)) continue

      buildings.push({
        key: `${plot.id}-${col}-${row}`,
        model: BUILDING_MODELS[Math.floor(jitter(seed * 4.3) * BUILDING_MODELS.length)],
        position: [x, 0, z],
        scale: [footprint, height, footprint],
        rotation: [0, Math.floor(jitter(seed * 8.3) * 4) * Math.PI / 2, 0],
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

interface Prop extends ModelPlacement {
  kind: "tree" | "stop" | "block" | "light" | "pipe"
}

const PROP_MODELS: Record<Prop["kind"], CityModel> = {
  tree: "tree",
  stop: "bus-shelter",
  block: "civic-building",
  light: "streetlight",
  pipe: "utility-cover",
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
        const x = plot.x - plot.width / 2 + jitter(seed) * plot.width
        const z = plot.z - plot.depth / 2 + jitter(seed * 1.7) * plot.depth
        if (occupiesLandmarkSite(x, z, 1.1)) continue
        props.push({
          key: `${decision.measureId}-${plot.id}-${i}`,
          kind,
          position: [x, 0, z],
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
  const [selected, setSelected] = useState<LandmarkId | null>(null)
  const [cameraRevision, setCameraRevision] = useState(0)
  const landmark = LANDMARKS.find((item) => item.id === selected)
  const labelRefs = useRef(new Map<string, HTMLDivElement>())

  const focusLandmark = (id: LandmarkId) => {
    setSelected(id)
    setView("orbit")
    setCameraRevision((revision) => revision + 1)
  }

  const labels: CityLabel[] = [
    ...(selected ? [] : breakdown.districts.flatMap((district): CityLabel[] => {
      const plot = PLOT_BY_ID.get(district.id)
      if (!plot) return []
      return [{
        id: district.id,
        position: [plot.x, 5.4, plot.z],
        content: (
          <span className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-sm ${district.isWeakest ? "border-amber-200 bg-amber-50/95 text-amber-900" : "border-white bg-white/95 text-foreground"}`}>
            {district.name} {district.after.toFixed(1)}
          </span>
        ),
      }]
    })),
    ...LANDMARKS.filter((item) => !selected || item.id === selected).map((item): CityLabel => ({
      id: item.id,
      position: [item.position[0], item.height + 0.6, item.position[2]],
      content: (
        <button
          type="button"
          onClick={() => focusLandmark(item.id)}
          aria-label={`Приблизить: ${item.name}`}
          aria-pressed={selected === item.id}
          className="pointer-events-auto rounded-full border border-white bg-white/95 px-3 py-1.5 text-xs font-semibold text-accent shadow-sm transition hover:border-accent/40 hover:bg-emerald-50"
        >
          {item.name}
        </button>
      ),
    })),
  ]

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
    <section className="rounded-3xl border border-line bg-panel p-4 shadow-sm sm:p-5" aria-label="Карта города">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Город ваших решений</h2>
          <p className="mt-1 text-xs text-muted">Астана · исследуйте изменения на карте</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setView(view === "orbit" ? "top" : "orbit")}
            className="min-h-10 rounded-xl border border-line bg-panel px-3.5 py-2 text-xs font-semibold transition hover:border-accent/30 hover:bg-panel-raised"
          >
            {view === "orbit" ? "Вид сверху" : "Вид с орбиты"}
          </button>
          <button
            type="button"
            onClick={screenshot}
            disabled={!canvas}
            className="min-h-10 rounded-xl border border-line bg-panel px-3.5 py-2 text-xs font-semibold transition hover:border-accent/30 hover:bg-panel-raised disabled:opacity-40"
          >
            Сохранить кадр
          </button>
        </div>
      </div>

      <div className="relative h-[540px] overflow-hidden rounded-2xl border border-[#d4e6e3] bg-[#e5f1ef] sm:h-[600px]">
        <div className="pointer-events-none absolute left-3 right-3 top-3 z-20 w-fit max-w-[calc(100%-1.5rem)] rounded-xl border border-white/80 bg-white/90 px-3.5 py-3 shadow-sm backdrop-blur-sm sm:left-4 sm:top-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Городские ориентиры</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{landmark?.name ?? "Силуэты столицы"}</p>
          <p className="mt-1 text-xs text-muted">{landmark?.caption ?? "Выберите место для крупного плана"}</p>
        </div>
        <Canvas
          shadows={{ type: THREE.PCFShadowMap }}
          dpr={[1, 1.5]}
          frameloop="demand"
          gl={{ antialias: true, preserveDrawingBuffer: true }}
          onCreated={({ gl }) => setCanvas(gl.domElement)}
        >
          <color attach="background" args={["#e5f1ef"]} />
          <ambientLight intensity={1} />
          <hemisphereLight args={["#edf8ff", "#8caaa0", 1.2]} />
          <directionalLight
            castShadow
            position={[-14, 26, 14]}
            color="#fff4dc"
            intensity={2.3}
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-30}
            shadow-camera-right={30}
            shadow-camera-top={30}
            shadow-camera-bottom={-30}
            shadow-camera-far={80}
            shadow-normalBias={0.035}
          />
          <CityCamera view={view} focus={landmark?.position ?? null} revision={cameraRevision} />
          <CityLandscape />
          <Plots districts={breakdown.districts} />
          <Buildings buildings={buildings} />
          <Props props={props} />
          <Landmarks selected={selected} />
          <ProjectCityLabels labels={labels} labelRefs={labelRefs} />
        </Canvas>
        <CityLabelLayer labels={labels} labelRefs={labelRefs} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2" aria-label="Городские ориентиры">
        <button
          type="button"
          onClick={() => { setSelected(null); setView("orbit"); setCameraRevision((revision) => revision + 1) }}
          aria-pressed={selected === null}
          className={`min-h-10 rounded-full border px-3.5 py-2 text-xs font-semibold transition ${selected === null ? "border-accent bg-accent text-white shadow-sm" : "border-line bg-panel text-muted hover:border-accent/30 hover:bg-panel-raised hover:text-foreground"}`}
        >
          Весь город
        </button>
        {LANDMARKS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => focusLandmark(item.id)}
            aria-pressed={selected === item.id}
            className={`min-h-10 rounded-full border px-3.5 py-2 text-xs font-semibold transition ${selected === item.id ? "border-accent bg-accent text-white shadow-sm" : "border-line bg-panel text-muted hover:border-accent/30 hover:bg-panel-raised hover:text-foreground"}`}
          >
            {item.name}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4 text-xs text-muted">
        <span className="font-medium text-foreground">Оценка района</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#c55243]" aria-hidden="true" />45 и ниже</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#40a254]" aria-hidden="true" />65 и выше</span>
        <span className="sm:ml-auto">Планировка условная</span>
      </div>
      <details className="mt-3 text-xs leading-relaxed text-muted">
        <summary className="w-fit cursor-pointer font-medium transition hover:text-accent">Как решения меняют город</summary>
        <p className="mt-2 max-w-3xl">
          Высота и цвет застройки отражают оценку района. Предметы на земле появляются за
          принятые меры: деревья за экологию, остановки за транспорт, корпуса за соцсферу,
          фонари за безопасность, люки за городские сервисы. Памятники и набережная — постоянные ориентиры.
        </p>
      </details>
    </section>
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
  const groups = useMemo(
    () => BUILDING_MODELS.map((model) => ({
      model,
      items: buildings.filter((building) => building.model === model),
    })),
    [buildings],
  )

  return groups.map(({ model, items }) => (
    <ModelInstances
      key={model}
      model={model}
      items={items}
      fallback={<BuildingPrimitives buildings={items} />}
    />
  ))
}

function BuildingPrimitives({ buildings }: { buildings: Building[] }) {
  return (
    <Instances key={buildings.length} limit={Math.max(1, buildings.length)} castShadow receiveShadow>
      <boxGeometry />
      <meshStandardMaterial roughness={0.75} />
      {buildings.map((building) => (
        <Instance
          key={building.key}
          position={[building.position[0], building.scale[1] / 2, building.position[2]]}
          scale={building.scale}
          rotation={building.rotation}
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
  return (
    <ModelInstances
      model={PROP_MODELS[kind]}
      items={items}
      fallback={<PropPrimitives kind={kind} items={items} />}
    />
  )
}

function PropPrimitives({ kind, items }: { kind: Prop["kind"]; items: Prop[] }) {
  const style = PROP_STYLE[kind]

  return (
    <Instances key={items.length} limit={Math.max(1, items.length)} castShadow>
      {style.shape === "cone" ? (
        <coneGeometry args={[style.radius, style.height, 7]} />
      ) : style.shape === "cylinder" ? (
        <cylinderGeometry args={[style.radius, style.radius, style.height, 8]} />
      ) : (
        <boxGeometry args={[style.radius * 2, style.height, style.radius * 2]} />
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

