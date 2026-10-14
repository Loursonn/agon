import { useState, useRef, useEffect } from "react"
import { C } from "@/lib/theme"
import { Plus } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import type { Bloc, BlocCategory } from "./types"
import { BLOC_CATEGORIES } from "./types"
import { BlocForm } from "./BlocForm"
import { BlocCard } from "./BlocCard"
import { useBlocBank, useUpdateBlocBank } from "./hooks/useBlocBank"
import { CardSkeleton } from "@/features/shared/components/skeletons"

const VIOLET = "#FFC933"

/**
 * Banque de blocs préconstruits du coach.
 * Blocs réutilisables dans n'importe quelle séance (Programmation > Ajouter un bloc > Depuis la banque).
 */
export function BlocBankView() {
  const { user } = useAuth()
  const coachId = user?.id
  const { data: serverBlocs = [], isLoading } = useBlocBank(coachId)
  const updateMutation = useUpdateBlocBank(coachId)

  const [blocs, setBlocs] = useState<Bloc[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const [openBlocId, setOpenBlocId] = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const hasPendingSave = useRef(false)

  useEffect(() => {
    if (!hasPendingSave.current) {
      setBlocs(serverBlocs)
    }
  }, [serverBlocs])

  function debouncedSave(updated: Bloc[]) {
    hasPendingSave.current = true
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      updateMutation.mutate(updated)
      hasPendingSave.current = false
    }, 800)
  }

  function addBloc(data: Omit<Bloc, 'id' | 'exercices' | 'sort_order'>) {
    const newBloc: Bloc = {
      ...data,
      id: crypto.randomUUID(),
      exercices: [],
      sort_order: blocs.length,
    }
    const next = [...blocs, newBloc]
    setBlocs(next)
    updateMutation.mutate(next)
    setIsAdding(false)
    setOpenBlocId(newBloc.id)
  }

  function updateBloc(id: string, updated: Bloc) {
    const next = blocs.map(b => b.id === id ? updated : b)
    setBlocs(next)
    debouncedSave(next)
  }

  function deleteBloc(id: string) {
    const next = blocs.filter(b => b.id !== id).map((b, i) => ({ ...b, sort_order: i }))
    setBlocs(next)
    updateMutation.mutate(next)
  }

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[1, 2].map(i => <CardSkeleton key={i} />)}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: C.tx3 }}>
          Blocs réutilisables dans tes séances (Programmation → Ajouter un bloc → Depuis la banque)
        </div>
        <button
          onClick={() => setIsAdding(true)}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "8px 16px", borderRadius: 4,
            border: "none", background: VIOLET, color: "#fff",
            fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            flexShrink: 0,
          }}
        >
          <Plus size={13} />
          Créer un bloc
        </button>
      </div>

      {isAdding && (
        <BlocForm
          onSubmit={addBloc}
          onCancel={() => setIsAdding(false)}
        />
      )}

      {!isAdding && blocs.length === 0 && (
        <div style={{ textAlign: "center", padding: "50px 20px" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}></div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 4 }}>Aucun bloc préconstruit</div>
          <div style={{ fontSize: 12, color: C.tx3, marginBottom: 20 }}>
            Crée des blocs types (échauffement, mobilité, force…) pour les réutiliser dans tes séances.
          </div>
          <button
            onClick={() => setIsAdding(true)}
            style={{
              padding: "10px 22px", borderRadius: 4,
              border: "none", background: VIOLET, color: "#fff",
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            <Plus size={14} />
            Créer un bloc
          </button>
        </div>
      )}

      {/* Blocs regroupés par catégorie — cartes compactes, clic pour éditer */}
      {BLOC_CATEGORIES.map(cat => {
        const catBlocs = blocs.filter(b => (b.category ?? 'Mixte') === cat)
        if (catBlocs.length === 0) return null
        const openBloc = catBlocs.find(b => b.id === openBlocId)
        return (
          <div key={cat} style={{ marginBottom: 22 }}>
            <div style={{
              fontSize: 11, fontWeight: 800, color: C.tx3,
              textTransform: "uppercase", letterSpacing: "0.6px",
              marginBottom: 10, display: "flex", alignItems: "center", gap: 8,
            }}>
              {cat}
              <span style={{ fontSize: 10, fontWeight: 700, color: C.tx3, background: C.s2, padding: "1px 7px", borderRadius: 4 }}>
                {catBlocs.length}
              </span>
            </div>

            {/* Grille de cartes — nom seul */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 8,
            }}>
              {catBlocs.map(bloc => {
                const color = bloc.color ?? VIOLET
                const isOpen = bloc.id === openBlocId
                return (
                  <button
                    key={bloc.id}
                    onClick={() => setOpenBlocId(isOpen ? null : bloc.id)}
                    style={{
                      position: "relative",
                      padding: "14px 12px 12px",
                      borderRadius: 6,
                      border: "1px solid " + (isOpen ? color : C.brdL),
                      background: isOpen ? color + "14" : C.s1,
                      cursor: "pointer", fontFamily: "inherit",
                      textAlign: "left",
                      overflow: "hidden",
                      transition: "border-color 120ms, background 120ms",
                    }}
                    onMouseEnter={e => { if (!isOpen) e.currentTarget.style.borderColor = color + "80" }}
                    onMouseLeave={e => { if (!isOpen) e.currentTarget.style.borderColor = C.brdL }}
                  >
                    <div style={{
                      fontSize: 13, fontWeight: 700,
                      color: isOpen ? color : C.tx,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {bloc.name || "Bloc sans nom"}
                    </div>
                    <div style={{ fontSize: 10, color: C.tx3, marginTop: 3 }}>
                      {bloc.exercices.length} exercice{bloc.exercices.length !== 1 ? "s" : ""}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Éditeur du bloc ouvert — sous la grille de sa catégorie */}
            {openBloc && (
              <div style={{ marginTop: 10 }}>
                <BlocCard
                  bloc={openBloc}
                  index={blocs.indexOf(openBloc)}
                  athleteId={coachId}
                  activeWeek={1}
                  sessionMultiSemaine={false}
                  onChange={updated => updateBloc(openBloc.id, updated)}
                  onDelete={() => { deleteBloc(openBloc.id); setOpenBlocId(null) }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
