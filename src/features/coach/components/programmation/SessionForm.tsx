import { useState } from "react"
import { C } from "@/lib/theme"
import type { ProgSession } from "./types"

const VIOLET = "#FFC933"
const VIOLET_S = "rgba(123,111,255,0.12)"

const DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]

interface SessionFormProps {
  initial?: Partial<ProgSession>
  onSubmit: (session: Omit<ProgSession, 'id' | 'blocs'>) => void
  onCancel: () => void
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 4,
  border: "1px solid " + C.brdL, background: C.s2,
  color: C.tx, fontSize: 13, fontFamily: "inherit",
  outline: "none", boxSizing: "border-box",
}

function pill(active: boolean): React.CSSProperties {
  return {
    padding: "6px 14px", borderRadius: 7,
    border: "1px solid " + (active ? VIOLET : C.brdL),
    background: active ? VIOLET_S : "transparent",
    color: active ? VIOLET : C.tx3,
    fontSize: 12, fontWeight: active ? 700 : 600,
    cursor: "pointer", fontFamily: "inherit", transition: "all 120ms",
  }
}

function pillSmall(active: boolean): React.CSSProperties {
  return {
    padding: "5px 10px", borderRadius: 6,
    border: "1px solid " + (active ? VIOLET : C.brdL),
    background: active ? VIOLET_S : "transparent",
    color: active ? VIOLET : C.tx3,
    fontSize: 11, fontWeight: active ? 700 : 500,
    cursor: "pointer", fontFamily: "inherit", transition: "all 120ms",
  }
}

export function SessionForm({ initial, onSubmit, onCancel }: SessionFormProps) {
  const [name, setName] = useState(initial?.name ?? "")
  const [short, setShort] = useState(initial?.short ?? "")
  const [recurrence, setRecurrence] = useState<'weekly' | 'once'>(initial?.recurrence ?? 'weekly')
  const [dayOfWeek, setDayOfWeek] = useState<number | undefined>(initial?.day_of_week)
  const [multiSemaine, setMultiSemaine] = useState<boolean>(initial?.multi_semaine ?? false)
  const [nbSemaines, setNbSemaines] = useState<number>(initial?.nb_semaines ?? 4)

  function handleSubmit() {
    const data: Omit<ProgSession, 'id' | 'blocs'> = {
      name: name.trim() || "Séance sans nom",
      short: short.trim().toUpperCase().slice(0, 6) || "?",
      recurrence,
      day_of_week: recurrence === 'weekly' ? dayOfWeek : undefined,
      multi_semaine: multiSemaine,
      nb_semaines: multiSemaine ? nbSemaines : undefined,
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
        <label style={{ fontSize: 11, color: C.tx3, display: "block", marginBottom: 4, fontWeight: 600 }}>Nom de la séance</label>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="ex. Full Body, Upper, Legs…"
          style={inputStyle}
        />
      </div>

      {/* Abréviation */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, color: C.tx3, display: "block", marginBottom: 4, fontWeight: 600 }}>Abréviation <span style={{ fontWeight: 400 }}>(max 6 car.)</span></label>
        <input
          value={short}
          onChange={e => setShort(e.target.value.toUpperCase().slice(0, 6))}
          placeholder="FB, UPP, LEG…"
          style={{ ...inputStyle, width: 120 }}
        />
      </div>

      {/* Type */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, color: C.tx3, display: "block", marginBottom: 6, fontWeight: 600 }}>Type</label>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setRecurrence('weekly')} style={pill(recurrence === 'weekly')}>Récurrente</button>
          <button onClick={() => setRecurrence('once')} style={pill(recurrence === 'once')}>Ponctuelle</button>
        </div>
      </div>

      {/* Jour de la semaine (weekly only) */}
      {recurrence === 'weekly' && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, color: C.tx3, display: "block", marginBottom: 6, fontWeight: 600 }}>Jour de la semaine</label>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {DOW.map((label, i) => (
              <button
                key={i}
                onClick={() => setDayOfWeek(dayOfWeek === i ? undefined : i)}
                style={pillSmall(dayOfWeek === i)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Multi-semaine */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 11, color: C.tx3, display: "block", marginBottom: 6, fontWeight: 600 }}>Multi-semaine</label>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            onClick={() => setMultiSemaine(v => !v)}
            style={pill(multiSemaine)}
          >
            {multiSemaine ? "Activé" : "Activer"}
          </button>
          {multiSemaine && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="number"
                value={nbSemaines}
                onChange={e => setNbSemaines(Math.max(1, parseInt(e.target.value, 10) || 1))}
                min={1} max={24}
                style={{ width: 52, padding: "6px 8px", borderRadius: 7, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none", textAlign: "center" }}
              />
              <span style={{ fontSize: 11, color: C.tx3 }}>semaines</span>
            </div>
          )}
        </div>
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
