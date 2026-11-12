import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { C, alpha } from "@/lib/theme";
import { useExerciseLibrary, useExerciseSearch } from "@/features/shared/hooks/useExerciseLibrary";
import { StationIcon } from "./StationIcon";
import { MONO } from "./seanceUi";

/** Stations HYROX proposées d'office (le reste se cherche dans la banque). */
const HYROX_STATIONS = ["Sled push", "Sled pull", "Wall balls", "Burpee broad jump", "Farmers carry", "Sandbag lunges", "SkiErg", "Rameur"];

export type LapType = "run" | "station" | "transition";

interface Props {
  type: LapType;
  onType: (t: LapType) => void;
  /** Exercice choisi (banque) ou texte libre. */
  onPick: (name: string, exerciseId: string | null) => void;
  compact?: boolean;
}

/** Type d'un tour HYROX et exercice de la banque Agon (ou texte libre). */
export function LapExercisePicker({ type, onType, onPick, compact }: Props) {
  const [q, setQ] = useState("");
  const [free, setFree] = useState("");
  const { results } = useExerciseSearch(q, "");
  const lib = useExerciseLibrary(true);
  const byName = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of lib.data ?? []) m.set(e.name.trim().toLowerCase(), e.id);
    return m;
  }, [lib.data]);
  const list = q.trim()
    ? results.map((r) => ({ name: r.name, id: r.id, hyrox: HYROX_STATIONS.some((h) => h.toLowerCase() === r.name.toLowerCase()) }))
    : HYROX_STATIONS.slice(0, compact ? 5 : 8).map((n) => ({ name: n, id: byName.get(n.toLowerCase()) ?? null, hyrox: true }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        {!compact && <div style={{ fontSize: 11.5, color: C.tx3, marginBottom: 6 }}>Type</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {(["run", "station", "transition"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { onType(t); if (t === "run") onPick("Course", byName.get("course") ?? null); if (t === "transition") onPick("Transition", null); }}
              style={{
                height: 34, borderRadius: 9, fontSize: 12.5, fontFamily: "inherit", cursor: "pointer",
                border: `1px solid ${type === t ? C.ac : C.brdL}`, background: type === t ? alpha(C.ac, 0.12) : "transparent",
                color: type === t ? C.ac : C.tx2,
              }}
            >
              {t === "run" ? "Course" : t === "station" ? "Station" : "Transition"}
            </button>
          ))}
        </div>
      </div>

      {type === "station" && (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 10px", borderRadius: 10, background: C.s2, border: `1px solid ${C.brd}` }}>
            <Search size={14} color={C.tx3} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={compact ? "Banque ou texte libre" : "Chercher dans la banque"}
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C.tx, fontSize: 16, fontFamily: "inherit" }}
            />
          </label>
          <div style={{ display: "flex", flexDirection: "column", maxHeight: compact ? 122 : 300, overflowY: "auto" }}>
            {list.map((e) => (
              <button
                key={`${e.name}-${e.id}`}
                type="button"
                onClick={() => onPick(e.name, e.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, minHeight: 40, padding: "0 6px", border: "none",
                  borderBottom: `1px solid ${C.brd}`, background: "transparent", color: C.tx, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                }}
              >
                <StationIcon name={e.name} size={16} />
                <span style={{ flex: 1, fontSize: 13 }}>{e.name}</span>
                {!compact && <span style={{ ...MONO, fontSize: 10.5, color: C.tx3 }}>{e.hyrox ? "Banque · HYROX" : "Banque · autre exercice"}</span>}
              </button>
            ))}
          </div>
          {!compact && (
            <div>
              <div style={{ fontSize: 11.5, color: C.tx3, marginBottom: 6 }}>Ou texte libre</div>
              <input
                value={free}
                onChange={(e) => setFree(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && free.trim() && onPick(free.trim(), null)}
                onBlur={() => free.trim() && onPick(free.trim(), null)}
                placeholder="ex. Sled push 15 m · 102 kg"
                style={{ width: "100%", height: 38, padding: "0 10px", borderRadius: 10, background: C.s2, border: `1px solid ${C.brd}`, color: C.tx, fontSize: 14, fontFamily: "inherit", outline: "none" }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
