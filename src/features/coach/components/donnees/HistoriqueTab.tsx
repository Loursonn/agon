import { useMemo, useState } from "react";
import { bodyZoneLabel, levelsList } from "@/lib/bodyZones";
import { ChevronDown, ChevronRight, Copy, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useAuth } from "@/hooks/useAuth";
import { getReco } from "@/lib/wellness";
import {
  WELLNESS_ITEMS, WELLNESS_ITEM_LABEL, WELLNESS_ITEM_SHORT,
  averageScore, wellnessEntries, wellnessScore, type WellnessEntry,
} from "@shared/domain/wellness";
import { useDeleteWellnessEntry, useWellnessHistory } from "@/features/shared/hooks/useWellness";
import { useHistorique, useDeleteWorkoutLog, useCopySessionAsType, type HistoLog } from "./useHistorique";
import type { Cycle, Mesocycle, Macrocycle } from "@/features/coach/components/planning/hooks/useTimelineData";
import { localISO } from "@/lib/date";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { icon: string; color: string; label: string }> = {
  completed: { icon: "✓", color: "text-agon-succes", label: "Faite"    },
  missed:    { icon: "✗", color: "text-agon-erreur", label: "Manquée"  },
  skipped:   { icon: "⏭", color: "text-agon-tx3",    label: "Passée"   },
  planned:   { icon: "○", color: "text-agon-info",   label: "Prévue"   },
};

/** Couleur d'un en-tête d'accordéon (classes écrites en entier pour Tailwind). */
type AccTone = "accent" | "amethyste" | "alerte" | "succes" | "erreur" | "tx3";
const ACC: Record<AccTone, { text: string; open: string; badge: string }> = {
  accent:    { text: "text-agon-accent",    open: "bg-agon-accent/[0.063] border-agon-accent/25",       badge: "bg-agon-accent/[0.125] text-agon-accent" },
  amethyste: { text: "text-agon-amethyste", open: "bg-agon-amethyste/[0.063] border-agon-amethyste/25", badge: "bg-agon-amethyste/[0.125] text-agon-amethyste" },
  alerte:    { text: "text-agon-alerte",    open: "bg-agon-alerte/[0.063] border-agon-alerte/25",       badge: "bg-agon-alerte/[0.125] text-agon-alerte" },
  succes:    { text: "text-agon-succes",    open: "bg-agon-succes/[0.063] border-agon-succes/25",       badge: "bg-agon-succes/[0.125] text-agon-succes" },
  erreur:    { text: "text-agon-erreur",    open: "bg-agon-erreur/[0.063] border-agon-erreur/25",       badge: "bg-agon-erreur/[0.125] text-agon-erreur" },
  tx3:       { text: "text-agon-tx3",       open: "bg-agon-tx3/[0.063] border-agon-tx3/25",             badge: "bg-agon-tx3/[0.125] text-agon-tx3" },
};
/** Palier wellness (bon / moyen / bas / pas de score) → couleur de la charte. */
function recoTone(tone: string | null | undefined): "succes" | "alerte" | "erreur" | "tx3" {
  return tone === "good" ? "succes" : tone === "warn" ? "alerte" : tone === "bad" ? "erreur" : "tx3";
}

const ICON_BTN = "flex h-[26px] w-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[6px] border border-agon-brd-l bg-transparent";
const CANCEL_BTN = "cursor-pointer rounded-[6px] border border-agon-brd-l bg-transparent px-2 py-1 text-[10px] font-semibold text-agon-tx2";
const DELETE_BTN = "cursor-pointer rounded-[6px] border-none bg-agon-erreur-vif px-2 py-1 text-[10px] font-bold text-agon-ink";
const EMPTY_CARD = "rounded-[6px] border px-4 py-3.5 text-[12px] bg-agon-s1";
const TITLE = "mb-1 text-[16px] font-bold";
const SUBTITLE = "mb-3 text-[12px] text-agon-tx2";
const NESTED_EMPTY = "pb-1 pl-1.5 pr-0 pt-0.5 text-[11px] text-agon-tx3";
const PICK_BTN = "cursor-pointer rounded border border-agon-brd-l bg-agon-s2 px-3 py-2.5 text-left text-[13px] font-semibold text-agon-tx";

function fmtDate(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}
function fmtRange(a: string, b: string): string {
  return `${fmtDate(a)} → ${fmtDate(b)}`;
}

/** Semaines (lundi → dimanche) couvrant [start, end] */
function weeksBetween(start: string, end: string): { start: string; end: string }[] {
  const s = new Date(start + "T12:00:00");
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); // lundi
  const weeks: { start: string; end: string }[] = [];
  const cur = new Date(s);
  while (localISO(cur) <= end) {
    const wEnd = new Date(cur); wEnd.setDate(cur.getDate() + 6);
    weeks.push({ start: localISO(cur), end: localISO(wEnd) });
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

// ── Accordion header ──────────────────────────────────────────────────────────

function AccordionHeader({
  open, onToggle, level, title, subtitle, badge, tone,
}: {
  open: boolean; onToggle: () => void;
  level: "macro" | "meso" | "cycle";
  title: string; subtitle?: string; badge?: string; tone: AccTone;
}) {
  const t = ACC[tone];
  const pad = level === "macro" ? "px-3.5 py-3" : level === "meso" ? "px-3 py-2.5" : "px-3 py-[9px]";
  const fs  = level === "macro" ? "text-[14px]" : level === "meso" ? "text-[13px]" : "text-[12.5px]";
  return (
    <button
      onClick={onToggle}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded border text-left",
        pad, open ? t.open : "border-agon-brd bg-agon-s1",
      )}
    >
      {open ? <ChevronDown size={14} className={t.text} /> : <ChevronRight size={14} className="text-agon-tx3" />}
      <span className={cn("min-w-0 flex-1 truncate font-bold", fs, open ? t.text : "text-agon-tx")}>
        {title}
      </span>
      {badge && <span className={cn("shrink-0 rounded-[6px] px-2 py-0.5 text-[10px] font-bold", t.badge)}>{badge}</span>}
      {subtitle && <span className="shrink-0 text-[10px] text-agon-tx3">{subtitle}</span>}
    </button>
  );
}

// ── Log row ───────────────────────────────────────────────────────────────────

function LogRow({ log, onCopy, onDelete }: { log: HistoLog; onCopy: () => void; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const meta = STATUS_META[log.status] ?? STATUS_META.planned;
  return (
    <div className="flex items-center gap-2 rounded border border-agon-brd bg-agon-s2 px-2.5 py-[7px]">
      <span className={cn("w-4 shrink-0 text-center text-[13px] font-extrabold", meta.color)} title={meta.label}>{meta.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-semibold text-agon-tx">{log.session_name}</div>
        <div className="text-[10px] text-agon-tx3">{fmtDate(log.scheduled_date)} · {meta.label}</div>
      </div>
      {confirm ? (
        <div className="flex shrink-0 gap-1.5">
          <button onClick={() => setConfirm(false)} className={CANCEL_BTN}>Annuler</button>
          <button onClick={() => { onDelete(); setConfirm(false); }} className={DELETE_BTN}>Supprimer</button>
        </div>
      ) : (
        <div className="flex shrink-0 gap-1">
          <button onClick={onCopy} title="Copier vers Séances Type" className={cn(ICON_BTN, "text-agon-tx3")}>
            <Copy size={12} />
          </button>
          <button onClick={() => setConfirm(true)} title="Supprimer ce log" className={cn(ICON_BTN, "text-agon-erreur")}>
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Copy target dialog ────────────────────────────────────────────────────────

function CopyDialog({
  log, onPick, onClose,
}: {
  log: HistoLog;
  onPick: (targetAthleteId: string) => void;
  onClose: () => void;
}) {
  const { athletes, profile, user, canCoachSelf } = useAuth();
  const { athleteId } = useAthleteContext();

  const current = athletes.find((a) => a.id === athleteId);
  const others  = athletes.filter((a) => a.id !== athleteId && a.id !== user?.id);
  const selfAsAthlete = profile?.role === "coach_athlete" && canCoachSelf && user && user.id !== athleteId
    ? { id: user.id, full_name: (profile.full_name || "Moi") + " (moi)" }
    : null;

  return (
    <div onClick={onClose} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[360px] rounded-[6px] border border-agon-brd-l bg-agon-s1 p-[18px]">
        <div className="mb-1 text-[14px] font-extrabold text-agon-tx">Copier « {log.session_name} »</div>
        <div className="mb-3.5 text-[11px] text-agon-tx3">
          La séance sera ajoutée aux <b>Séances Type</b> de l'athlète choisi (squelette réutilisable).
        </div>
        <div className="flex max-h-[280px] flex-col gap-1.5 overflow-y-auto">
          {current && (
            <button onClick={() => onPick(current.id)} className="cursor-pointer rounded border border-agon-coach/[0.314] bg-agon-coach-doux px-3 py-2.5 text-left text-[13px] font-bold text-agon-coach">
              {current.full_name} <span className="text-[10px] font-normal text-agon-tx3">(cet athlète)</span>
            </button>
          )}
          {selfAsAthlete && (
            <button onClick={() => onPick(selfAsAthlete.id)} className={PICK_BTN}>
              {selfAsAthlete.full_name}
            </button>
          )}
          {others.map((a) => (
            <button key={a.id} onClick={() => onPick(a.id)} className={PICK_BTN}>
              {a.full_name}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="mt-3 w-full cursor-pointer rounded border border-agon-brd-l bg-transparent py-[9px] text-[12px] font-semibold text-agon-tx2">
          Annuler
        </button>
      </div>
    </div>
  );
}

// ── Cycle content (semaines + logs) ───────────────────────────────────────────

function CycleContent({
  cycle, logs, onCopy, onDelete,
}: {
  cycle: Cycle;
  logs: HistoLog[];
  onCopy: (log: HistoLog) => void;
  onDelete: (logId: string) => void;
}) {
  const weeks = weeksBetween(cycle.start_date, cycle.end_date);
  return (
    <div className="flex flex-col gap-2 pb-1 pl-[22px] pr-0 pt-2">
      {weeks.map((w, i) => {
        const wLogs = logs.filter((l) => l.scheduled_date >= w.start && l.scheduled_date <= w.end);
        if (wLogs.length === 0) return null;
        const done = wLogs.filter((l) => l.status === "completed").length;
        return (
          <div key={w.start}>
            <div className="mb-[5px] flex justify-between text-[10px] font-bold uppercase tracking-[0.4px] text-agon-tx3">
              <span>Semaine {i + 1} · {fmtRange(w.start, w.end)}</span>
              <span className={done === wLogs.length && wLogs.length > 0 ? "text-agon-succes" : "text-agon-tx3"}>{done}/{wLogs.length} faites</span>
            </div>
            <div className="flex flex-col gap-[5px]">
              {wLogs.map((l) => (
                <LogRow key={l.id} log={l} onCopy={() => onCopy(l)} onDelete={() => onDelete(l.id)} />
              ))}
            </div>
          </div>
        );
      })}
      {logs.length === 0 && (
        <div className="py-1 text-[11px] text-agon-tx3">Aucune séance sur ce cycle.</div>
      )}
    </div>
  );
}

// ── Wellness history ──────────────────────────────────────────────────────────

/** Pastille d'une note /5 (fond 9 % + texte). */
function metricChip(v?: number | null): string {
  if (v == null) return "bg-agon-tx3/[0.094] text-agon-tx3";
  return v >= 4 ? "bg-agon-succes/[0.094] text-agon-succes" : v >= 3 ? "bg-agon-alerte/[0.094] text-agon-alerte" : "bg-agon-erreur/[0.094] text-agon-erreur";
}

function fmtSleep(h: number): string {
  const min = Math.round((h % 1) * 60);
  return `${Math.floor(h)}h${min > 0 ? String(min).padStart(2, "0") : ""}`;
}

function WellnessRow({ e, onDelete, deleting }: { e: WellnessEntry; onDelete: () => void; deleting: boolean }) {
  const [confirm, setConfirm] = useState(false);
  // Score et palier : domaine wellness ; « — » si la saisie est incomplète.
  const score = wellnessScore(e);
  const reco = getReco(score);
  return (
    <div className="flex items-center gap-2.5 rounded border border-agon-brd bg-agon-s2 px-2.5 py-2">
      <div className="w-11 shrink-0 text-center">
        <div className={cn("text-[15px] font-extrabold leading-none", ACC[recoTone(reco.tone)].text)}>{score ?? "—"}</div>
        <div className="mt-0.5 text-[8px] text-agon-tx3">{score != null ? reco.label : "incomplet"}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 text-[11px] font-bold text-agon-tx">
          {new Date(e.day + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" })}
          {e.weightKg != null && <span className="font-normal text-agon-tx3"> · {e.weightKg} kg</span>}
          {e.sleep.hours != null && <span className="font-normal text-agon-tx3"> · {fmtSleep(e.sleep.hours)} sommeil</span>}
          {e.archived && <span className="font-normal text-agon-tx3"> · bloc archivé</span>}
        </div>
        <div className="flex flex-wrap gap-1">
          {WELLNESS_ITEMS.map((k) => {
            const v = e.items[k];
            return (
              <span key={k} title={WELLNESS_ITEM_LABEL[k]} className={cn("rounded-[5px] px-1.5 py-0.5 text-[9px] font-bold", metricChip(v))}>
                {WELLNESS_ITEM_SHORT[k]} {v ?? "—"}/5
              </span>
            );
          })}
        </div>
        {e.domsZones.length > 0 && (
          <div className="mt-[3px] text-[9px] text-agon-tx3">
            Zones : {levelsList(e.domsLevels).length > 0
              ? levelsList(e.domsLevels).map((z) => `${z.label} ${z.level}`).join(", ")
              : e.domsZones.map(bodyZoneLabel).join(", ")}
          </div>
        )}
        {e.injuryNote && (
          <div className="mt-1 text-[10px] leading-[1.4] text-agon-erreur">
            <span className="font-bold">Blessé / malade :</span> {e.injuryNote}
          </div>
        )}
      </div>
      {e.archived ? null : confirm ? (
        <div className="flex shrink-0 flex-col gap-1">
          <button disabled={deleting} onClick={() => { onDelete(); setConfirm(false); }} className={DELETE_BTN}>Supprimer</button>
          <button onClick={() => setConfirm(false)} className={CANCEL_BTN}>Annuler</button>
        </div>
      ) : (
        <button onClick={() => setConfirm(true)} title="Supprimer ce wellness" className={cn(ICON_BTN, "text-agon-erreur")}>
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}

function WellnessHistory() {
  const { athleteId } = useAthleteContext();
  // Historique lu par src/api/wellness (asp:wh + blocs archivés, jours ISO).
  const { data: history, isLoading, error } = useWellnessHistory(athleteId);
  // Suppression d'UN jour par RPC : ne réécrit plus tout l'historique depuis
  // la copie en mémoire du coach (qui pouvait effacer une saisie de l'athlète).
  const del = useDeleteWellnessEntry(athleteId);
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());

  // Groupé par mois, plus récent en premier
  const byMonth = useMemo(() => {
    const entries = wellnessEntries(history ?? {}).reverse();
    const m = new Map<string, WellnessEntry[]>();
    for (const e of entries) {
      const month = e.day.slice(0, 7); // yyyy-mm
      const arr = m.get(month) ?? [];
      arr.push(e);
      m.set(month, arr);
    }
    return [...m.entries()];
  }, [history]);

  const toggle = (month: string) => {
    setOpenMonths((prev) => {
      const n = new Set(prev);
      if (n.has(month)) n.delete(month); else n.add(month);
      return n;
    });
  };

  return (
    <div className="mt-6">
      <div className={TITLE}>Historique wellness</div>
      <div className={SUBTITLE}>
        Check-ins quotidiens · score global /100 + détail /5
      </div>

      {del.error && (
        <div className="mb-2 text-[11px] text-agon-erreur">{(del.error as Error).message}</div>
      )}
      {error ? (
        <div className={cn(EMPTY_CARD, "border-agon-erreur/25 text-agon-erreur")}>
          {(error as Error).message}
        </div>
      ) : isLoading ? (
        <div className="text-[12px] text-agon-tx3">Chargement…</div>
      ) : byMonth.length === 0 ? (
        <div className={cn(EMPTY_CARD, "border-agon-brd text-agon-tx3")}>
          Aucun wellness enregistré par cet athlète.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {byMonth.map(([month, entries]) => {
            const open = openMonths.has(month);
            // Moyenne des scores présents : un jour incomplet ne compte pas comme 0.
            const avg = averageScore(entries.map((e) => wellnessScore(e)));
            const label = new Date(month + "-15T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
            return (
              <div key={month} className="flex flex-col gap-[5px]">
                <AccordionHeader
                  open={open}
                  onToggle={() => toggle(month)}
                  level="cycle"
                  title={label.charAt(0).toUpperCase() + label.slice(1)}
                  subtitle={`${entries.length} jour${entries.length > 1 ? "s" : ""}`}
                  badge={`moy. ${avg ?? "—"}`}
                  tone={recoTone(getReco(avg).tone)}
                />
                {open && (
                  <div className="flex flex-col gap-[5px] pl-[22px]">
                    {entries.map((e) => (
                      <WellnessRow key={e.day} e={e} deleting={del.isPending} onDelete={() => del.mutate(e.day)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── HistoriqueTab ─────────────────────────────────────────────────────────────

export function HistoriqueTab() {
  const { athleteId } = useAthleteContext();
  const { data, isLoading } = useHistorique(athleteId);
  const del = useDeleteWorkoutLog(athleteId);
  const copy = useCopySessionAsType();

  const [openMacros, setOpenMacros] = useState<Set<string>>(new Set());
  const [openMesos, setOpenMesos]   = useState<Set<string>>(new Set());
  const [openCycles, setOpenCycles] = useState<Set<string>>(new Set());
  const [copyLog, setCopyLog] = useState<HistoLog | null>(null);

  const toggle = (set: Set<string>, setter: (v: Set<string>) => void, id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id); else n.add(id);
    setter(n);
  };

  const logsInRange = (start: string, end: string): HistoLog[] =>
    (data?.logs ?? []).filter((l) => l.scheduled_date >= start && l.scheduled_date <= end);

  // Logs hors de tout cycle
  const orphanLogs = useMemo(() => {
    const cycles = data?.cycles ?? [];
    return (data?.logs ?? []).filter(
      (l) => !cycles.some((c) => l.scheduled_date >= c.start_date && l.scheduled_date <= c.end_date),
    );
  }, [data]);
  const [orphansOpen, setOrphansOpen] = useState(false);

  const cycleStats = (c: Cycle) => {
    const logs = logsInRange(c.start_date, c.end_date);
    const done = logs.filter((l) => l.status === "completed").length;
    return `${done}/${logs.length}`;
  };

  const renderCycle = (c: Cycle) => (
    <div key={c.id} className="flex flex-col gap-1">
      <AccordionHeader
        open={openCycles.has(c.id)}
        onToggle={() => toggle(openCycles, setOpenCycles, c.id)}
        level="cycle"
        title={c.name}
        subtitle={fmtRange(c.start_date, c.end_date)}
        badge={cycleStats(c)}
        tone="alerte"
      />
      {openCycles.has(c.id) && (
        <CycleContent
          cycle={c}
          logs={logsInRange(c.start_date, c.end_date)}
          onCopy={(l) => setCopyLog(l)}
          onDelete={(id) => del.mutate(id)}
        />
      )}
    </div>
  );

  const renderMeso = (m: Mesocycle) => {
    const mesoCycles = (data?.cycles ?? []).filter((c) => c.mesocycle_id === m.id);
    return (
      <div key={m.id} className="flex flex-col gap-1">
        <AccordionHeader
          open={openMesos.has(m.id)}
          onToggle={() => toggle(openMesos, setOpenMesos, m.id)}
          level="meso"
          title={m.name}
          subtitle={fmtRange(m.start_date, m.end_date)}
          badge={`${mesoCycles.length} cycle${mesoCycles.length > 1 ? "s" : ""}`}
          tone="amethyste"
        />
        {openMesos.has(m.id) && (
          <div className="flex flex-col gap-1 pl-4">
            {mesoCycles.length === 0
              ? <div className={NESTED_EMPTY}>Aucun cycle dans ce méso.</div>
              : mesoCycles.map(renderCycle)}
          </div>
        )}
      </div>
    );
  };

  const renderMacro = (mc: Macrocycle) => {
    const macroMesos = (data?.mesos ?? []).filter((m) => m.macrocycle_id === mc.id);
    return (
      <div key={mc.id} className="flex flex-col gap-1">
        <AccordionHeader
          open={openMacros.has(mc.id)}
          onToggle={() => toggle(openMacros, setOpenMacros, mc.id)}
          level="macro"
          title={mc.name}
          subtitle={fmtRange(mc.start_date, mc.end_date)}
          badge={`${macroMesos.length} méso${macroMesos.length > 1 ? "s" : ""}`}
          tone="accent"
        />
        {openMacros.has(mc.id) && (
          <div className="flex flex-col gap-1 pl-4">
            {macroMesos.length === 0
              ? <div className={NESTED_EMPTY}>Aucun mésocycle dans ce macro.</div>
              : macroMesos.map(renderMeso)}
          </div>
        )}
      </div>
    );
  };

  const standaloneCycles = (data?.cycles ?? []).filter((c) => !c.mesocycle_id);

  return (
    <div>
      <div className={TITLE}>Historique d'entraînement</div>
      <div className={SUBTITLE}>
        Macros → mésos → cycles · séances par semaine · ✓ faite, ✗ manquée, ○ prévue
      </div>

      {isLoading ? (
        <div className="py-4 text-[12px] text-agon-tx3">Chargement…</div>
      ) : (
        <div className="mb-5 flex flex-col gap-1.5">
          {(data?.macros ?? []).length === 0 && standaloneCycles.length === 0 && (
            <div className={cn(EMPTY_CARD, "border-agon-brd text-agon-tx3")}>
              Aucune planification pour cet athlète — crée un macro/cycle dans l'onglet Planning.
            </div>
          )}

          {(data?.macros ?? []).map(renderMacro)}

          {standaloneCycles.length > 0 && (
            <>
              <div className="mb-0.5 mt-2.5 text-[10px] font-bold uppercase tracking-[0.5px] text-agon-tx3">
                Cycles indépendants
              </div>
              {standaloneCycles.map(renderCycle)}
            </>
          )}

          {orphanLogs.length > 0 && (
            <div className="mt-2.5 flex flex-col gap-1">
              <AccordionHeader
                open={orphansOpen}
                onToggle={() => setOrphansOpen(!orphansOpen)}
                level="cycle"
                title="Séances hors cycle"
                badge={String(orphanLogs.length)}
                tone="tx3"
              />
              {orphansOpen && (
                <div className="flex flex-col gap-[5px] pl-[22px]">
                  {orphanLogs.map((l) => (
                    <LogRow key={l.id} log={l} onCopy={() => setCopyLog(l)} onDelete={() => del.mutate(l.id)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <WellnessHistory />

      {copyLog && (
        <CopyDialog
          log={copyLog}
          onClose={() => setCopyLog(null)}
          onPick={(targetAthleteId) => {
            copy.mutate({ sourceAthleteId: athleteId, sessionId: copyLog.session_id, targetAthleteId });
            setCopyLog(null);
          }}
        />
      )}
    </div>
  );
}
