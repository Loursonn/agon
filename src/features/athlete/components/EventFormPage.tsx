import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronLeft, MapPin } from "lucide-react";
import { DateBox, FIELD_BOX } from "./DateBox";
import { toast } from "sonner";
import { C, alpha } from "@/lib/theme";
import { ROUGE, TYPE_COLOR } from "@/lib/peps";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { useCreateLifeEvent, useDeleteLifeEvent } from "@/hooks/useLifeEvents";
import { useCreateCompetition, useDeleteCompetition } from "@/hooks/useCompetitions";
import type { CompetitionPriority, LifeEventKind } from "@/types/planning";

type EventType = "competition" | LifeEventKind;

const TYPES: { value: EventType; label: string }[] = [
  { value: "competition", label: "Compétition" },
  { value: "stage", label: "Stage" },
  { value: "voyage", label: "Voyage" },
  { value: "examen", label: "Examen" },
  { value: "autre", label: "Autre" },
];

const PRIORITIES: { value: CompetitionPriority; label: string }[] = [
  { value: "A", label: "Objectif" },
  { value: "B", label: "Importante" },
  { value: "C", label: "Entraînement" },
];

interface Props {
  athleteId: string;
  /** Coach référent : nécessaire pour une compétition (colonne coach_id). */
  coachId: string | null | undefined;
  coachName: string | null;
  /** Type ouvert par défaut (« + » de « Prochaine compétition » → compétition). */
  initialType?: EventType;
  onClose: () => void;
}

const LABEL: CSSProperties = { ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.tx3, whiteSpace: "nowrap" };

const BOX = FIELD_BOX;

function Field({ label, right, children }: { label: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={LABEL}>{label}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

/**
 * « Nouvel événement » (planche Ath1Evenement) : un seul formulaire pour tous
 * les événements. Compétition → `competitions` (priorité A / B / C, date de fin
 * facultative) ; stage, voyage, examen, autre → `athlete_life_events`
 * (du / au, « Indisponible pour m'entraîner »).
 */
export function EventFormPage({ athleteId, coachId, coachName, initialType, onClose }: Props) {
  const canCompete = !!coachId;
  const [type, setType] = useState<EventType>(initialType && (initialType !== "competition" || canCompete) ? initialType : canCompete ? "competition" : "voyage");
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [showEnd, setShowEnd] = useState(false);
  const [priority, setPriority] = useState<CompetitionPriority>("B");
  const [location, setLocation] = useState("");
  const [unavailable, setUnavailable] = useState(true);

  const createLife = useCreateLifeEvent();
  const deleteLife = useDeleteLifeEvent();
  const createComp = useCreateCompetition();
  const deleteComp = useDeleteCompetition();
  const saving = createLife.isPending || createComp.isPending;

  const isComp = type === "competition";
  const color = isComp ? ROUGE : TYPE_COLOR.hyrox;
  const coach = coachName ?? "ton coach";
  const ready = !!name.trim() && !!start && !saving;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const setStartDate = (v: string) => {
    setStart(v);
    if (end && end < v) setEnd(v);
  };

  function done(undo: () => void) {
    toast.success(`Événement ajouté · ${coachName ? `${coachName} le voit sur ton planning` : "visible sur ton planning"}`, {
      action: { label: "Annuler", onClick: undo },
    });
    onClose();
  }

  function submit() {
    if (!ready) return;
    const title = name.trim();
    const place = location.trim() || null;
    if (isComp) {
      if (!coachId) return;
      createComp.mutate(
        {
          coach_id: coachId, athlete_id: athleteId, name: title, type: "competition", date: start,
          date_end: showEnd && end && end > start ? end : null, location: place, notes: null, priority,
        },
        {
          onSuccess: (row) => done(() => deleteComp.mutate({ id: row.id, athlete_id: athleteId })),
          onError: () => toast.error("Événement non enregistré"),
        },
      );
    } else {
      createLife.mutate(
        { athlete_id: athleteId, title, date_start: start, date_end: end && end >= start ? end : start, kind: type, location: place, unavailable },
        {
          onSuccess: (row) => done(() => deleteLife.mutate({ id: row.id, athlete_id: athleteId })),
          onError: () => toast.error("Événement non enregistré"),
        },
      );
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Nouvel événement" style={{ position: "fixed", inset: 0, zIndex: 200, background: C.bg, color: C.tx, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "calc(env(safe-area-inset-top, 0px) + 16px) 20px 120px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" aria-label="Retour" onClick={onClose} style={{ width: 34, height: 34, boxSizing: "border-box", border: `1px solid ${alpha(C.tx, 0.18)}`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flex: "none", background: "transparent", color: C.tx, cursor: "pointer" }}>
            <ChevronLeft size={18} strokeWidth={1.75} />
          </button>
          <span style={{ flex: 1, textAlign: "center", ...LABEL, color: C.tx2 }}>Nouvel événement</span>
          <span style={{ width: 34, flex: "none" }} />
        </div>

        <Field label="Nom">
          <div style={BOX}>
            <input
              aria-label="Nom"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              placeholder={isComp ? "10 km de Boulogne" : "Week-end à Lyon"}
              style={{ flex: 1, minWidth: 0, fontSize: 15, color: C.tx, background: "transparent", border: "none", outline: "none", fontFamily: "inherit", padding: 0 }}
            />
          </div>
        </Field>

        <Field label="Type">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {TYPES.filter((t) => t.value !== "competition" || canCompete).map((t) => {
              const on = t.value === type;
              const c = t.value === "competition" ? ROUGE : TYPE_COLOR.hyrox;
              return (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setType(t.value)}
                  style={{
                    height: 36, boxSizing: "border-box", padding: "0 14px", borderRadius: 999, fontSize: 13.5, fontFamily: "inherit", cursor: "pointer",
                    border: on ? `1.5px solid ${c}` : `1px solid ${alpha(C.tx, 0.18)}`, background: on ? `${c}24` : "transparent", color: on ? C.tx : C.tx2,
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </Field>

        {isComp ? (
          <>
            <Field
              label="Date"
              right={!showEnd && (
                <button type="button" onClick={() => setShowEnd(true)} style={{ color: C.ac, fontSize: 12, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
                  + Date de fin
                </button>
              )}
            >
              <DateBox label="Date" value={start} onChange={setStartDate} withYear />
            </Field>
            {showEnd && (
              <Field label="Date de fin">
                <DateBox label="Date de fin" value={end} min={start || undefined} onChange={setEnd} withYear />
              </Field>
            )}
            <Field label="Priorité">
              <div style={{ display: "flex", gap: 8 }}>
                {PRIORITIES.map((p) => {
                  const on = p.value === priority;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPriority(p.value)}
                      style={{
                        flex: 1, height: 56, boxSizing: "border-box", borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
                        background: on ? `${ROUGE}24` : C.s1, border: on ? `1.5px solid ${ROUGE}` : `1px solid ${alpha(C.tx, 0.18)}`,
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
                      }}
                    >
                      <span style={{ ...MONO, fontSize: 18, color: on ? ROUGE : C.tx }}>{p.value}</span>
                      <span style={{ fontSize: 11.5, color: on ? C.tx : C.tx3 }}>{p.label}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11.5, color: C.tx3, marginTop: 7, lineHeight: 1.45 }}>A : tout vise ce jour · B : on allège avant · C : rien ne change.</div>
            </Field>
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Field label="Du"><DateBox label="Du" value={start} onChange={setStartDate} withYear={false} /></Field>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Field label="Au"><DateBox label="Au" value={end} min={start || undefined} onChange={setEnd} withYear={false} /></Field>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={unavailable}
              onClick={() => setUnavailable((v) => !v)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, background: C.s1, border: `1px solid ${C.brd}`, textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: C.tx }}
            >
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 500 }}>Indisponible pour m’entraîner</span>
                <span style={{ display: "block", fontSize: 12, color: C.tx3, marginTop: 2 }}>Ton coach ne prévoit rien ces jours-là.</span>
              </span>
              <span aria-hidden style={{ width: 44, height: 26, borderRadius: 13, background: unavailable ? color : alpha(C.tx, 0.18), position: "relative", flex: "none", transition: "background .15s" }}>
                <span style={{ position: "absolute", top: 3, left: unavailable ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
              </span>
            </button>
          </>
        )}

        <Field label="Lieu · facultatif">
          <div style={BOX}>
            <input
              aria-label="Lieu"
              value={location}
              maxLength={200}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Lieu"
              style={{ flex: 1, minWidth: 0, fontSize: 15, color: C.tx, background: "transparent", border: "none", outline: "none", fontFamily: "inherit", padding: 0 }}
            />
            <MapPin size={18} color={C.tx3} strokeWidth={1.75} />
          </div>
        </Field>

        <div style={{ fontSize: 12, color: C.tx3 }}>
          {isComp ? "" : "Pas de priorité hors compétition. "}Visible par {coach} sur ton planning.
        </div>
      </div>

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "12px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)", background: C.bg, borderTop: `1px solid ${C.brd}` }}>
        <button
          type="button"
          disabled={!ready}
          onClick={submit}
          style={{ width: "100%", height: 52, borderRadius: 12, border: "none", background: C.ac, color: C.bg, fontWeight: 600, fontSize: 15, fontFamily: "inherit", cursor: ready ? "pointer" : "default", opacity: ready ? 1 : 0.45 }}
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
