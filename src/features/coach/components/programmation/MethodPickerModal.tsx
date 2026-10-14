import { useState } from "react"
import { C } from "@/lib/theme"
import { X } from "lucide-react"
import type { TrainingMethod } from "@/types/trainingMethods"

const VIOLET = "#FFC933"
const VIOLET_S = "rgba(123,111,255,0.12)"

interface MethodPickerModalProps {
  methods: TrainingMethod[]
  selectedId?: string
  onSelect: (method: TrainingMethod) => void
  onClose: () => void
}

const SCOPE_CONFIG = {
  classic: {
    label: "Classique",
    description: "Template simple — séries × reps avec progressions",
    color: "#22c55e",
    colorS: "rgba(34,197,94,0.10)",
  },
  exercise: {
    label: "Sur l'exercice",
    description: "Modifie la structure entière de l'exercice (séries, reps, charges...)",
    color: VIOLET,
    colorS: VIOLET_S,
  },
  set: {
    label: "Sur la série",
    description: "S'applique à une série spécifique (cluster, rest-pause, drop-set...)",
    color: "#f59e0b",
    colorS: "rgba(245,158,11,0.10)",
  },
} as const

export function MethodPickerModal({ methods, selectedId, onSelect, onClose }: MethodPickerModalProps) {
  const [search, setSearch] = useState("")

  const filtered = search
    ? methods.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || (m.description?.toLowerCase().includes(search.toLowerCase())))
    : methods

  const byScope = {
    classic: filtered.filter(m => m.scope === "classic"),
    exercise: filtered.filter(m => m.scope === "exercise"),
    set: filtered.filter(m => m.scope === "set"),
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%", maxWidth: 640,
          background: C.s1, borderRadius: "6px 6px 0 0",
          padding: "0 0 24px",
          maxHeight: "80vh", display: "flex", flexDirection: "column",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 18px 12px",
          borderBottom: "1px solid " + C.brdL,
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.tx }}>Choisir une méthode</div>
          <button
            onClick={onClose}
            style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "10px 18px", flexShrink: 0 }}>
          <input
            autoFocus
            placeholder="Rechercher…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: "100%", padding: "8px 12px", borderRadius: 4,
              border: "1px solid " + C.brdL, background: C.s2, color: C.tx,
              fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Categories */}
        <div style={{ overflowY: "auto", flex: 1, padding: "0 18px" }}>
          {(Object.entries(byScope) as [keyof typeof SCOPE_CONFIG, TrainingMethod[]][]).map(([scope, items]) => {
            if (!items.length) return null
            const cfg = SCOPE_CONFIG[scope]
            return (
              <div key={scope} style={{ marginBottom: 18 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
                }}>
                  <div style={{
                    width: 3, height: 14, borderRadius: 2,
                    background: cfg.color, flexShrink: 0,
                  }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: cfg.color }}>{cfg.label}</div>
                    <div style={{ fontSize: 10, color: C.tx3 }}>{cfg.description}</div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {items.map(m => {
                    const isSelected = m.id === selectedId
                    return (
                      <button
                        key={m.id}
                        onClick={() => { onSelect(m); onClose() }}
                        style={{
                          width: "100%", textAlign: "left",
                          padding: "10px 12px", borderRadius: 4,
                          border: "1px solid " + (isSelected ? cfg.color : C.brdL),
                          background: isSelected ? cfg.colorS : C.s2,
                          cursor: "pointer", fontFamily: "inherit",
                          display: "flex", alignItems: "center", gap: 10,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: isSelected ? cfg.color : C.tx }}>
                            {m.name}
                          </div>
                          {m.description && (
                            <div style={{ fontSize: 11, color: C.tx3, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {m.description}
                            </div>
                          )}
                          {m.category && (
                            <div style={{ fontSize: 10, color: cfg.color, fontWeight: 600, marginTop: 2 }}>{m.category}</div>
                          )}
                        </div>
                        {isSelected && (
                          <div style={{ width: 18, height: 18, borderRadius: "50%", background: cfg.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {!filtered.length && (
            <div style={{ textAlign: "center", padding: "30px 0", color: C.tx3, fontSize: 12 }}>
              Aucune méthode trouvée
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
