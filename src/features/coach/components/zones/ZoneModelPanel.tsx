import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { Button } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { zoneColor } from "@/lib/seance";
import { localIsoDay } from "@shared/domain/dates";
import { activeModelAt, sevenZoneBounds, validBounds, zoneNames } from "@shared/domain/hrZones";
import {
  useApplyZoneModelToPast, useDecideZoneModel, useSaveZoneModel, useZoneModels, type ZoneModelRow,
} from "@/features/shared/hooks/useZoneModels";
import { useAthleteCoaches } from "@/features/shared/hooks/useCoCoach";
import { ZoneBoundsBar } from "@/features/shared/components/zones/ZoneBoundsBar";
import { modelLabel, modelZoneCount } from "@/features/shared/components/zones/zoneModelLabel";

type Choice = 3 | 5 | 7;

const fmtDay = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
const STATUS_LABEL: Record<ZoneModelRow["status"], string> = {
  active: "Appliqué", proposed: "Proposé", rejected: "Refusé", replaced: "Remplacé",
};

const inputStyle = {
  width: 64, padding: "6px 8px", borderRadius: 8, border: "1px solid " + C.brdL, background: C.s2,
  color: C.tx, fontSize: 13, fontFamily: "var(--agon-font-data)", outline: "none", textAlign: "right" as const,
};

/**
 * Zones FC fixées par le coach (profil sportif) : modèle 3, 5 ou 7 zones,
 * valable à partir d'aujourd'hui ; proposition d'un test SV à accepter ;
 * « Appliquer aussi aux séances passées » ; historique des changements.
 * Le 5 zones garde l'éditeur des références `FCzone_*` (`fiveEditor`).
 */
export function ZoneModelPanel({
  athleteId, fcmax, fcrep, fiveEditor, fiveBounds,
}: {
  athleteId: string;
  fcmax: number | null;
  fcrep: number | null;
  /** Éditeur historique des 5 zones (références FCzone_*). */
  fiveEditor: ReactNode;
  /** Bornes basses actuelles du 5 zones (aperçu), si connues. */
  fiveBounds: number[] | null;
}) {
  const today = localIsoDay();
  const { data: rows = [] } = useZoneModels(athleteId);
  const { data: coaches } = useAthleteCoaches(athleteId);
  const save = useSaveZoneModel(athleteId);
  const decide = useDecideZoneModel(athleteId);
  const applyPast = useApplyZoneModelToPast(athleteId);

  const current = useMemo(() => activeModelAt(rows, today), [rows, today]);
  const currentN: Choice = current ? (modelZoneCount(current) === 3 ? 3 : modelZoneCount(current) === 7 ? 7 : 5) : 5;
  const [choice, setChoice] = useState<Choice>(currentN);
  useEffect(() => setChoice(currentN), [currentN]);

  const proposals = rows.filter((r) => r.status === "proposed");

  // Champs 3 zones (SV1 / SV2) et 7 zones (6 bornes)
  const [sv, setSv] = useState<string[]>(["", ""]);
  const [seven, setSeven] = useState<string[]>(Array(6).fill(""));
  useEffect(() => {
    const three = current?.kind === "three" ? current.bounds : null;
    setSv(three ? three.map(String) : ["", ""]);
    const sevenCur = current?.kind === "custom" && current.bounds.length === 6 ? current.bounds : sevenZoneBounds(fcmax, fcrep);
    setSeven(sevenCur ? sevenCur.map(String) : Array(6).fill(""));
  }, [current, fcmax, fcrep]);

  const draft: number[] | null =
    choice === 3 ? validBounds(sv.map(Number)) : choice === 7 ? validBounds(seven.map(Number)) : fiveBounds;
  const unchanged =
    !!current && !!draft && modelZoneCount(current) === choice && current.kind !== "five" &&
    current.bounds.join(",") === draft.join(",");

  const who = (id: string | null) => {
    if (!id) return "Agon";
    if (coaches?.referent?.id === id) return coaches.referent.full_name;
    if (coaches?.coCoach?.id === id) return coaches.coCoach.full_name;
    if (id === athleteId) return "L'athlète";
    return "Un coach";
  };

  async function saveModel() {
    if (choice === 5) {
      await save.mutateAsync({ kind: "five", bounds: [], validFrom: today });
    } else {
      if (!draft || (choice === 7 && draft.length !== 6)) { toast.error("Bornes incohérentes : elles doivent monter d'une zone à l'autre."); return; }
      await save.mutateAsync({ kind: choice === 3 ? "three" : "custom", bounds: draft, validFrom: today });
    }
    toast.success("Zones enregistrées, valables à partir d'aujourd'hui");
  }

  const [confirmPast, setConfirmPast] = useState(false);

  const seg = (n: Choice) => (
    <button
      key={n}
      type="button"
      role="radio"
      aria-checked={choice === n}
      onClick={() => setChoice(n)}
      style={{
        flex: 1, height: 34, borderRadius: 8, border: "none", cursor: "pointer", ...MONO, fontSize: 11,
        letterSpacing: "0.06em", textTransform: "uppercase",
        background: choice === n ? "rgba(255,201,51,0.14)" : "transparent", color: choice === n ? C.ac : C.tx3,
      }}
    >
      {n} zones
    </button>
  );

  return (
    <div style={{ background: C.s1, border: "1px solid " + C.brd, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>Zones de fréquence cardiaque</div>
        <div style={{ ...MONO, fontSize: 11, color: C.tx3 }}>
          {current ? `${modelLabel(current)} · depuis le ${fmtDay(current.validFrom === "2000-01-01" ? current.createdAt.slice(0, 10) : current.validFrom)}` : "5 zones (par défaut)"}
        </div>
      </div>

      {proposals.map((p) => (
        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(240,96,192,0.45)", background: "rgba(240,96,192,0.10)" }}>
          <span style={{ flex: 1, minWidth: 200, fontSize: 13, color: C.tx }}>
            Proposé par le test du {fmtDay(p.validFrom)} : <span style={{ ...MONO }}>SV1 {p.bounds[0]} · SV2 {p.bounds[1]}</span>
          </span>
          <Button size="sm" onClick={() => decide.mutate({ id: p.id, accept: true }, { onSuccess: () => toast.success("Zones du test appliquées à partir d'aujourd'hui") })} disabled={decide.isPending}>Accepter</Button>
          <Button size="sm" variant="secondary" onClick={() => decide.mutate({ id: p.id, accept: false })} disabled={decide.isPending}>Refuser</Button>
        </div>
      ))}

      <div role="radiogroup" aria-label="Modèle de zones" style={{ display: "flex", gap: 2, padding: 3, border: "1px solid rgba(231,211,168,0.10)", borderRadius: 11 }}>
        {([3, 5, 7] as const).map(seg)}
      </div>

      {choice === 3 && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          {["SV1", "SV2"].map((l, i) => (
            <label key={l} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.tx2 }}>
              {l}
              <input type="number" inputMode="numeric" value={sv[i]} onChange={(e) => setSv((p) => p.map((x, j) => (j === i ? e.target.value : x)))} style={inputStyle} />
              <span style={{ fontSize: 11, color: C.tx3 }}>bpm</span>
            </label>
          ))}
          <span style={{ fontSize: 11, color: C.tx3 }}>Zone 1 &lt; SV1 ≤ Zone 2 &lt; SV2 ≤ Zone 3</span>
        </div>
      )}

      {choice === 5 && fiveEditor}

      {choice === 7 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {zoneNames(7).map((name, i) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 4, height: 20, borderRadius: 2, background: zoneColor(i + 1, 7), flex: "none" }} />
              <span style={{ flex: 1, fontSize: 13, color: C.tx }}>Z{i + 1} — {name}</span>
              {i === 0 ? (
                <span style={{ ...MONO, fontSize: 12, color: C.tx3 }}>jusqu'à {seven[0] ? Number(seven[0]) - 1 : "—"} bpm</span>
              ) : (
                <>
                  <span style={{ fontSize: 11, color: C.tx3 }}>dès</span>
                  <input
                    type="number" inputMode="numeric" aria-label={`Début de la zone ${i + 1}`}
                    value={seven[i - 1]} onChange={(e) => setSeven((p) => p.map((x, j) => (j === i - 1 ? e.target.value : x)))}
                    style={inputStyle}
                  />
                  <span style={{ fontSize: 11, color: C.tx3, width: 26 }}>bpm</span>
                </>
              )}
            </div>
          ))}
          {fcmax ? (
            <button
              type="button"
              onClick={() => { const b = sevenZoneBounds(fcmax, fcrep); if (b) setSeven(b.map(String)); }}
              style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, color: C.ac, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
            >
              Recalculer depuis FC max {fcmax}{fcrep ? ` et FC repos ${fcrep}` : ""}
            </button>
          ) : (
            <span style={{ fontSize: 11, color: C.tx3 }}>Renseigne la FC max pour obtenir des bornes proposées.</span>
          )}
        </div>
      )}

      {draft && <ZoneBoundsBar bounds={draft} />}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {(choice !== 5 || current?.kind !== "five") && (choice !== 5 || current) && (
          <Button onClick={saveModel} disabled={save.isPending || unchanged || !draft}>
            {choice === 5 ? "Passer à 5 zones" : "Enregistrer"} (à partir d'aujourd'hui)
          </Button>
        )}
        {current && choice === currentN && current.validFrom !== "2000-01-01" && (
          <Button variant="secondary" onClick={() => setConfirmPast(true)} disabled={applyPast.isPending}>
            Appliquer aussi aux séances passées
          </Button>
        )}
      </div>

      {rows.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer", fontSize: 12, color: C.tx2 }}>Historique ({rows.length})</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
            {rows.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 10, fontSize: 12, color: r.status === "active" ? C.tx : C.tx3, flexWrap: "wrap" }}>
                <span style={{ ...MONO, width: 86 }}>{fmtDay(r.createdAt.slice(0, 10))}</span>
                <span style={{ flex: 1, minWidth: 120 }}>{modelLabel(r)}{r.origin === "test" ? " · test" : ""}</span>
                <span>{who(r.decidedBy ?? r.createdBy)}</span>
                <span style={{ ...MONO, width: 80, textAlign: "right" }}>{STATUS_LABEL[r.status]}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <Dialog
        open={confirmPast}
        onOpenChange={setConfirmPast}
        title="Appliquer aussi aux séances passées ?"
        description="Les zones actuelles remplaceront les anciennes sur toutes les séances déjà faites (temps par zone recalculé). À utiliser pour corriger une erreur de saisie."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmPast(false)}>Annuler</Button>
            <Button
              onClick={() => {
                if (!current) return;
                applyPast.mutate(current.id, {
                  onSuccess: () => toast.success("Zones appliquées aux séances passées"),
                  onError: () => toast.error("Impossible d'appliquer aux séances passées"),
                });
                setConfirmPast(false);
              }}
            >
              Appliquer
            </Button>
          </>
        }
      />
    </div>
  );
}
