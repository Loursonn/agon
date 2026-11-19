import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, MapPin } from "lucide-react";
import { DateBox } from "./DateBox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCreateLifeEvent, useDeleteLifeEvent } from "@/hooks/useLifeEvents";
import { useCreateCompetition, useDeleteCompetition, useUpdateCompetition } from "@/hooks/useCompetitions";
import type { Competition, CompetitionPriority, LifeEventKind } from "@/types/planning";

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
  /** Compétition à modifier : formulaire pré-rempli, type figé, « Enregistrer » met à jour. */
  existing?: Competition | null;
  onClose: () => void;
}

const LABEL = "agon-mono whitespace-nowrap text-[11px] uppercase tracking-[0.14em] text-agon-tx3";

/** Même boîte que FIELD_BOX (./dateFormat), utilisée par DateBox. */
const BOX = "relative box-border flex h-12 items-center gap-2.5 rounded-xl border border-agon-tx/[0.18] bg-agon-s1 px-3.5";

const INPUT = "min-w-0 flex-1 border-none bg-transparent p-0 font-[inherit] text-[15px] text-agon-tx [outline:none]";

function Field({ label, right, children }: { label: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className={LABEL}>{label}</span>
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
 *
 * Avec `existing` : « Modifier la compétition » (athlète, ou coach sur téléphone).
 */
export function EventFormPage({ athleteId, coachId, coachName, initialType, existing, onClose }: Props) {
  const isEdit = !!existing;
  const canCompete = !!coachId || isEdit;
  const [type, setType] = useState<EventType>(isEdit ? "competition" : initialType && (initialType !== "competition" || canCompete) ? initialType : canCompete ? "competition" : "voyage");
  const [name, setName] = useState(existing?.name ?? "");
  const [start, setStart] = useState(existing?.date ?? "");
  const [end, setEnd] = useState(existing?.date_end ?? "");
  const [showEnd, setShowEnd] = useState(!!existing?.date_end);
  const [priority, setPriority] = useState<CompetitionPriority>(existing?.priority ?? "B");
  const [location, setLocation] = useState(existing?.location ?? "");
  const [unavailable, setUnavailable] = useState(true);

  const createLife = useCreateLifeEvent();
  const deleteLife = useDeleteLifeEvent();
  const createComp = useCreateCompetition();
  const deleteComp = useDeleteCompetition();
  const updateComp = useUpdateCompetition();
  const saving = createLife.isPending || createComp.isPending || updateComp.isPending;

  const isComp = type === "competition";
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
    if (existing) {
      updateComp.mutate(
        {
          id: existing.id,
          updates: { name: title, date: start, date_end: showEnd && end && end > start ? end : null, location: place, priority },
        },
        {
          onSuccess: () => { toast.success("Compétition modifiée"); onClose(); },
          onError: () => toast.error("Compétition non modifiée"),
        },
      );
    } else if (isComp) {
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
    <div role="dialog" aria-modal="true" aria-label={isEdit ? "Modifier la compétition" : "Nouvel événement"} className={cn("fixed inset-0 flex flex-col bg-agon-bg text-agon-tx", isEdit ? "z-[400]" : "z-[200]")}>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-[120px] pt-[calc(env(safe-area-inset-top,0px)+16px)]">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Retour" onClick={onClose} className="box-border flex size-[34px] flex-none cursor-pointer items-center justify-center rounded-[10px] border border-agon-tx/[0.18] bg-transparent text-agon-tx">
            <ChevronLeft size={18} strokeWidth={1.75} />
          </button>
          <span className={cn(LABEL, "flex-1 text-center text-agon-tx2")}>{isEdit ? "Modifier la compétition" : "Nouvel événement"}</span>
          <span className="w-[34px] flex-none" />
        </div>

        <Field label="Nom">
          <div className={BOX}>
            <input
              aria-label="Nom"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              placeholder={isComp ? "10 km de Boulogne" : "Week-end à Lyon"}
              className={INPUT}
            />
          </div>
        </Field>

        {!isEdit && <Field label="Type">
          <div className="flex flex-wrap gap-2">
            {TYPES.filter((t) => t.value !== "competition" || canCompete).map((t) => {
              const on = t.value === type;
              const onColor = t.value === "competition" ? "border-agon-rouge bg-agon-rouge" : "border-agon-type-hyrox bg-agon-type-hyrox";
              return (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setType(t.value)}
                  className={cn(
                    "box-border h-9 cursor-pointer rounded-full border px-3.5 font-[inherit] text-[13.5px]",
                    on ? cn(onColor, "font-medium text-agon-ink") : "border-agon-tx/[0.18] bg-transparent font-normal text-agon-tx2",
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </Field>}

        {isComp ? (
          <>
            <Field
              label="Date"
              right={!showEnd && (
                <button type="button" onClick={() => setShowEnd(true)} className="cursor-pointer border-none bg-transparent p-0 font-[inherit] text-[12px] text-agon-accent">
                  + Date de fin
                </button>
              )}
            >
              <DateBox label="Date" value={start} onChange={setStartDate} withYear />
            </Field>
            {showEnd && (
              <Field
                label="Date de fin"
                right={
                  <button type="button" onClick={() => { setShowEnd(false); setEnd(""); }} className="cursor-pointer border-none bg-transparent p-0 font-[inherit] text-[12px] text-agon-tx3">
                    Retirer
                  </button>
                }
              >
                <DateBox label="Date de fin" value={end} min={start || undefined} onChange={setEnd} withYear />
              </Field>
            )}
            <Field label="Priorité">
              <div className="flex gap-2">
                {PRIORITIES.map((p) => {
                  const on = p.value === priority;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPriority(p.value)}
                      className={cn(
                        "box-border flex h-14 flex-1 cursor-pointer flex-col items-center justify-center gap-px rounded-xl font-[inherit]",
                        on ? "border-[1.5px] border-agon-rouge bg-agon-rouge/[0.14]" : "border border-agon-tx/[0.18] bg-agon-s1",
                      )}
                    >
                      <span className={cn("agon-mono text-[18px]", on ? "text-agon-rouge" : "text-agon-tx")}>{p.value}</span>
                      <span className={cn("text-[11.5px]", on ? "text-agon-tx" : "text-agon-tx3")}>{p.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-[7px] text-[11.5px] leading-[1.45] text-agon-tx3">A : tout vise ce jour · B : on allège avant · C : rien ne change.</div>
            </Field>
          </>
        ) : (
          <>
            <div className="flex gap-2.5">
              <div className="min-w-0 flex-1">
                <Field label="Du"><DateBox label="Du" value={start} onChange={setStartDate} withYear={false} /></Field>
              </div>
              <div className="min-w-0 flex-1">
                <Field label="Au"><DateBox label="Au" value={end} min={start || undefined} onChange={setEnd} withYear={false} /></Field>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={unavailable}
              onClick={() => setUnavailable((v) => !v)}
              className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-agon-brd bg-agon-s1 p-3.5 text-left font-[inherit] text-agon-tx"
            >
              <span className="flex-1">
                <span className="block text-[14px] font-medium">Indisponible pour m’entraîner</span>
                <span className="mt-0.5 block text-[12px] text-agon-tx3">Ton coach ne prévoit rien ces jours-là.</span>
              </span>
              <span aria-hidden className={cn("relative h-[26px] w-11 flex-none rounded-[13px] [transition:background_.15s]", unavailable ? "bg-agon-type-hyrox" : "bg-agon-tx/[0.18]")}>
                <span className={cn("absolute top-[3px] size-5 rounded-full bg-agon-tx [transition:left_.15s]", unavailable ? "left-[21px]" : "left-[3px]")} />
              </span>
            </button>
          </>
        )}

        <Field label="Lieu · facultatif">
          <div className={BOX}>
            <input
              aria-label="Lieu"
              value={location}
              maxLength={200}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Lieu"
              className={INPUT}
            />
            <MapPin size={18} strokeWidth={1.75} className="text-agon-tx3" />
          </div>
        </Field>

        {!isEdit && (
          <div className="text-[12px] text-agon-tx3">
            {isComp ? "" : "Pas de priorité hors compétition. "}Visible par {coach} sur ton planning.
          </div>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 border-t border-agon-brd bg-agon-bg px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] pt-3">
        <button
          type="button"
          disabled={!ready}
          onClick={submit}
          className={cn(
            "h-[52px] w-full rounded-xl border-none bg-agon-accent font-[inherit] text-[15px] font-semibold text-agon-ink",
            ready ? "cursor-pointer opacity-100" : "cursor-default opacity-[0.45]",
          )}
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
