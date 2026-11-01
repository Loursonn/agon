import { useState, useRef, useEffect } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { C } from "@/lib/theme";
import type { FreeSession } from "@/features/shared/types/athlete";

const MONTHS_FR = ["jan","fév","mar","avr","mai","jun","jul","aoû","sep","oct","nov","déc"];
const DAYS_FULL_FR = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];

export const SPORTS = [
  { key: "course",    abbr: "CO", label: "Course"       },
  { key: "velo",      abbr: "VE", label: "Vélo"         },
  { key: "natation",  abbr: "NA", label: "Natation"     },
  { key: "muscu",     abbr: "MU", label: "Muscu"        },
  { key: "marche",    abbr: "MA", label: "Marche"       },
  { key: "yoga",      abbr: "YO", label: "Yoga"         },
  { key: "football",  abbr: "FO", label: "Football"     },
  { key: "tennis",    abbr: "TE", label: "Tennis"       },
  { key: "boxe",      abbr: "BX", label: "Boxe"         },
  { key: "escalade",  abbr: "ES", label: "Escalade"     },
  { key: "ski",       abbr: "SK", label: "Ski"          },
  { key: "autre",     abbr: "AU", label: "Autre"        },
];

const DISTANCE_SPORTS = ["course", "velo", "natation", "marche", "ski", "autre"];

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

  const intensityColor = intensity <= 3 ? C.g : intensity <= 6 ? C.o : C.r;

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent style={{ background: C.s1, borderTop: "1px solid " + C.brd, padding: "0 0 32px" }}>
        <DrawerHeader style={{ padding: "16px 20px 12px", display: "flex", alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <DrawerTitle style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>
              {isEdit ? "Modifier l'activité" : "Activité libre"}
              {dateLabel ? <span style={{ fontSize: 13, fontWeight: 400, color: C.tx3, marginLeft: 8 }}>{dateLabel}</span> : null}
            </DrawerTitle>
          </div>
          {isEdit && onDelete && existing && (
            <button
              onClick={() => setConfirmDel((v) => !v)}
              style={{
                padding: "5px 12px", borderRadius: 4,
                border: "1px solid " + C.r + "50", background: "rgba(239,75,75,0.08)",
                color: C.r, fontSize: 11, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Supprimer
            </button>
          )}
        </DrawerHeader>

        <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {confirmDel && isEdit && onDelete && existing && (
            <div style={{ padding: "10px 12px", borderRadius: 4, background: C.rS, border: "1px solid " + C.r + "40" }}>
              <div style={{ fontSize: 12, color: C.tx2, marginBottom: 10 }}>Supprimer cette activité ?</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setConfirmDel(false)} style={{ flex: 1, padding: "8px 0", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
                <button type="button" onClick={() => { onDelete(existing.id); onClose(); }} style={{ flex: 1, padding: "8px 0", borderRadius: 4, border: "none", background: C.r, color: "#0E0C0A", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Supprimer</button>
              </div>
            </div>
          )}
          {/* Sport picker */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
              Sport
            </div>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 4 }}>
              {SPORTS.map((s) => {
                const active = sport.key === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => { setSport(s); if (s.key === "autre") setTimeout(() => labelRef.current?.focus(), 50); }}
                    style={{
                      flexShrink: 0, padding: "8px 12px", borderRadius: 4,
                      border: "1px solid " + (active ? C.ac + "80" : C.brd),
                      background: active ? C.acS : C.s2,
                      cursor: "pointer", fontFamily: "inherit",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                      minWidth: 52,
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 800, color: active ? C.ac : C.tx3 }}>{s.abbr}</span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: active ? C.ac : C.tx3 }}>{s.label}</span>
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
                style={{
                  marginTop: 8, width: "100%", padding: "9px 12px",
                  borderRadius: 4, border: "1px solid " + C.brdL,
                  background: C.s2, color: C.tx, fontSize: 13,
                  fontFamily: "inherit", boxSizing: "border-box" as const, outline: "none",
                }}
              />
            )}
          </div>

          {/* Duration + distance + intensity */}
          <div style={{ display: "grid", gridTemplateColumns: showDistance ? "1fr 1fr" : "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
                Durée (min)
              </div>
              <input
                type="number"
                min={1}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="ex: 45"
                style={{
                  width: "100%", padding: "9px 12px", borderRadius: 4,
                  border: "1px solid " + C.brdL, background: C.s2,
                  color: C.tx, fontSize: 14, fontWeight: 700,
                  fontFamily: "inherit", boxSizing: "border-box" as const, outline: "none",
                }}
              />
            </div>
            {showDistance && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
                  Distance (km)
                </div>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={distanceKm}
                  onChange={(e) => setDistanceKm(e.target.value)}
                  placeholder="ex: 10"
                  style={{
                    width: "100%", padding: "9px 12px", borderRadius: 4,
                    border: "1px solid " + C.brdL, background: C.s2,
                    color: C.tx, fontSize: 14, fontWeight: 700,
                    fontFamily: "inherit", boxSizing: "border-box" as const, outline: "none",
                  }}
                />
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
              Intensité — <span style={{ color: intensityColor, fontWeight: 700 }}>{intensity}/10</span>
            </div>
            <input
              type="range"
              min={1} max={10} value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
              style={{ width: "100%", accentColor: intensityColor, marginTop: 6 }}
            />
          </div>

          {/* Note */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
              Note (optionnel)
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Comment tu t'es senti…"
              rows={2}
              style={{
                width: "100%", padding: "9px 12px", borderRadius: 4,
                border: "1px solid " + C.brdL, background: C.s2,
                color: C.tx, fontSize: 13, fontFamily: "inherit",
                resize: "none", outline: "none", boxSizing: "border-box" as const,
              }}
            />
          </div>

          <button
            onClick={handleSave}
            style={{
              width: "100%", padding: "13px 0", borderRadius: 6,
              border: "none", background: C.acV, color: "#0E0C0A",
              fontSize: 14, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit", minHeight: 44,
            }}
          >
            {isEdit ? "Enregistrer les modifications" : "Enregistrer"}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
