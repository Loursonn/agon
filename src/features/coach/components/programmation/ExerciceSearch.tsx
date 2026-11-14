import { useState, useEffect, useRef } from "react"
import { C } from "@/lib/theme";
import { toast } from "sonner"
import { useAuth } from "@/hooks/useAuth"
import { useCreateExercise, useExerciseSearch } from "@/features/shared/hooks/useExerciseLibrary"
import { Search, Plus } from "lucide-react"
import { EX_TYPES, exTypeLabel, exTypeColor } from "@/lib/exerciseTypes"

const VIOLET = C.ac

interface ExerciceSearchProps {
  value: string
  onSelect: (exercise: { id: string; name: string; ex_type?: string; youtube_id?: string }) => void
  onClose: () => void
  /** Si fourni, propose "Consigne libre" dans le dropdown (texte sans lien banque) */
  onFreeText?: (text: string) => void
  /** Affiche des puces de filtre par type d'exercice */
  showTypeFilter?: boolean
}

export function ExerciceSearch({ value, onSelect, onClose, onFreeText, showTypeFilter }: ExerciceSearchProps) {
  const [search, setSearch] = useState(value)
  // Texte cherché, 300 ms après la dernière frappe
  const [query, setQuery] = useState(value)
  const [typeFilter, setTypeFilter] = useState<string>("")
  const inputRef = useRef<HTMLInputElement>(null)
  const { user } = useAuth()
  const { results, isFetching: loading } = useExerciseSearch(query, typeFilter)
  const create = useCreateExercise()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 300)
    return () => clearTimeout(t)
  }, [search])

  async function handleCreate() {
    const name = search.trim()
    if (!name) return
    try {
      const data = await create.mutateAsync({ name, createdBy: user?.id })
      toast.success(`Exercice "${name}" créé`)
      onSelect({ id: data.id, name: data.name, ex_type: data.ex_type ?? undefined, youtube_id: data.youtube_id ?? undefined })
    } catch {
      toast.error("Erreur lors de la création de l'exercice")
    }
  }

  const showCreate = search.trim() && !results.some(r => r.name.toLowerCase() === search.trim().toLowerCase())

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2 }}>
        <Search size={13} color={C.tx3} />
        <input
          ref={inputRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'Enter' && onFreeText && search.trim()) onFreeText(search.trim())
          }}
          placeholder="Rechercher un exercice…"
          style={{
            flex: 1, background: "transparent", border: "none",
            color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none",
          }}
        />
        {loading && (
          <div style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid " + VIOLET, borderTopColor: "transparent", animation: "spin 0.6s linear infinite" }} />
        )}
      </div>

      {showTypeFilter && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
          {EX_TYPES.map((t) => {
            const on = typeFilter === t.value
            const color = exTypeColor(t.value)
            return (
              <button
                key={t.value}
                onClick={() => setTypeFilter(on ? "" : t.value)}
                style={{
                  padding: "3px 9px", borderRadius: 6,
                  border: "1px solid " + (on ? color : C.brdL),
                  background: on ? color + "18" : "transparent",
                  color: on ? color : C.tx3,
                  fontSize: 10, fontWeight: on ? 700 : 500,
                  cursor: "pointer", fontFamily: "inherit", transition: "all 120ms",
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      )}

      {(results.length > 0 || showCreate || (onFreeText && search.trim())) && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
          background: C.s1, border: "1px solid " + C.brdL, borderRadius: 4,
          marginTop: 4, maxHeight: 240, overflowY: "auto",
        }}>
          {results.map(ex => (
            <button
              key={ex.id}
              onClick={() => onSelect({ id: ex.id, name: ex.name, ex_type: ex.ex_type ?? undefined, youtube_id: ex.youtube_id ?? undefined })}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "8px 12px", border: "none", borderBottom: "1px solid " + C.brd,
                background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = C.s2)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              {ex.ex_type && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
                  background: exTypeColor(ex.ex_type) + "20", color: exTypeColor(ex.ex_type),
                  flexShrink: 0,
                }}>{exTypeLabel(ex.ex_type)}</span>
              )}
              <span style={{ fontSize: 13, color: C.tx }}>{ex.name}</span>
            </button>
          ))}
          {onFreeText && search.trim() && (
            <button
              onClick={() => onFreeText(search.trim())}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "8px 12px", border: "none", borderBottom: "1px solid " + C.brd,
                background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = C.s2)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ fontSize: 13, color: C.tx3 }}>
                Consigne libre : <span style={{ color: C.tx, fontWeight: 600 }}>"{search.trim()}"</span>
              </span>
            </button>
          )}
          {showCreate && (
            <button
              onClick={handleCreate}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "8px 12px", border: "none", background: "transparent",
                cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = C.s2)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <Plus size={13} color={VIOLET} />
              <span style={{ fontSize: 13, color: VIOLET, fontWeight: 600 }}>
                Créer "{search.trim()}"
              </span>
            </button>
          )}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
