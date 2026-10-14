import { useState } from "react"
import { C } from "@/lib/theme"
import type { Bloc, BlocCategory } from "./types"
import { BLOC_CATEGORIES } from "./types"

const VIOLET = "#FFC933"
const VIOLET_S = "rgba(123,111,255,0.12)"

const BLOC_PALETTE = [
  "#FFC933", "#F97316", "#22C55E", "#EF4444",
  "#3B9EFF", "#FACC15", "#EC4899", "#14B8A6",
]

type BlocFormData = Omit<Bloc, 'id' | 'exercices' | 'sort_order'>

interface BlocFormProps {
  initial?: Partial<Bloc>
  onSubmit: (bloc: BlocFormData) => void
  onCancel: () => void
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 4,
  border: "1px solid " + C.brdL, background: C.s2,
  color: C.tx, fontSize: 13, fontFamily: "inherit",
  outline: "none", boxSizing: "border-box",
}

const pillBase: React.CSSProperties = {
  padding: "6px 14px", borderRadius: 7,
  border: "1px solid " + C.brdL, background: "transparent",
  color: C.tx3, fontSize: 12, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit", transition: "all 120ms",
}

function pill(active: boolean): React.CSSProperties {
  return {
    ...pillBase,
    border: "1px solid " + (active ? VIOLET : C.brdL),
    background: active ? VIOLET_S : "transparent",
    color: active ? VIOLET : C.tx3,
    fontWeight: active ? 700 : 600,
  }
}

export function BlocForm({ initial, onSubmit, onCancel }: BlocFormProps) {
  const [name, setName] = useState(initial?.name ?? "")
  const [category, setCategory] = useState<BlocCategory>(initial?.category ?? 'Mixte')
  const [color, setColor] = useState<string>(initial?.color ?? BLOC_PALETTE[0])
  const [seriesMode, setSeriesMode] = useState<'libre' | 'fixe'>(initial?.series_mode ?? 'libre')
  const [seriesCount, setSeriesCount] = useState<number>(initial?.series_count ?? 4)
  const [timingMode, setTimingMode] = useState<'libre' | 'depart' | 'repos'>(initial?.timing_mode ?? 'libre')
  const [timingDepartMin, setTimingDepartMin] = useState<number>(initial?.timing_depart_min ?? 3)
  const [timingDepartSec, setTimingDepartSec] = useState<number>(initial?.timing_depart_sec ?? 0)
  const [timingReposMin, setTimingReposMin] = useState<number>(initial?.timing_repos_min ?? 2)
  const [timingReposSec, setTimingReposSec] = useState<number>(initial?.timing_repos_sec ?? 0)
  const [instructions, setInstructions] = useState(initial?.instructions ?? "")

  function handleSubmit() {
    const data: BlocFormData = {
      name: name.trim() || "Bloc sans nom",
      category,
      color,
      series_mode: seriesMode,
      series_count: seriesMode === 'fixe' ? seriesCount : undefined,
      timing_mode: timingMode,
      timing_depart_min: timingMode === 'depart' ? timingDepartMin : undefined,
      timing_depart_sec: timingMode === 'depart' ? timingDepartSec : undefined,
      timing_repos_min: timingMode === 'repos' ? timingReposMin : undefined,
      timing_repos_sec: timingMode === 'repos' ? timingReposSec : undefined,
      instructions: instructions.trim() || undefined,
    }
    onSubmit(data)
  }

  return (
    <div style={{
      background: C.s1, borderRadius: 6, border: "1px solid " + C.brdL,
      padding: "16px 18px", marginBottom: 12,
    }}>
      {/* Nom */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, color: C.tx3, display: "block", marginBottom: 4, fontWeight: 600 }}>Nom du bloc</label>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="ex. Force, Hypertrophie…"
          style={inputStyle}
        />
      </div>

      {/* Catégorie */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, color: C.tx3, display: "block", marginBottom: 6, fontWeight: 600 }}>Catégorie</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {BLOC_CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setCategory(cat)} style={pill(category === cat)}>{cat}</button>
          ))}
        </div>
      </div>

      {/* Couleur */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, color: C.tx3, display: "block", marginBottom: 6, fontWeight: 600 }}>Couleur</label>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {BLOC_PALETTE.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: 24, height: 24, borderRadius: 6,
                background: c,
                border: color === c ? "2px solid #fff" : "2px solid transparent",
                outline: color === c ? `2px solid ${c}` : "none",
                cursor: "pointer",
                flexShrink: 0,
                padding: 0,
              }}
            />
          ))}
        </div>
      </div>

      {/* Séries */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, color: C.tx3, display: "block", marginBottom: 6, fontWeight: 600 }}>Séries</label>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={() => setSeriesMode('libre')} style={pill(seriesMode === 'libre')}>Libre</button>
          <button onClick={() => setSeriesMode('fixe')} style={pill(seriesMode === 'fixe')}>Fixe</button>
          {seriesMode === 'fixe' && (
            <input
              type="number"
              value={seriesCount}
              onChange={e => setSeriesCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
              min={1} max={20}
              style={{ width: 52, padding: "6px 8px", borderRadius: 7, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none", textAlign: "center" }}
            />
          )}
        </div>
      </div>

      {/* Timing */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 11, color: C.tx3, display: "block", marginBottom: 6, fontWeight: 600 }}>Timing</label>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => setTimingMode('libre')} style={pill(timingMode === 'libre')}>Libre</button>
          <button onClick={() => setTimingMode('depart')} style={pill(timingMode === 'depart')}>Départ toutes les</button>
          <button onClick={() => setTimingMode('repos')} style={pill(timingMode === 'repos')}>Repos</button>
          {timingMode === 'depart' && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
              <input
                type="number"
                value={timingDepartMin}
                onChange={e => setTimingDepartMin(Math.max(0, parseInt(e.target.value, 10) || 0))}
                min={0} max={30}
                style={{ width: 52, padding: "6px 8px", borderRadius: 7, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none", textAlign: "center" }}
              />
              <span style={{ fontSize: 11, color: C.tx3 }}>min</span>
              <input
                type="number"
                value={timingDepartSec}
                onChange={e => setTimingDepartSec(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                min={0} max={59}
                style={{ width: 52, padding: "6px 8px", borderRadius: 7, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none", textAlign: "center" }}
              />
              <span style={{ fontSize: 11, color: C.tx3 }}>sec</span>
            </div>
          )}
          {timingMode === 'repos' && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
              <input
                type="number"
                value={timingReposMin}
                onChange={e => setTimingReposMin(Math.max(0, parseInt(e.target.value, 10) || 0))}
                min={0} max={30}
                style={{ width: 52, padding: "6px 8px", borderRadius: 7, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none", textAlign: "center" }}
              />
              <span style={{ fontSize: 11, color: C.tx3 }}>min</span>
              <input
                type="number"
                value={timingReposSec}
                onChange={e => setTimingReposSec(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                min={0} max={59}
                style={{ width: 52, padding: "6px 8px", borderRadius: 7, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none", textAlign: "center" }}
              />
              <span style={{ fontSize: 11, color: C.tx3 }}>sec</span>
            </div>
          )}
        </div>
      </div>

      {/* Consignes */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 11, color: C.tx3, display: "block", marginBottom: 4, fontWeight: 600 }}>Consignes</label>
        <textarea
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          placeholder="ex. Charge progressive, garder 1-2 reps en réserve, gainage serré…"
          rows={3}
          style={{ ...inputStyle, resize: "vertical", lineHeight: 1.4 }}
        />
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          onClick={onCancel}
          style={{ padding: "8px 16px", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
        >
          Annuler
        </button>
        <button
          onClick={handleSubmit}
          style={{ padding: "8px 20px", borderRadius: 4, border: "none", background: VIOLET, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
        >
          Valider
        </button>
      </div>
    </div>
  )
}
