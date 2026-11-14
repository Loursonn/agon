import { useState, useRef, useEffect } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import type { FreeSession } from "@/features/shared/types/athlete";
import { SPORTS } from "./freeActivitySports";

const MONTHS_FR = ["jan","fév","mar","avr","mai","jun","jul","aoû","sep","oct","nov","déc"];
const DAYS_FULL_FR = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];


const DISTANCE_SPORTS = ["course", "velo", "natation", "marche", "ski", "autre"];

const LABEL = "text-[11px] font-semibold uppercase tracking-[0.5px] text-agon-tx3";
const INPUT = "box-border w-full rounded-[4px] border border-agon-brd-l bg-agon-s2 px-3 py-[9px] font-[inherit] text-agon-tx [outline:none]";
/** Intensité 1-3 / 4-6 / 7-10 : texte et curseur. */
const INTENSITY_TEXT = ["text-agon-succes", "text-agon-alerte", "text-agon-erreur"];
const INTENSITY_ACCENT = ["accent-agon-succes", "accent-agon-alerte", "accent-agon-erreur"];

interface FreeActivityModalProps {
  date: string | null;
  existing?: FreeSession | null;
  onClose: () => void;
  onSave: (session: FreeSession) => void;
  onDelete?: (id: string) => void;
}

export function FreeActivityModal({ date, existing, onClose, onSave, onDelete }: FreeActivityModalProps) {
  const isEdit = !!existing;
  const [confirmDel, setConfirmDel] = useState(false);
  const [sport, setSport] = useState(SPORTS[0]);
  const [customLabel, setCustomLabel] = useState("");
  const [duration, setDuration] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [intensity, setIntensity] = useState(5);
  const [note, setNote] = useState("");
  const labelRef = useRef<HTMLInputElement>(null);

  const showDistance = DISTANCE_SPORTS.includes(sport.key);

  useEffect(() => {
    if (existing) {
      const found = SPORTS.find((s) => s.key === existing.sport) ?? SPORTS[SPORTS.length - 1];
      setSport(found);
      setCustomLabel(found.key === "autre" ? existing.name : "");
      setDuration(existing.duration?.toString() ?? "");
      setDistanceKm(existing.distance_km?.toString() ?? "");
      setIntensity(existing.intensity ?? 5);
      setNote(existing.note ?? "");
    } else {
      setSport(SPORTS[0]);
      setCustomLabel("");
      setDuration("");
      setDistanceKm("");
      setIntensity(5);
      setNote("");
    }
  }, [existing, date]);

  const open = !!date;
  const activeDate = date ?? existing?.date ?? "";
  const d = activeDate ? new Date(activeDate + "T12:00:00") : new Date();
  const dateLabel = activeDate
    ? `${DAYS_FULL_FR[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]}`
    : "";

  function handleSave() {
    const name = sport.key === "autre" && customLabel.trim() ? customLabel.trim() : sport.label;
    const parsedDistance = parseFloat(distanceKm);
    onSave({
      ...(isEdit ? existing : {}),
      id: existing?.id ?? "free_" + Date.now(),
      name,
      sport: sport.key,
      sportEmoji: sport.abbr,
      date: activeDate,
      duration: parseInt(duration) || undefined,
      distance_km: showDistance && parsedDistance > 0 ? parsedDistance : undefined,
      intensity,
      note: note.trim() || undefined,
      completed: true,
      exercises: existing?.exercises ?? [],
    });
    onClose();
  }

  const intensityTone = intensity <= 3 ? 0 : intensity <= 6 ? 1 : 2;

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="border-t-agon-brd bg-agon-s1 p-0 pb-8">
        <DrawerHeader className="flex items-center px-5 pb-3 pt-4">
          <div className="flex-1">
            <DrawerTitle className="text-[16px] font-bold text-agon-tx">
              {isEdit ? "Modifier l'activité" : "Activité libre"}
              {dateLabel ? <span className="ml-2 text-[13px] font-normal text-agon-tx3">{dateLabel}</span> : null}
            </DrawerTitle>
          </div>
          {isEdit && onDelete && existing && (
            <button
              onClick={() => setConfirmDel((v) => !v)}
              className="cursor-pointer rounded-[4px] border border-agon-erreur/[0.31] bg-agon-erreur/[0.08] px-3 py-[5px] font-[inherit] text-[11px] font-semibold text-agon-erreur"
            >
              Supprimer
            </button>
          )}
        </DrawerHeader>

        <div className="flex flex-col gap-4 px-5">
          {confirmDel && isEdit && onDelete && existing && (
            <div className="rounded-[4px] border border-agon-erreur/[0.25] bg-agon-erreur-doux px-3 py-2.5">
              <div className="mb-2.5 text-[12px] text-agon-tx2">Supprimer cette activité ?</div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmDel(false)} className="flex-1 cursor-pointer rounded-[4px] border border-agon-brd-l bg-transparent py-2 font-[inherit] text-[12px] font-semibold text-agon-tx2">Annuler</button>
                <button type="button" onClick={() => { onDelete(existing.id); onClose(); }} className="flex-1 cursor-pointer rounded-[4px] border-none bg-agon-erreur py-2 font-[inherit] text-[12px] font-bold text-agon-ink">Supprimer</button>
              </div>
            </div>
          )}
          {/* Sport picker */}
          <div>
            <div className={cn(LABEL, "mb-2")}>
              Sport
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
              {SPORTS.map((s) => {
                const active = sport.key === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => { setSport(s); if (s.key === "autre") setTimeout(() => labelRef.current?.focus(), 50); }}
                    className={cn(
                      "flex min-w-[52px] shrink-0 cursor-pointer flex-col items-center gap-[3px] rounded-[4px] border px-3 py-2 font-[inherit]",
                      active ? "border-agon-accent/[0.5] bg-agon-accent-doux text-agon-accent" : "border-agon-brd bg-agon-s2 text-agon-tx3",
                    )}
                  >
                    <span className="text-[11px] font-extrabold">{s.abbr}</span>
                    <span className="text-[9px] font-semibold">{s.label}</span>
                  </button>
                );
              })}
            </div>
            {sport.key === "autre" && (
              <input
                ref={labelRef}
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="Nom de l'activité…"
                className={cn(INPUT, "mt-2 text-[13px]")}
              />
            )}
          </div>

          {/* Duration + distance + intensity */}
          <div className="grid grid-cols-[1fr_1fr] gap-3">
            <div>
              <div className={cn(LABEL, "mb-1.5")}>
                Durée (min)
              </div>
              <input
                type="number"
                min={1}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="ex: 45"
                className={cn(INPUT, "text-[14px] font-bold")}
              />
            </div>
            {showDistance && (
              <div>
                <div className={cn(LABEL, "mb-1.5")}>
                  Distance (km)
                </div>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={distanceKm}
                  onChange={(e) => setDistanceKm(e.target.value)}
                  placeholder="ex: 10"
                  className={cn(INPUT, "text-[14px] font-bold")}
                />
              </div>
            )}
          </div>
          <div>
            <div className={cn(LABEL, "mb-1.5")}>
              Intensité — <span className={cn("font-bold", INTENSITY_TEXT[intensityTone])}>{intensity}/10</span>
            </div>
            <input
              type="range"
              min={1} max={10} value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
              className={cn("mt-1.5 w-full", INTENSITY_ACCENT[intensityTone])}
            />
          </div>

          {/* Note */}
          <div>
            <div className={cn(LABEL, "mb-1.5")}>
              Note (optionnel)
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Comment tu t'es senti…"
              rows={2}
              className={cn(INPUT, "resize-none text-[13px]")}
            />
          </div>

          <button
            onClick={handleSave}
            className="min-h-[44px] w-full cursor-pointer rounded-[6px] border-none bg-agon-accent py-[13px] font-[inherit] text-[14px] font-bold text-agon-ink"
          >
            {isEdit ? "Enregistrer les modifications" : "Enregistrer"}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
