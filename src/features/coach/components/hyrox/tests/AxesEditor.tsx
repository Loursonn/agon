import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import {
  analyzeTests, fmtHm, fmtTime, validatedFromPlan,
  type AthleteContext, type AxesPlan, type GridSet, type HyroxTestAnalysisRow, type HyroxTestAxesDraftRow, type ValidatedAxes,
} from "@/lib/hyrox/tests";
import { useHyroxResults } from "@/features/shared/hooks/hyrox/useHyroxResults";
import { useSaveAxesDraft, useValidateAxes } from "@/features/shared/hooks/hyrox/useHyroxTests";
import type { HyroxResult } from "@/features/shared/types/hyrox";
import { Btn, Card, Muted, SectionTitle } from "./ui";
import { inputStyle, labelStyle, parseChrono, vocabularyWarnings } from "./format";

const DEFAULT_CTX: AthleteContext = { competition: "A", weeks_to_a: null };

const TOGGLES: { key: keyof AthleteContext; label: string }[] = [
  { key: "pain", label: "Douleur déjà présente" },
  { key: "comeback", label: "Reprise après coupure" },
  { key: "injury_risk", label: "Blessure à risque" },
  { key: "first_hyrox", label: "Premier HYROX" },
  { key: "duo", label: "Duo ou relais" },
  { key: "to_pro", label: "Passage à Pro" },
  { key: "four_sessions", label: "4 séances par semaine" },
  { key: "missing_equipment", label: "Matériel manquant" },
];

type HyroxResultExt = HyroxResult & { top_pct_overall?: number | null; roxzone_top_pct?: number | null; roxzone_cause?: "marche" | "orga" | "site" | null };

/** Dernière course solo terminée -> données Roxzone (top % final et Roxzone, Roxzone, run moyen 2 à 7). */
function lastRaceFrom(races: HyroxResult[]): AthleteContext["last_race"] {
  const r = (races as HyroxResultExt[]).find(x => x.status === "finished" && x.format === "solo");
  if (!r) return null;
  const final = r.top_pct_overall ?? (r.rank_overall && r.participants_overall ? (r.rank_overall / r.participants_overall) * 100 : null);
  const runs = [r.run_2_s, r.run_3_s, r.run_4_s, r.run_5_s, r.run_6_s, r.run_7_s].filter((x): x is number => x != null && x > 0);
  return {
    top_pct_final: final != null ? Math.round(final * 10) / 10 : null,
    top_pct_roxzone: r.roxzone_top_pct ?? null,
    roxzone_s: r.roxzone_total_s ?? null,
    avg_run_s: runs.length ? Math.round(runs.reduce((s, x) => s + x, 0) / runs.length) : null,
    cause: r.roxzone_cause ?? null,
  };
}

function ProposalView({ plan }: { plan: AxesPlan }) {
  return (
    <Card>
      <div style={{ fontSize: 12, color: C.tx2, marginBottom: 8 }}>
        Estimé {fmtHm(plan.estimate_s)} · visé {fmtHm(plan.target_s)}{plan.target_shifted ? " (déjà atteint : calcul sur 10 min de moins)" : ""} · écart {fmtTime(plan.gap_s)} dont course {fmtTime(plan.run_gain_s)}
        {plan.short_prep ? " · prépa courte" : ""}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, color: C.tx2 }}>
          <thead>
            <tr style={{ color: C.tx3, textAlign: "left" }}>
              {["Station", "Gain", "Catégorie", "Note", "Vitesse", "Rôle"].map(h => <th key={h} style={{ padding: "4px 6px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {plan.rows.map(r => (
              <tr key={r.segment} style={{ borderTop: "1px solid " + C.brd, color: /^Principal 2($| \()/.test(r.role) ? C.tx : C.tx2 }}>
                <td style={{ padding: "4px 6px" }}>{r.segment}</td>
                <td style={{ padding: "4px 6px" }}>{fmtTime(r.gain_s)}</td>
                <td style={{ padding: "4px 6px" }}>{r.category ?? "—"}{r.shifted_by_note ? " *" : ""}</td>
                <td style={{ padding: "4px 6px" }}>{r.note ?? "—"}</td>
                <td style={{ padding: "4px 6px" }}>{r.speed ?? "—"}</td>
                <td style={{ padding: "4px 6px" }}>{r.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Muted style={{ marginTop: 4 }}>* catégorie décalée par la note au test.</Muted>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10, fontSize: 12, color: C.tx2, lineHeight: 1.5 }}>
        <div><b style={{ color: C.tx }}>Principal 1 · {plan.principal1.label}</b> — {plan.principal1.detail}</div>
        <div><b style={{ color: C.tx }}>Principal 2 · {plan.principal2.label}</b>{plan.principal2.detail ? ` — ${plan.principal2.detail}` : ""}</div>
        <div><b style={{ color: C.tx }}>Appoint</b> — {plan.appoint.items.join(", ")}{plan.appoint.detail ? `. ${plan.appoint.detail}` : ""}</div>
        {plan.maintenance.length > 0 && <div><b style={{ color: C.tx }}>Entretien</b> — {plan.maintenance.join(", ")}</div>}
        {plan.safety.length > 0 && <div><b style={{ color: C.o }}>Sécurité, hors classement</b> — {plan.safety.join(", ")}</div>}
        <div><b style={{ color: C.tx }}>Roxzone</b> — {plan.roxzone.text}</div>
        <div><b style={{ color: C.tx }}>Bloc</b> — {plan.block.join(" ")}</div>
      </div>
    </Card>
  );
}

const lines = (x: string) => x.split("\n").map(s => s.trim()).filter(Boolean);

export default function AxesEditor({ analysis, draft, set, athleteId }: {
  analysis: HyroxTestAnalysisRow; draft: HyroxTestAxesDraftRow | null | undefined; set: GridSet | null; athleteId: string;
}) {
  const { data: races = [] } = useHyroxResults(athleteId);
  const saveDraft = useSaveAxesDraft(athleteId);
  const validate = useValidateAxes(athleteId);

  const [ctx, setCtx] = useState<AthleteContext>(draft?.context && Object.keys(draft.context).length ? draft.context : DEFAULT_CTX);
  const [targetRaw, setTargetRaw] = useState(analysis.target_s ? fmtTime(analysis.target_s) : "");
  useEffect(() => {
    if (draft?.context && Object.keys(draft.context).length) setCtx(draft.context);
  }, [draft]);

  const target = parseChrono(targetRaw);
  const proposal = useMemo<AxesPlan | null>(() => {
    if (!set || target == null) return null;
    return analyzeTests(analysis.inputs, analysis.profile, { set, target_s: target, context: ctx }).axes_plan;
  }, [set, target, ctx, analysis.inputs, analysis.profile]);

  const [v, setV] = useState<ValidatedAxes>(analysis.axes_validated ?? validatedFromPlan(draft?.axes_plan ?? null));
  useEffect(() => { setV(analysis.axes_validated ?? validatedFromPlan(draft?.axes_plan ?? null)); }, [analysis.id, analysis.axes_validated, draft?.axes_plan]);

  const set1 = <K extends keyof AthleteContext>(k: K, x: AthleteContext[K]) => setCtx(p => ({ ...p, [k]: x }));
  const lr = ctx.last_race ?? {};
  const setLr = (k: keyof NonNullable<AthleteContext["last_race"]>, x: unknown) => setCtx(p => ({ ...p, last_race: { ...(p.last_race ?? {}), [k]: x } }));
  const numOrNull = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s.replace(",", "."))) ? null : Number(s.replace(",", ".")));

  const allText = [v.principal1.label, v.principal1.detail, v.principal2.label, v.principal2.detail, ...v.appoint, ...v.maintenance, ...v.safety, ...v.block, v.roxzone ?? "", v.coach_note ?? ""].join("\n");
  const warnings = vocabularyWarnings(allText);
  const validated = !!analysis.validated_at;
  const busy = saveDraft.isPending || validate.isPending;
  const saveDraftNow = () => saveDraft.mutateAsync({ analysis_id: analysis.id, context: ctx, axes_plan: proposal, target_s: target });

  return (
    <>
      <SectionTitle>Axes de travail · proposition (coach seulement)</SectionTitle>
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
          <div>
            <label style={labelStyle}>Chrono visé</label>
            <input value={targetRaw} onChange={e => setTargetRaw(e.target.value)} placeholder="ex : 1:20:00" style={inputStyle} />
            {targetRaw && target == null && <Muted style={{ color: C.r }}>Format : 1:20:00 ou 80:00</Muted>}
          </div>
          <div>
            <label style={labelStyle}>Compétition visée</label>
            <select value={ctx.competition} onChange={e => set1("competition", e.target.value as AthleteContext["competition"])} style={inputStyle}>
              <option value="A">A (objectif)</option><option value="B">B</option><option value="C">C</option><option value="none">Aucune datée</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Semaines avant la A</label>
            <input inputMode="numeric" value={ctx.weeks_to_a ?? ""} onChange={e => set1("weeks_to_a", numOrNull(e.target.value))} style={inputStyle} />
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 12 }}>
          {TOGGLES.map(t => (
            <label key={t.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.tx2, cursor: "pointer" }}>
              <input type="checkbox" checked={!!ctx[t.key]} onChange={e => set1(t.key, e.target.checked as never)} />
              {t.label}
            </label>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 10 }}>
          <span style={{ fontSize: 12, color: C.tx3 }}>Défauts techniques :</span>
          {(["wall_balls", "bbj", "sleds"] as const).map(k => (
            <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.tx2, cursor: "pointer" }}>
              <input type="checkbox" checked={!!ctx.tech_faults?.[k]} onChange={e => set1("tech_faults", { ...(ctx.tech_faults ?? {}), [k]: e.target.checked })} />
              {k === "wall_balls" ? "Wall balls" : k === "bbj" ? "BBJ" : "Sleds"}
            </label>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginTop: 12 }}>
          <div>
            <label style={labelStyle}>Envie de l'athlète</label>
            <input value={ctx.wish ?? ""} onChange={e => set1("wish", e.target.value)} placeholder="ex : wall balls" style={inputStyle} />
          </div>
          <label style={{ display: "flex", alignItems: "flex-end", gap: 6, fontSize: 12, color: C.tx2, paddingBottom: 8 }}>
            <input type="checkbox" checked={!!ctx.insists} onChange={e => set1("insists", e.target.checked)} /> Il insiste
          </label>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>Dernière course (Roxzone)</span>
          <Btn small onClick={() => setCtx(p => ({ ...p, last_race: lastRaceFrom(races) }))} disabled={!races.length}>Reprendre la dernière course</Btn>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10, marginTop: 8 }}>
          <div><label style={labelStyle}>Top % final</label><input value={lr.top_pct_final ?? ""} onChange={e => setLr("top_pct_final", numOrNull(e.target.value))} style={inputStyle} /></div>
          <div><label style={labelStyle}>Top % Roxzone</label><input value={lr.top_pct_roxzone ?? ""} onChange={e => setLr("top_pct_roxzone", numOrNull(e.target.value))} style={inputStyle} /></div>
          <div><label style={labelStyle}>Roxzone (m:ss)</label><input value={typeof lr.roxzone_s === "number" ? fmtTime(lr.roxzone_s) : lr.roxzone_s ?? ""} onChange={e => setLr("roxzone_s", e.target.value)} style={inputStyle} /></div>
          <div><label style={labelStyle}>Run moyen 2-7 (m:ss)</label><input value={typeof lr.avg_run_s === "number" ? fmtTime(lr.avg_run_s) : lr.avg_run_s ?? ""} onChange={e => setLr("avg_run_s", e.target.value)} style={inputStyle} /></div>
          <div>
            <label style={labelStyle}>Cause</label>
            <select value={lr.cause ?? ""} onChange={e => setLr("cause", e.target.value || null)} style={inputStyle}>
              <option value="">—</option><option value="marche">Marche</option><option value="orga">Organisation</option><option value="site">Grand site</option>
            </select>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <Btn small onClick={() => saveDraftNow().then(() => toast.success("Brouillon enregistré")).catch(() => { /* toast déjà affiché */ })} disabled={busy}>Enregistrer le brouillon</Btn>
        </div>
      </Card>

      {!set ? <Muted style={{ marginTop: 8 }}>Chargement des grilles…</Muted>
        : target == null ? <Muted style={{ marginTop: 8 }}>Saisis un chrono visé pour obtenir la proposition.</Muted>
        : proposal ? <div style={{ marginTop: 10 }}><ProposalView plan={proposal} /></div>
        : <Muted style={{ marginTop: 8 }}>Pas de proposition : il faut la vitesse critique (2 courses au moins).</Muted>}

      <SectionTitle right={validated ? <span style={{ fontSize: 11, color: C.g, fontWeight: 700 }}>Visible par l'athlète</span> : <span style={{ fontSize: 11, color: C.tx3 }}>Pas encore visible</span>}>
        Axes validés · ce que voit l'athlète
      </SectionTitle>
      <Card>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <Btn small onClick={() => setV(validatedFromPlan(proposal))} disabled={!proposal}>Repartir de la proposition</Btn>
        </div>
        {([["principal1", "Axe principal 1"], ["principal2", "Axe principal 2"]] as const).map(([k, label]) => (
          <div key={k} style={{ marginBottom: 10 }}>
            <label style={labelStyle}>{label}</label>
            <input value={v[k].label} onChange={e => setV(p => ({ ...p, [k]: { ...p[k], label: e.target.value } }))} style={{ ...inputStyle, marginBottom: 4 }} />
            <textarea value={v[k].detail} onChange={e => setV(p => ({ ...p, [k]: { ...p[k], detail: e.target.value } }))} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          </div>
        ))}
        {([["appoint", "Appoint (une ligne par élément)"], ["maintenance", "Entretien"], ["safety", "Sécurité, hors classement"], ["block", "Organisation du bloc"]] as const).map(([k, label]) => (
          <div key={k} style={{ marginBottom: 10 }}>
            <label style={labelStyle}>{label}</label>
            <textarea value={v[k].join("\n")} onChange={e => setV(p => ({ ...p, [k]: lines(e.target.value) }))} rows={Math.max(2, v[k].length)} style={{ ...inputStyle, resize: "vertical" }} />
          </div>
        ))}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Roxzone</label>
          <textarea value={v.roxzone ?? ""} onChange={e => setV(p => ({ ...p, roxzone: e.target.value || null }))} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Mot du coach</label>
          <textarea value={v.coach_note ?? ""} onChange={e => setV(p => ({ ...p, coach_note: e.target.value || null }))} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
        </div>
        {warnings.length > 0 && (
          <div style={{ background: C.oS, borderRadius: 4, padding: "8px 10px", marginBottom: 10 }}>
            {warnings.map(w => <div key={w} style={{ fontSize: 11, color: C.o }}>{w}</div>)}
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
          {validated && (
            <Btn disabled={busy} onClick={() => validate.mutate({ analysis_id: analysis.id, axes: v, validated: false })}>Retirer la validation</Btn>
          )}
          <Btn disabled={busy || !v.principal1.label.trim()} onClick={() => validate.mutate({ analysis_id: analysis.id, axes: v, validated: false })}>
            Enregistrer sans montrer
          </Btn>
          <Btn primary disabled={busy || !v.principal1.label.trim()} onClick={() => saveDraftNow().then(() => validate.mutate({ analysis_id: analysis.id, axes: v, validated: true })).catch(() => { /* toast déjà affiché */ })}>
            {validated ? "Mettre à jour" : "Valider et montrer à l'athlète"}
          </Btn>
        </div>
      </Card>
    </>
  );
}

export function AxesReadOnly({ axes }: { axes: ValidatedAxes }) {
  const Block = ({ title, children, color }: { title: string; children: ReactNode; color?: string }) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: color ?? C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: 13, color: C.tx2, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
  return (
    <>
      <SectionTitle>Mes axes de travail</SectionTitle>
      <Card>
        <Block title="Axe principal 1" color={C.ac}><b style={{ color: C.tx }}>{axes.principal1.label}</b>{axes.principal1.detail ? <div>{axes.principal1.detail}</div> : null}</Block>
        {axes.principal2.label && <Block title="Axe principal 2" color={C.ac}><b style={{ color: C.tx }}>{axes.principal2.label}</b>{axes.principal2.detail ? <div>{axes.principal2.detail}</div> : null}</Block>}
        {axes.appoint.length > 0 && <Block title="En appoint">{axes.appoint.map(x => <div key={x}>• {x}</div>)}</Block>}
        {axes.maintenance.length > 0 && <Block title="En entretien">{axes.maintenance.join(", ")}</Block>}
        {axes.safety.length > 0 && <Block title="À surveiller" color={C.o}>{axes.safety.map(x => <div key={x}>• {x}</div>)}</Block>}
        {axes.roxzone && <Block title="Roxzone">{axes.roxzone}</Block>}
        {axes.block.length > 0 && <Block title="Le bloc">{axes.block.join(" ")}</Block>}
        {axes.coach_note && <Block title="Le mot de ton coach">{axes.coach_note}</Block>}
      </Card>
    </>
  );
}
