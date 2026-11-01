import { useMemo, useState } from "react";
import { C } from "@/lib/theme";
import {
  BATTERY_IDS, analyzeTests, defaultWindow, fmtHm, inputsFromResults, profileFromAthlete,
  type BatteryResult, type GridSet, type HyroxTestAnalysisRow,
} from "@/lib/hyrox/tests";
import { useCreateHyroxAnalysis, type BatteryTest, type HyroxAthleteProfile } from "@/features/shared/hooks/hyrox/useHyroxTests";
import { Btn, Card, Muted, SectionTitle } from "./ui";
import { inputStyle, labelStyle, parseChrono } from "./format";

export default function NewAnalysisPanel({
  athleteId, results, battery, athlete, set, hasAnalyses, onCancel, onCreated,
}: {
  athleteId: string;
  results: BatteryResult[];
  battery: BatteryTest[];
  athlete: HyroxAthleteProfile | null | undefined;
  set: GridSet;
  hasAnalyses: boolean;
  onCancel: () => void;
  onCreated: (row: HyroxTestAnalysisRow) => void;
}) {
  const create = useCreateHyroxAnalysis(athleteId);
  const w0 = useMemo(() => defaultWindow(results), [results]);
  const [from, setFrom] = useState(w0?.from ?? "");
  const [to, setTo] = useState(w0?.to ?? "");
  const [kind, setKind] = useState<"bilan" | "retest">(hasAnalyses ? "retest" : "bilan");
  const [targetRaw, setTargetRaw] = useState("");
  const target = parseChrono(targetRaw);

  const picked = useMemo(() => (from && to ? inputsFromResults(results, { from, to }) : null), [results, from, to]);
  const date = picked?.last_date ?? to;
  const prof = useMemo(() => profileFromAthlete(athlete ?? {}, date || to || ""), [athlete, date, to]);
  const preview = useMemo(
    () => (picked && prof.profile && picked.source_result_ids.length ? analyzeTests(picked.inputs, prof.profile, { set }) : null),
    [picked, prof.profile, set],
  );
  const nameOf = (slug: keyof typeof BATTERY_IDS) => battery.find(t => t.id === BATTERY_IDS[slug])?.name ?? slug;
  const missingCore = picked?.missing.filter(s => !s.startsWith("week1")) ?? [];

  return (
    <>
      <SectionTitle>Nouvelle analyse</SectionTitle>
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
          <div>
            <label style={labelStyle}>Type</label>
            <select value={kind} onChange={e => setKind(e.target.value as "bilan" | "retest")} style={inputStyle}>
              <option value="bilan">Bilan d'entrée</option><option value="retest">Retest</option>
            </select>
          </div>
          <div><label style={labelStyle}>Résultats du</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} /></div>
          <div><label style={labelStyle}>au</label><input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} /></div>
          <div>
            <label style={labelStyle}>Chrono visé (facultatif)</label>
            <input value={targetRaw} onChange={e => setTargetRaw(e.target.value)} placeholder="ex : 1:20:00" style={inputStyle} />
          </div>
        </div>
        <Muted style={{ marginTop: 8 }}>Pour chaque test, le résultat le plus récent de la période est retenu. Les données brutes sont figées dans l'analyse.</Muted>

        {!w0 && <div style={{ fontSize: 12, color: C.o, marginTop: 10 }}>Aucun résultat de la batterie pour cet athlète : commence par la saisie.</div>}
        {prof.warnings.map(x => <div key={x} style={{ fontSize: 11, color: prof.profile ? C.o : C.r, marginTop: 6 }}>{x}</div>)}
        {picked && (
          <div style={{ fontSize: 12, color: C.tx2, marginTop: 10, lineHeight: 1.6 }}>
            {picked.source_result_ids.length} tests retenus{picked.first_date ? ` (du ${picked.first_date.split("-").reverse().join("/")} au ${picked.last_date!.split("-").reverse().join("/")})` : ""}.
            {missingCore.length > 0 && <div style={{ color: C.tx3 }}>Manquants : {missingCore.map(nameOf).join(", ")}.</div>}
            {preview?.chrono && <div>Aperçu : chrono estimé <b style={{ color: C.ac }}>{fmtHm(preview.chrono.median_s)}</b> ({fmtHm(preview.chrono.low_s)} – {fmtHm(preview.chrono.high_s)}).</div>}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <Btn onClick={onCancel}>Annuler</Btn>
          <Btn
            primary
            disabled={!picked?.source_result_ids.length || !prof.profile || !date || create.isPending || (targetRaw !== "" && target == null)}
            onClick={() => create.mutate({
              kind, date, inputs: picked!.inputs, profile: prof.profile!, set, source_result_ids: picked!.source_result_ids,
              target_s: target, context: { competition: "A" },
            }, { onSuccess: onCreated })}
          >
            {create.isPending ? "Calcul…" : `Calculer (grilles ${set.version})`}
          </Btn>
        </div>
      </Card>
    </>
  );
}
