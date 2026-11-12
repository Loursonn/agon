import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronRight, Pencil, RefreshCw } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { C, alpha } from "@/lib/theme";
import { sportLabel } from "@/lib/activityDisplay";
import { proposeDetailLaps, recomputeLaps, type DetailLap, type DetailLapWithMetrics } from "@/lib/activityDetail";
import {
  cutLapAt, displayLapNames, fmtDayLong, lapIndexAt, lapKind, mergeWithNext, moveBoundary, setLapBounds,
  sportFamily, summarizeBlocks,
} from "@/lib/seance";
import { useActivityDetail, useSaveLaps } from "@/features/shared/hooks/useActivityDetail";
import { Skeleton } from "@/components/ui/skeleton";
import { SeanceHeader } from "./SeanceHeader";
import { SeanceKeyFigures, seanceFigures } from "./SeanceKeyFigures";
import { SeanceChartCard } from "./SeanceChartCard";
import { SeanceZoneCard } from "./SeanceZoneCard";
import { SeanceFeedbackCard } from "./SeanceFeedbackCard";
import { SeanceLapsTable } from "./SeanceLapsTable";
import { HyroxLapsTable } from "./HyroxLapsTable";
import { HyroxConfirmSheet, type ConfirmPatch } from "./HyroxConfirmSheet";
import { SeanceLapsMobile } from "./SeanceLapsMobile";
import { SeanceLapEditor } from "./SeanceLapEditor";
import { HyroxLapPanel } from "./HyroxLapPanel";
import { SeanceLapEditorMobile } from "./SeanceLapEditorMobile";
import { HyroxProposalBanner } from "./HyroxProposalBanner";
import type { LapType } from "./LapExercisePicker";
import { CARD, KICKER, MONO, buttonStyle } from "./seanceUi";

export interface SeanceViewProps {
  athleteId: string;
  activityId: string;
  role: "athlete" | "coach";
  /** Prénom de l'athlète (« Retour de Léa »), côté coach. */
  athleteFirstName?: string | null;
  back: { to: string; label: string };
  /** Saisie du test « Seuils ventilatoires (FC) ». */
  thresholdsLink: string;
}

/** Après ce délai sans courbe, on ne parle plus de synchro en cours. */
const SYNC_WINDOW_MS = 3 * 3600_000;

const sameLaps = (a: readonly DetailLap[], b: readonly DetailLap[]) =>
  a.length === b.length && a.every((l, i) => {
    const o = b[i];
    return l.startS === o.startS && l.endS === o.endS && l.name === o.name && l.exerciseId === o.exerciseId
      && l.reps === o.reps && l.loadKg === o.loadKg && l.distanceOverrideM === o.distanceOverrideM && l.status === o.status && (l.comment ?? null) === (o.comment ?? null);
  });

const stripMetrics = (l: DetailLap | DetailLapWithMetrics): DetailLap => {
  const { metrics: _m, ...rest } = l as DetailLapWithMetrics;
  return rest;
};

/** Onglet « Séance » d'une activité de montre : même écran pour l'athlète et le coach, 4 formats. */
export function SeanceView({ athleteId, activityId, role, athleteFirstName, back, thresholdsLink }: SeanceViewProps) {
  const compact = useIsMobile();
  const q = useActivityDetail(athleteId, activityId);
  const save = useSaveLaps(athleteId, activityId);
  const detail = q.data;

  const [phoneView, setPhoneView] = useState<"main" | "tours">("main");
  useEffect(() => { window.scrollTo(0, 0); }, [phoneView]);
  const [activeLap, setActiveLap] = useState<number | null>(null);
  const [zoomLap, setZoomLap] = useState<number | null>(null);
  const [openLap, setOpenLap] = useState<number | null>(null);
  const [draft, setDraft] = useState<DetailLap[] | null>(null);
  const [selected, setSelected] = useState(0);
  const [cutAtS, setCutAtS] = useState<number | null>(null);
  const [override, setOverride] = useState<DetailLap[] | null>(null);
  // « C'est bien cette séance » (téléphone, HYROX) : vérifier puis valider.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const saveTimer = useRef<number | null>(null);

  // Une nouvelle version enregistrée remplace les corrections locales.
  useEffect(() => setOverride(null), [detail?.lapsVersion]);
  useEffect(() => () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); }, []);

  // Tours affichés : enregistrés, sinon proposition d'Agon (montre ≠ séance prévue, jamais retouchés).
  const proposal = useMemo(() => {
    if (!detail || detail.lapsEdited || detail.lapsNamedFromPlan || !detail.proposalAvailable) return null;
    const p = proposeDetailLaps(detail);
    return p.length ? p : null;
  }, [detail]);
  const baseLaps: DetailLap[] = useMemo(
    () => override ?? proposal ?? (detail?.laps.map(stripMetrics) ?? []),
    [override, proposal, detail],
  );
  const shown = draft ?? baseLaps;
  const lapsM: DetailLapWithMetrics[] = useMemo(() => {
    if (!detail) return [];
    if (!draft && !override && !proposal) return detail.laps;
    return recomputeLaps(detail, shown);
  }, [detail, draft, override, proposal, shown]);
  const names = useMemo(() => displayLapNames(shown), [shown]);
  const blocks = detail?.plannedBlocks ?? null;
  const kinds = useMemo(() => shown.map((l) => lapKind(l, blocks)), [shown, blocks]);

  if (q.isLoading) return <SeanceSkeleton compact={compact} />;
  if (q.isError || !detail) {
    return (
      <Shell compact={compact}>
        <div style={{ ...CARD, padding: 20, color: C.tx2 }}>
          Impossible d’afficher cette séance. Elle a peut-être été supprimée, ou n’est plus partagée.
        </div>
      </Shell>
    );
  }

  const a = detail.activity;
  const bike = sportFamily(a.sport) === "bike";
  const hyrox = sportFamily(a.sport) === "hyrox" || !!blocks?.some((b) => b.kind === "station");
  const title = detail.link?.plannedName ?? a.title ?? sportLabel(a.sport);
  const subtitle = hyrox ? summarizeBlocks(blocks) : null;
  const zonesN = detail.bounds ? detail.bounds.bounds.length + 1 : 3;
  const hasStream = !!detail.stream && !!detail.display && detail.stream.t.length > 1;
  const hasHr = !!detail.stream?.hr?.some((v) => v != null) || (!hasStream && a.avgHr != null);
  const noGps = hasStream && !detail.stream!.lat?.some((v) => v != null);
  const noAlt = hasStream && !detail.stream!.alt?.some((v) => v != null);
  const syncing = !hasStream && (a.source === "garmin" || a.source === "coros") && Date.now() - Date.parse(a.importedAt ?? a.startedAt) < SYNC_WINDOW_MS;
  const figures = seanceFigures(detail, lapsM, kinds, { noGps: noGps && noAlt });
  const backCurrent = role === "coach" ? title : fmtDayLong(a.localDate);
  const showBanner = !draft && !!blocks?.length && shown.some((l) => l.status === "proposed");
  const review = shown.map((l, i) => (l.needsReview ? i + 1 : 0)).filter(Boolean);
  const editing = draft !== null;
  const dirty = editing && !sameLaps(draft!, baseLaps);
  const feedbackTitle = role === "athlete" ? "Ton retour" : `Retour de ${athleteFirstName || "l’athlète"}`;

  // ── Actions ──────────────────────────────────────────────────────────────
  const persist = (laps: readonly DetailLap[], after?: () => void) =>
    save.mutate({ version: detail.lapsVersion, laps: laps.map((l) => ({ ...l })) }, { onSuccess: () => after?.() });

  const validateProposal = () => persist(baseLaps.map((l) => ({ ...l, status: "validated" as const, needsReview: false })));
  const validateConfirmed = (patches: Record<number, ConfirmPatch>) =>
    persist(
      baseLaps.map((l, i) => ({ ...l, ...patches[i], status: "validated" as const, needsReview: false })),
      () => setConfirmOpen(false),
    );

  const patchLap = (i: number, patch: Partial<DetailLap>) => {
    const next = baseLaps.map((l, k) => (k === i ? { ...l, ...patch } : l));
    setOverride(next);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => persist(next), 700);
  };

  const startEdit = () => {
    setDraft(baseLaps.map((l) => ({ ...l })));
    setSelected(activeLap ?? zoomLap ?? 0);
    setCutAtS(null);
    setZoomLap(null);
  };
  const markManual = (l: DetailLap): DetailLap => ({ ...l, origin: "manual", status: "validated", needsReview: false });
  const editActions = {
    onCut: () => {
      if (!draft) return;
      const at = cutAtS ?? Math.round((draft[selected].startS + draft[selected].endS) / 2);
      const next = cutLapAt(draft, at, (h, part) => markManual(part
        ? { ...h, name: null, exerciseId: null, plannedBlockRef: null, reps: null, loadKg: null, distanceOverrideM: null, comment: null }
        : h));
      setDraft(next);
      setSelected(Math.max(0, lapIndexAt(next, at)));
    },
    onMerge: () => draft && setDraft(mergeWithNext(draft, selected).map((l, i) => (i === selected ? markManual(l) : l))),
    onRename: (name: string) => draft && setDraft(draft.map((l, i) => (i === selected ? markManual({ ...l, name: name || null }) : l))),
    onResetWatch: () => {
      if (!window.confirm("Revenir aux tours de la montre ? Tous les changements faits sur les tours seront annulés.")) return;
      save.mutate({ version: detail.lapsVersion, reset: "watch" }, { onSuccess: () => setDraft(null) });
    },
    onResetProposal: blocks?.length && detail.stream ? () => setDraft(proposeDetailLaps(detail)) : undefined,
    onCancel: () => { setDraft(null); setCutAtS(null); },
    onSave: () => draft && persist(draft.map((l) => ({ ...l, status: "validated" as const, needsReview: false })), () => setDraft(null)),
    onSetBounds: (s: number, e: number) => draft && setDraft(setLapBounds(draft, selected, s, e)),
    onCutAtChange: (s: number) => {
      if (!draft) return;
      const t = Math.max(draft[0].startS + 1, Math.min(draft[draft.length - 1].endS - 1, s));
      setCutAtS(t);
      setSelected(Math.max(0, lapIndexAt(draft, t)));
    },
    onApplyExercise: (name: string, exerciseId: string | null, _type: LapType) =>
      draft && setDraft(draft.map((l, i) => (i === selected ? markManual({ ...l, name, exerciseId }) : l))),
  };

  const chartCard = (opts: { editing: boolean; children?: ReactNode }) =>
    hasStream ? (
      <SeanceChartCard
        stream={detail.stream!}
        display={detail.display!}
        laps={lapsM}
        names={names}
        blocks={blocks}
        bounds={detail.bounds?.bounds ?? null}
        activeLap={opts.editing ? selected : activeLap ?? zoomLap}
        zoomLap={opts.editing ? null : zoomLap}
        onLapClick={(i) => { setActiveLap(i); setZoomLap(i); }}
        onExitZoom={() => { setZoomLap(null); setActiveLap(null); }}
        compact={compact}
        stationIcons={hyrox}
        speed={bike}
        editing={opts.editing}
        cutAtS={cutAtS}
        onPickTime={(t) => { setCutAtS(t); setSelected(Math.max(0, lapIndexAt(shown, t))); }}
        onMoveBoundary={(i, t) => draft && setDraft(moveBoundary(draft, i, t))}
      >
        {opts.children}
      </SeanceChartCard>
    ) : null;

  const statusBanner = !hasStream ? (
    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 14px", borderRadius: 12, background: alpha(C.b, 0.08), border: `1px solid ${alpha(C.b, 0.3)}`, fontSize: 13 }}>
      {syncing && <RefreshCw size={15} color={C.b} />}
      <span style={{ flex: 1, color: C.tx }}>
        {syncing
          ? `Synchro ${detail.attribution.split(" ")[0]} en cours… les courbes arrivent dans quelques minutes.`
          : "Pas de courbe seconde par seconde pour cette activité : seul le résumé est disponible."}
      </span>
    </div>
  ) : noGps ? (
    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 14px", borderRadius: 12, border: `1px solid ${C.brd}`, fontSize: 12.5, color: C.tx2 }}>
      <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.1em", color: C.tx, whiteSpace: "nowrap" }}>{noAlt ? "Tapis · sans GPS" : "Sans GPS"}</span>
      <span>{noAlt ? "Pas d’altitude ni de dénivelé · distance donnée par la montre" : "Pas de position · distance donnée par la montre"}</span>
    </div>
  ) : null;

  const zoneCard = (
    <SeanceZoneCard
      zones={detail.zones}
      bounds={detail.bounds?.bounds ?? null}
      hasHr={hasHr}
      thresholdsLink={thresholdsLink}
      thresholdsLabel={role === "athlete" ? "Mes seuils et zones" : "Définir les seuils"}
      totalS={detail.total?.durationS ?? a.durationS ?? null}
      compact={compact}
    />
  );
  const feedback = detail.link ? (
    <SeanceFeedbackCard title={feedbackTitle} rpe={detail.link.feedbackRpe ?? null} comment={detail.link.feedbackComment ?? null} />
  ) : null;
  const banner = showBanner ? (
    <HyroxProposalBanner
      watchLapCount={detail.watchLaps.length}
      proposedCount={shown.length}
      review={review}
      namedOnly={detail.lapsNamedFromPlan}
      summary={describeKinds(kinds, names)}
      onAdjust={() => { startEdit(); if (compact) setPhoneView("tours"); }}
      onValidate={compact && hyrox ? () => setConfirmOpen(true) : validateProposal}
      saving={save.isPending}
      compact={compact}
    />
  ) : null;

  // ── Téléphone ────────────────────────────────────────────────────────────
  if (compact) {
    if (editing) {
      return (
        <SeanceLapEditorMobile
          {...editActions}
          speed={bike}
          hyrox={hyrox}
          laps={lapsM}
          names={names}
          selected={selected}
          onSelect={(i) => { setSelected(i); setCutAtS(null); }}
          cutAtS={cutAtS}
          saving={save.isPending}
          dirty={dirty}
          zonesN={zonesN}
          chart={chartCard({ editing: true })}
        />
      );
    }
    if (phoneView === "tours") {
      return (
        <Shell compact>
          <button type="button" onClick={() => setPhoneView("main")} style={{ ...buttonStyle(), border: "none", padding: 0, height: 24, justifyContent: "flex-start", color: C.tx3 }}>
            ‹ {title}
          </button>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            <h1 style={{ margin: 0, fontFamily: "var(--agon-font-display)", fontStretch: "125%", textTransform: "uppercase", fontWeight: 300, fontSize: 20, letterSpacing: "0.05em" }}>
              Détail des tours
            </h1>
            {hasStream && <button type="button" style={buttonStyle()} onClick={startEdit}><Pencil size={14} />{hyrox ? "Ajuster" : "Modifier"}</button>}
          </div>
          <div style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{shown.length} tours · {detail.attribution}</div>
          {hyrox && <div style={{ fontSize: 12, color: C.tx2 }}>Touche une station pour corriger les reps, la distance ou la charge.</div>}
          <SeanceLapsMobile
            laps={lapsM} names={names} kinds={kinds} blocks={blocks} hyrox={hyrox} zonesN={zonesN} speed={bike}
            open={openLap}
            onOpen={(i) => { setOpenLap(i); setActiveLap(i); setZoomLap(i); }}
            onPatch={hyrox ? patchLap : undefined}
          />
          {!hyrox && <div style={{ fontSize: 11.5, color: C.tx3 }}>Touche un tour pour l’ouvrir. Le graphique de la séance zoome alors sur ce tour.</div>}
        </Shell>
      );
    }
    return (
      <Shell compact>
        <SeanceHeader detail={detail} title={title} subtitle={subtitle} back={{ ...back, current: backCurrent.split(" ").slice(0, 2).join(" ") }} compact />
        {banner}
        {statusBanner}
        <SeanceKeyFigures figures={figures} compact />
        {hasStream && (
          <>
            <div style={KICKER}>Graphique de la séance</div>
            {chartCard({ editing: false })}
          </>
        )}
        {zoneCard}
        {feedback}
        {confirmOpen && (
          <HyroxConfirmSheet
            laps={lapsM}
            names={names}
            kinds={kinds}
            blocks={blocks}
            device="montre"
            saving={save.isPending}
            onClose={() => setConfirmOpen(false)}
            onValidate={validateConfirmed}
          />
        )}
        {shown.length > 0 && (
          <button
            type="button"
            onClick={() => setPhoneView("tours")}
            style={{ ...CARD, display: "flex", alignItems: "center", gap: 10, padding: "14px", color: C.tx, textAlign: "left", fontFamily: "inherit", cursor: "pointer", width: "100%" }}
          >
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 500 }}>Détail des tours</span>
              <span style={{ fontSize: 12, color: C.tx2 }}>
                {shown.length} tours · {hyrox ? "prévu / réalisé, charges" : "allure, FC, cadence par tour"}
              </span>
            </span>
            <span style={{ fontSize: 12.5, color: C.ac }}>Voir</span>
            <ChevronRight size={16} color={C.ac} />
          </button>
        )}
      </Shell>
    );
  }

  // ── Ordinateur ───────────────────────────────────────────────────────────
  return (
    <Shell compact={false}>
      <SeanceHeader detail={detail} title={title} subtitle={subtitle} back={{ ...back, current: backCurrent }} compact={false} />
      {banner}
      {statusBanner}

      {!editing && (
        <>
          <SectionTitle n="01" title="Chiffres clés" />
          <SeanceKeyFigures figures={figures} compact={false} />
        </>
      )}

      {hasStream && (
        <>
          {!editing && (
            <SectionTitle
              n="02"
              title={zoomLap !== null ? `${bike ? "Vitesse" : "Allure"} et FC · zoom sur le tour ${zoomLap + 1}` : hyrox ? "Allure et FC · picto au-dessus de chaque station" : `${bike ? "Vitesse" : "Allure"} ${noAlt ? "et FC" : ", FC et altitude"}`.replace(" ,", ",")}
              right="Clique sur un tour pour zoomer"
            />
          )}
          {chartCard({
            editing,
            children: editing ? (
              <SeanceLapEditor
                {...editActions}
                hyrox={hyrox}
                laps={shown}
                names={names}
                selected={selected}
                cutAtS={cutAtS}
                saving={save.isPending}
                watchLapCount={detail.watchLaps.length}
                dirty={dirty}
              />
            ) : undefined,
          })}
        </>
      )}

      {!editing && (
        <div style={{ display: "grid", gridTemplateColumns: feedback ? "1.4fr 1fr" : "1fr", gap: 14 }}>
          {zoneCard}
          {feedback}
        </div>
      )}

      {shown.length > 0 && (
        <>
          <SectionTitle
            n="03"
            title={editing ? `Tours · le tour ${selected + 1} est sélectionné` : "Tours"}
            right={!editing && hasStream ? (
              <button type="button" style={buttonStyle()} onClick={startEdit}><Pencil size={14} />{hyrox ? "Ajuster les tours" : "Modifier les tours"}</button>
            ) : undefined}
          />
          <div style={{ display: "grid", gridTemplateColumns: editing && hyrox ? "minmax(0, 1fr) 340px" : "1fr", gap: 14, alignItems: "start" }}>
            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: hyrox ? 900 : 960 }}>
                {hyrox ? (
                  <HyroxLapsTable
                    laps={lapsM} names={names} kinds={kinds} blocks={blocks} zonesN={zonesN}
                    active={editing ? selected : activeLap}
                    onSelect={(i) => (editing ? setSelected(i) : (setActiveLap(i), setZoomLap(i)))}
                    onPatch={editing ? undefined : patchLap}
                  />
                ) : (
                  <SeanceLapsTable
                    laps={lapsM} names={names} total={detail.total} zonesN={zonesN} speed={bike}
                    active={editing ? selected : activeLap}
                    onSelect={(i) => (editing ? setSelected(i) : (setActiveLap(i), setZoomLap(i)))}
                  />
                )}
              </div>
            </div>
            {editing && hyrox && shown[selected] && (
              <HyroxLapPanel
                lap={shown[selected]}
                name={names[selected]}
                index={selected}
                onApply={editActions.onApplyExercise}
                onResetProposal={editActions.onResetProposal}
                onResetWatch={editActions.onResetWatch}
              />
            )}
          </div>
          {hyrox && !editing && (
            <div style={{ fontSize: 11.5, color: C.tx3 }}>Réalisé et charge se corrigent directement dans le tableau.</div>
          )}
        </>
      )}
    </Shell>
  );
}

/** « 4 × course, sled push, wall balls » : nature des tours proposés. */
function describeKinds(kinds: readonly string[], names: string[]): string | null {
  const runs = kinds.filter((k) => k === "run").length;
  const stationNames = [...new Set(names.filter((_, i) => kinds[i] === "station").map((n) => n.replace(/\s+\d+$/, "").toLowerCase()))];
  if (!runs && !stationNames.length) return null;
  return [runs ? `${runs} × course` : null, ...stationNames].filter(Boolean).join(", ");
}

function SectionTitle({ n, title, right }: { n: string; title: string; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
      <span style={KICKER}><span style={{ color: C.ac }}>{n} —</span> {title}</span>
      {typeof right === "string" ? <span style={{ fontSize: 12, color: C.tx3 }}>{right}</span> : right}
    </div>
  );
}

function Shell({ compact, children }: { compact: boolean; children: ReactNode }) {
  return (
    <div style={{ maxWidth: compact ? undefined : 1240, margin: "0 auto", padding: compact ? "14px 16px 110px" : "20px 28px 80px", display: "flex", flexDirection: "column", gap: compact ? 14 : 16, color: C.tx }}>
      {children}
    </div>
  );
}

function SeanceSkeleton({ compact }: { compact: boolean }) {
  const s = { background: C.s1, borderRadius: 14 };
  return (
    <Shell compact={compact}>
      <Skeleton style={{ ...s, height: 20, width: 200 }} />
      <Skeleton style={{ ...s, height: compact ? 110 : 120 }} />
      <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr 1fr" : "repeat(7, 1fr)", gap: 10 }}>
        {Array.from({ length: compact ? 4 : 7 }, (_, i) => <Skeleton key={i} style={{ ...s, height: 70 }} />)}
      </div>
      <Skeleton style={{ ...s, height: compact ? 260 : 360 }} />
      <Skeleton style={{ ...s, height: 140 }} />
    </Shell>
  );
}
