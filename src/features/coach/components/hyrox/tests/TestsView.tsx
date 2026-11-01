import { useMemo, useState } from "react";
import { C } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { fmtHm, profileFromAthlete, type HyroxTestAnalysisRow, type StoredOutputs } from "@/lib/hyrox/tests";
import {
  useActiveGridSet, useHyroxAnalyses, useHyroxAthleteProfile, useHyroxBattery, useHyroxBatteryResults, useSetHyroxCategory,
} from "@/features/shared/hooks/hyrox/useHyroxTests";
import { ListSkeleton } from "@/features/shared/components/skeletons";
import AnalysisSheet from "./AnalysisSheet";
import BatteryPlan from "./BatteryPlan";
import CalibrationView from "./CalibrationView";
import CompareAnalyses from "./CompareAnalyses";
import NewAnalysisPanel from "./NewAnalysisPanel";
import { Btn, Card, Muted } from "./ui";
import { fmtDate, kindLabel, previousOf, todayIso } from "./format";

type Tab = "analyses" | "saisie" | "calibration";

export function AnalysisRow({ a, onOpen, selectable, selected, onSelect, coach }: {
  a: HyroxTestAnalysisRow; onOpen: () => void; selectable?: boolean; selected?: boolean; onSelect?: () => void; coach?: boolean;
}) {
  const o = a.outputs as unknown as StoredOutputs;
  return (
    <Card style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>
      {selectable && <input type="checkbox" aria-label="Comparer" checked={!!selected} onChange={onSelect} />}
      <button type="button" onClick={onOpen} style={{ flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{kindLabel(a.kind)} · {fmtDate(a.date)}</div>
        <Muted>
          {o.chrono ? `Chrono estimé ${fmtHm(o.chrono.median_s)}` : "Pas de chrono estimé"}
          {coach ? ` · grilles ${a.grid_version}${a.recalculated_from ? " · recalcul" : ""}` : ""}
        </Muted>
      </button>
      {coach && (
        <span style={{ fontSize: 10, fontWeight: 700, color: a.validated_at ? C.g : C.tx3, border: "1px solid " + (a.validated_at ? C.g : C.brd), borderRadius: 3, padding: "2px 6px" }}>
          {a.validated_at ? "Validé" : "À valider"}
        </span>
      )}
    </Card>
  );
}

export default function TestsView() {
  const { athleteId } = useAthleteContext();
  const { profile: me } = useAuth();
  const isAdmin = !!me?.is_admin;
  const [tab, setTab] = useState<Tab>("analyses");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);

  const { data: athlete } = useHyroxAthleteProfile(athleteId);
  const { data: analyses = [], isLoading } = useHyroxAnalyses(athleteId);
  const { data: results = [], isLoading: loadingResults } = useHyroxBatteryResults(athleteId);
  const { data: battery = [] } = useHyroxBattery();
  const active = useActiveGridSet();
  const setCategory = useSetHyroxCategory(athleteId);
  const testProfile = useMemo(() => profileFromAthlete(athlete ?? {}, todayIso()).profile, [athlete]);

  const open = analyses.find(a => a.id === openId);
  if (open)
    return (
      <AnalysisSheet
        analysis={open} previous={previousOf(analyses, open)} audience="coach" athleteId={athleteId}
        onBack={() => setOpenId(null)} isAdmin={isAdmin} activeSet={active.data}
      />
    );
  if (comparing && compare.length === 2) {
    const [a, b] = compare.map(id => analyses.find(x => x.id === id)!);
    if (a && b) return <CompareAnalyses a={a} b={b} onBack={() => setComparing(false)} />;
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "analyses", label: "Analyses" },
    { key: "saisie", label: "Semaine de tests" },
    ...(isAdmin ? [{ key: "calibration" as Tab, label: "Calibration" }] : []),
  ];

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", paddingTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {tabs.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              style={{
                padding: "6px 12px", borderRadius: 4, fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
                background: tab === t.key ? C.acS : "transparent", color: tab === t.key ? C.ac : C.tx3, border: "1px solid " + (tab === t.key ? C.ac : C.brd),
              }}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: C.tx3 }}>Catégorie</span>
          {(["open", "pro"] as const).map(c => (
            <button key={c} type="button" onClick={() => setCategory.mutate(c)} disabled={setCategory.isPending}
              style={{
                padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
                background: athlete?.hyrox_category === c ? C.acS : "transparent", color: athlete?.hyrox_category === c ? C.ac : C.tx3,
                border: "1px solid " + (athlete?.hyrox_category === c ? C.ac : C.brd),
              }}>
              {c === "open" ? "Open" : "Pro"}
            </button>
          ))}
        </div>
      </div>

      {tab === "saisie" && <BatteryPlan athleteId={athleteId} mode="coach" profile={testProfile} />}
      {tab === "calibration" && isAdmin && <CalibrationView />}
      {tab === "analyses" && (
        <>
          {creating && active.data ? (
            <NewAnalysisPanel
              athleteId={athleteId} results={results} battery={battery} athlete={athlete} set={active.data} hasAnalyses={analyses.length > 0}
              onCancel={() => setCreating(false)} onCreated={row => { setCreating(false); setOpenId(row.id); }}
            />
          ) : (
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 10 }}>
              {compare.length === 2 && <Btn onClick={() => setComparing(true)}>Comparer les 2</Btn>}
              <Btn primary onClick={() => setCreating(true)} disabled={!active.data || loadingResults}>Nouvelle analyse</Btn>
            </div>
          )}
          {active.error && (
            <Muted style={{ color: C.o, marginBottom: 10 }}>
              Grilles introuvables ({(active.error as Error).message}). Les tables des Tests HYROX ne sont pas encore installées sur cette base.
            </Muted>
          )}
          {isLoading ? <ListSkeleton rows={3} /> : analyses.length === 0 ? (
            <Card>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>Pas encore d'analyse</div>
              <Muted style={{ marginTop: 4 }}>
                La semaine de tests se fait en 5 séances (onglet « Semaine de tests »). Une fois les résultats saisis, « Nouvelle analyse » calcule le profil, le chrono estimé et la proposition d'axes. L'athlète ne voit rien avant ta validation.
              </Muted>
            </Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {analyses.length >= 2 && <Muted>Coche 2 analyses pour les comparer.</Muted>}
              {analyses.map(a => (
                <AnalysisRow
                  key={a.id} a={a} coach onOpen={() => setOpenId(a.id)} selectable={analyses.length >= 2}
                  selected={compare.includes(a.id)}
                  onSelect={() => setCompare(p => (p.includes(a.id) ? p.filter(x => x !== a.id) : [...p.slice(-1), a.id]))}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
