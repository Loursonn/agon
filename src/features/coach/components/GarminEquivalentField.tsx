import { useMemo, useState } from "react";
import { C } from "@/lib/theme";
import {
  garminLabel,
  garminQueryFor,
  isGarminExercise,
  searchGarminExercises,
  suggestGarminExercise,
  type GarminExerciseOption,
} from "@/lib/garminExercises";
import { useSetGarminEquivalent } from "@/features/coach/hooks/useGarminEquivalent";

interface ExerciseLike {
  id: string;
  name: string;
  garmin_category?: string | null;
  garmin_exercise?: string | null;
}

/**
 * « Équivalent Garmin » d'un exercice de la banque : ce que la montre affiche
 * quand la séance y est envoyée. Sans choix du coach, une proposition est
 * faite depuis le nom (c'est elle qui part sur la montre) ; le coach la
 * confirme ou la corrige. Sans proposition, l'étape part sous le nom Agon.
 */
export function GarminEquivalentField({ ex, onSaved }: { ex: ExerciseLike; onSaved?: () => void }) {
  const save = useSetGarminEquivalent();
  type Pair = { category: string; name: string };
  // Fiche ouverte = instantané : le choix enregistré s'affiche sans attendre le rechargement.
  const [saved, setSaved] = useState<Pair | null | undefined>(undefined);
  const fromEx = isGarminExercise(ex.garmin_category, ex.garmin_exercise)
    ? { category: ex.garmin_category as string, name: ex.garmin_exercise as string }
    : null;
  const chosen = saved !== undefined ? saved : fromEx;
  const proposed = useMemo(() => (chosen ? null : suggestGarminExercise(ex.name)), [chosen, ex.name]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState("");
  const results = useMemo(() => searchGarminExercises(query, 8), [query]);

  const pick = (p: Pair | null) => {
    setMsg("");
    const next = p ? { category: p.category, name: p.name } : null;
    save.mutate(
      { id: ex.id, pick: next },
      {
        onSuccess: () => {
          setSaved(next);
          setOpen(false);
          setMsg(p ? "Équivalent Garmin enregistré" : "Choix retiré : proposition automatique");
          onSaved?.();
          setTimeout(() => setMsg(""), 2500);
        },
        onError: (e) => setMsg("Erreur : " + e.message),
      },
    );
  };

  const startSearch = () => {
    setQuery(garminQueryFor(ex.name));
    setOpen(true);
  };

  const label = (o: Pair) =>
    `${garminLabel(o.name)} · ${garminLabel(o.category)}`;

  const lS = { fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: 8 };
  const smallBtn = (primary: boolean) => ({
    padding: "6px 10px", borderRadius: 4, border: "1px solid " + (primary ? C.ac : C.brdL),
    background: primary ? C.ac : "transparent", color: primary ? "#fff" : C.tx2, fontSize: 11, fontWeight: 600,
    cursor: save.isPending ? "wait" : "pointer", fontFamily: "inherit", flexShrink: 0,
  });

  return (
    <div style={{ background: C.s2, borderRadius: 6, padding: "12px 14px", marginBottom: 12, border: "1px solid " + C.brdL }}>
      <div style={lS}>Équivalent Garmin</div>

      {chosen && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, fontSize: 12, color: C.tx }}>{label(chosen)}</div>
          <button onClick={startSearch} disabled={save.isPending} style={smallBtn(false)}>Changer</button>
          <button onClick={() => pick(null)} disabled={save.isPending} style={smallBtn(false)}>Retirer</button>
        </div>
      )}

      {!chosen && proposed && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, fontSize: 12, color: C.tx2, lineHeight: 1.5 }}>
            Proposition automatique : <span style={{ color: C.tx }}>{label(proposed)}</span>
          </div>
          <button onClick={() => pick(proposed)} disabled={save.isPending} style={smallBtn(true)}>Valider</button>
          <button onClick={startSearch} disabled={save.isPending} style={smallBtn(false)}>Corriger</button>
        </div>
      )}

      {!chosen && !proposed && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, fontSize: 12, color: C.tx3, lineHeight: 1.5 }}>
            Aucun : la montre affichera « {ex.name} ».
          </div>
          <button onClick={startSearch} disabled={save.isPending} style={smallBtn(false)}>Choisir</button>
        </div>
      )}

      {open && (
        <div style={{ marginTop: 10 }}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nom Garmin en anglais : back squat, bench press…"
            style={{ padding: "8px 10px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s1, color: C.tx, fontSize: 12, fontFamily: "inherit", width: "100%", boxSizing: "border-box", outline: "none" }}
          />
          <div style={{ display: "flex", flexDirection: "column", marginTop: 6, maxHeight: 220, overflowY: "auto" }}>
            {results.map((o: GarminExerciseOption) => (
              <button
                key={o.category + "/" + o.name}
                onClick={() => pick(o)}
                disabled={save.isPending}
                style={{ textAlign: "left", padding: "7px 8px", border: "none", borderBottom: "1px solid " + C.brdL, background: "transparent", color: C.tx, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
              >
                {garminLabel(o.name)} <span style={{ color: C.tx3 }}>· {garminLabel(o.category)}</span>
              </button>
            ))}
            {query.trim() && results.length === 0 && (
              <div style={{ fontSize: 11, color: C.tx3, padding: "6px 0" }}>Aucun exercice Garmin ne contient ces mots.</div>
            )}
          </div>
          <button onClick={() => setOpen(false)} style={{ ...smallBtn(false), marginTop: 8 }}>Annuler</button>
        </div>
      )}

      {msg && <div style={{ fontSize: 11, fontWeight: 600, color: msg.startsWith("Erreur") ? C.r : C.g, marginTop: 8 }}>{msg}</div>}
    </div>
  );
}
