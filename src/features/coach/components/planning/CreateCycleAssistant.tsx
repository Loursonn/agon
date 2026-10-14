import { useState, useMemo } from "react";
import { parseISO, addDays, format, differenceInWeeks } from "date-fns";
import { fr } from "date-fns/locale";
import { X, Check } from "lucide-react";
import { C } from "@/lib/theme";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { snapMonday, snapSunday, buildMicrocycles } from "./utils/planningHelpers";
import { SKEYS, sLoadCycle, sSaveCycle } from "@/lib/storage";
import type { Session, ExosMap } from "@/features/shared/types/athlete";
import { localISO } from "@/lib/date";

// ── Types ───────────────────────────────────────────────────────────────────

export interface ParentMesoOption {
  id:    string;
  label: string;
}

interface Props {
  athleteId:     string;
  coachId:       string;
  parentMesoId:  string;
  parentOptions: ParentMesoOption[];
  defaultStart:  string;
  defaultEnd:    string;
  onClose:       () => void;
}

interface CandidateSession {
  sessionId:   string;
  name:        string;
  short:       string;
  dayOfWeek:   number | null;
  weekDays?:   Record<string, number>;
  recurrence?: "weekly" | "once";
  exoCount:    number;
}

interface Selection {
  take:     boolean;
  withExos: boolean;
}

// ── Hook: contenu (séances + exos) du dernier cycle de l'athlète ──────────────
// Source = stockage PAR CYCLE (asp:sessions::<id> / asp:exos::<id>), fiable et
// indépendant du cycle actuellement ouvert. Plus de dépendance au blob global.

interface LastCycleData {
  cycleName:   string | null;
  cycleId:     string | null;
  sessions:    Session[];
  exos:        ExosMap;
}

function useLastCycleData(athleteId: string) {
  return useQuery({
    queryKey: ["assistant-last-cycle", athleteId],
    enabled:  !!athleteId,
    staleTime: 30_000,
    queryFn: async (): Promise<LastCycleData> => {
      // Tous les cycles de l'athlète : chaîne macro → méso → cycle + standalone.
      const { data: macros } = await supabase
        .from("macrocycles").select("id").eq("athlete_id", athleteId);
      const macroIds = (macros ?? []).map((m) => m.id);

      let mesoIds: string[] = [];
      if (macroIds.length > 0) {
        const { data: mesos } = await supabase
          .from("mesocycles").select("id").in("macrocycle_id", macroIds);
        mesoIds = (mesos ?? []).map((m) => m.id);
      }

      type CycleRow = { id: string; name: string; start_date: string };
      const cycleMap = new Map<string, CycleRow>();

      if (mesoIds.length > 0) {
        const { data: linked } = await supabase
          .from("cycles").select("id, name, start_date").in("mesocycle_id", mesoIds);
        for (const c of (linked ?? []) as CycleRow[]) cycleMap.set(c.id, c);
      }
      const { data: standalone } = await supabase
        .from("cycles").select("id, name, start_date").eq("athlete_id", athleteId);
      for (const c of (standalone ?? []) as CycleRow[]) cycleMap.set(c.id, c);

      // Le cycle le plus récent (par date de début) = celui à reprendre.
      const last = Array.from(cycleMap.values())
        .sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
      if (!last) return { cycleName: null, cycleId: null, sessions: [], exos: {} };

      // Séances + exos stockés pour CE cycle (clés scopées).
      const [sessions, exos] = await Promise.all([
        sLoadCycle<Session[]>(SKEYS.sessions, last.id, [], athleteId),
        sLoadCycle<ExosMap>(SKEYS.exos, last.id, {}, athleteId),
      ]);

      return {
        cycleName: last.name,
        cycleId:   last.id,
        sessions:  Array.isArray(sessions) ? sessions : [],
        exos:      exos && typeof exos === "object" ? exos : {},
      };
    },
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CreateCycleAssistant({
  athleteId, coachId, parentMesoId, parentOptions, defaultStart, defaultEnd, onClose,
}: Props) {
  const qc = useQueryClient();
  const { setBlockConfig, setOpenCycleId } = useAthleteContext();
  const { data, isLoading } = useLastCycleData(athleteId);

  const lastCycleName = data?.cycleName ?? null;
  const sourceExos    = useMemo(() => data?.exos ?? {}, [data]);

  // Candidats = séances du dernier cycle, avec leur nombre d'exos réel.
  const candidates = useMemo<CandidateSession[]>(() => {
    const sessions = data?.sessions ?? [];
    return sessions.map((s) => ({
      sessionId:  s.id,
      name:       s.name ?? "Séance",
      short:      s.short ?? (s.name ?? "S").slice(0, 3).toUpperCase(),
      dayOfWeek:  s.day_of_week ?? null,
      weekDays:   s.weekDays,
      recurrence: s.recurrence,
      exoCount:   (sourceExos[s.id] ?? []).length,
    }));
  }, [data, sourceExos]);

  const [name,      setName]      = useState("");
  const [parentId,  setParentId]  = useState(parentMesoId);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate,   setEndDate]   = useState(defaultEnd);
  const [saving,    setSaving]    = useState(false);

  // sessionId → { take, withExos }
  const [sel, setSel] = useState<Record<string, Selection>>({});

  const getSel = (id: string): Selection => sel[id] ?? { take: false, withExos: true };

  const numWeeks = useMemo(() => {
    try { return Math.max(1, differenceInWeeks(parseISO(endDate), parseISO(startDate)) + 1); }
    catch { return 1; }
  }, [startDate, endDate]);

  const takenCount = candidates.filter((c) => getSel(c.sessionId).take).length;

  function setAll(take: boolean, withExos: boolean) {
    const next: Record<string, Selection> = {};
    for (const c of candidates) next[c.sessionId] = { take, withExos };
    setSel(next);
  }

  function toggleTake(id: string) {
    setSel((p) => ({ ...p, [id]: { ...getSel(id), take: !getSel(id).take } }));
  }
  function setWithExos(id: string, withExos: boolean) {
    setSel((p) => ({ ...p, [id]: { take: true, withExos } }));
  }

  async function handleCreate() {
    const snStart = snapMonday(startDate);
    const snEnd   = snapSunday(endDate);
    if (!name.trim())          { toast.error("Donne un nom au cycle"); return; }
    if (!parentId)             { toast.error("Choisis un mésocycle parent"); return; }
    if (snStart >= snEnd)      { toast.error("Dates invalides"); return; }

    setSaving(true);
    try {
      // 1. Cycle
      const { data: cycle, error: cycleErr } = await supabase
        .from("cycles")
        .insert({
          mesocycle_id: parentId,
          athlete_id:   athleteId,
          coach_id:     coachId,
          name:         name.trim(),
          start_date:   snStart,
          end_date:     snEnd,
        })
        .select("id")
        .single();
      if (cycleErr || !cycle) throw cycleErr ?? new Error("Création du cycle échouée");

      // 2. Microcycles (1 par semaine ISO)
      const microRows = buildMicrocycles(cycle.id, snStart, snEnd);
      const { data: micros, error: microErr } = await supabase
        .from("microcycles")
        .insert(microRows)
        .select("id, start_date");
      if (microErr) throw microErr;

      // 3. Séances reprises (clonées avec de nouveaux IDs) + workout_logs "planned"
      const chosen = candidates.filter((c) => getSel(c.sessionId).take);

      const newSessions: Session[] = [];
      const newExos: ExosMap = {};
      const workoutLogs: Record<string, unknown>[] = [];

      chosen.forEach((c, i) => {
        const newId = `s_${Date.now()}_${i}`;
        newSessions.push({
          id:          newId,
          name:        c.name,
          short:       c.short,
          day_of_week: c.dayOfWeek ?? undefined,
          weekDays:    c.weekDays,
          recurrence:  c.recurrence,
        });
        // Clone des exos depuis le cycle source (stockage par cycle).
        newExos[newId] = getSel(c.sessionId).withExos
          ? structuredClone(sourceExos[c.sessionId] ?? [])
          : [];

        for (const micro of micros ?? []) {
          const weekMonday = parseISO(micro.start_date);
          const sessionDate = addDays(weekMonday, c.dayOfWeek ?? 0);
          workoutLogs.push({
            athlete_id:     athleteId,
            coach_id:       coachId,
            session_id:     newId,
            session_name:   c.name,
            scheduled_date: localISO(sessionDate),
            status:         "planned",
            microcycle_id:  micro.id,
          });
        }
      });

      // 4. Persiste les séances + exos SOUS LA CLÉ DU NOUVEAU CYCLE (par cycle).
      //    Plus aucun écrasement du cycle précédent : chaque cycle garde son contenu.
      await Promise.all([
        sSaveCycle(SKEYS.sessions,  cycle.id, newSessions, athleteId),
        sSaveCycle(SKEYS.exos,      cycle.id, newExos,     athleteId),
        sSaveCycle(SKEYS.completed, cycle.id, {},          athleteId),
      ]);

      // 5. Cale le bloc legacy sur le nouveau cycle puis l'ouvre (recharge exos/séances).
      setBlockConfig((prev) => ({
        ...prev,
        cycleId:    cycle.id,
        blockName:  name.trim(),
        startDate:  snStart,
        totalWeeks: microRows.length || 1,
        deloadWeek: 0,
      }));
      setOpenCycleId(cycle.id);

      if (workoutLogs.length > 0) {
        const { error: logsErr } = await supabase
          .from("workout_logs")
          .upsert(workoutLogs as never, { onConflict: "athlete_id,session_id,scheduled_date" });
        if (logsErr) throw logsErr;
      }

      toast.success(
        chosen.length > 0
          ? `Cycle créé · ${chosen.length} séance${chosen.length > 1 ? "s" : ""} reprise${chosen.length > 1 ? "s" : ""}`
          : "Cycle vide créé",
      );
      qc.invalidateQueries({ queryKey: ["timeline-data",    athleteId] });
      qc.invalidateQueries({ queryKey: ["planning-summary", athleteId] });
      qc.invalidateQueries({ queryKey: ["cycle-sessions",   athleteId] });
      qc.invalidateQueries({ queryKey: ["active-cycle",     athleteId] });
      qc.invalidateQueries({ queryKey: ["athlete-cycles",   athleteId] });
      qc.invalidateQueries({ queryKey: ["athlete-cycles-list", athleteId] });
      qc.invalidateQueries({ queryKey: ["workout-logs-week", athleteId] });
      qc.invalidateQueries({ queryKey: ["calendar-events",  athleteId] });
      qc.invalidateQueries({ queryKey: ["cal",              athleteId] });
      qc.invalidateQueries({ queryKey: ["activePlan",       athleteId] });
      qc.invalidateQueries({ queryKey: ["assistant-last-cycle", athleteId] });
      onClose();
    } catch (err) {
      toast.error("Erreur : " + ((err as Error)?.message ?? "création impossible"));
    } finally {
      setSaving(false);
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 9, color: C.tx3, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4,
  };
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 4,
    border: "1px solid " + C.brdL, background: C.s2,
    color: C.tx, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box",
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.6)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", zIndex: 61,
        transform: "translate(-50%, -50%)",
        width: 460, maxWidth: "94vw", maxHeight: "88vh",
        display: "flex", flexDirection: "column",
        background: C.s1, borderRadius: 6, border: "1px solid " + C.brd,
        animation: "fadeScaleIn 150ms ease-out",
      }}>
        <style>{`@keyframes fadeScaleIn { from { opacity:0; transform:translate(-50%,-50%) scale(0.95) } to { opacity:1; transform:translate(-50%,-50%) scale(1) } }`}</style>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 22px 14px", borderBottom: "1px solid " + C.brd }}>
          <div style={{ width: 4, height: 28, borderRadius: 3, background: C.coach, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: C.coach, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>Nouveau</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.tx }}>Cycle</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={14} />
          </button>
        </div>

        {/* Body (scroll) */}
        <div style={{ padding: "16px 22px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Infos */}
          <div>
            <div style={labelStyle}>Nom du cycle</div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Hypertrophie bloc 2" autoFocus style={inputStyle} />
          </div>

          {parentOptions.length > 0 && (
            <div>
              <div style={labelStyle}>Mésocycle parent</div>
              <select value={parentId} onChange={(e) => setParentId(e.target.value)} style={inputStyle}>
                {parentOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Début (lundi)</div>
              <input type="date" value={startDate} onChange={(e) => e.target.value && setStartDate(snapMonday(e.target.value))} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Fin (dimanche)</div>
              <input type="date" value={endDate} onChange={(e) => e.target.value && setEndDate(snapSunday(e.target.value))} style={inputStyle} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: C.tx3, marginTop: -8 }}>
            {format(parseISO(snapMonday(startDate)), "d MMM", { locale: fr })} → {format(parseISO(snapSunday(endDate)), "d MMM", { locale: fr })} · {numWeeks} sem.
          </div>

          {/* Reprise du contenu */}
          <div style={{ borderTop: "1px solid " + C.brd, paddingTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={labelStyle}>
                {lastCycleName ? `Reprendre du dernier cycle « ${lastCycleName} »` : "Contenu du cycle"}
              </span>
              {candidates.length > 0 && (
                <span style={{ fontSize: 10, color: C.tx3 }}>{takenCount}/{candidates.length}</span>
              )}
            </div>

            {isLoading ? (
              <div style={{ textAlign: "center", padding: "16px 0", color: C.tx3, fontSize: 12 }}>Chargement…</div>
            ) : candidates.length === 0 ? (
              <div style={{ fontSize: 12, color: C.tx3, fontStyle: "italic", padding: "8px 0" }}>
                Aucun cycle précédent à reprendre — le cycle sera créé vide. Tu ajouteras les séances ensuite.
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                  <button onClick={() => setAll(true, true)}  style={chipBtn(true)}>Tout reprendre (avec exos)</button>
                  <button onClick={() => setAll(true, false)} style={chipBtn(false)}>Tout reprendre (vide)</button>
                  <button onClick={() => setAll(false, true)} style={chipBtn(false)}>Aucune</button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {candidates.map((c) => {
                    const s = getSel(c.sessionId);
                    return (
                      <div key={c.sessionId} style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "9px 12px", borderRadius: 4,
                        background: s.take ? C.coachS : C.s2,
                        border: "1px solid " + (s.take ? C.coach + "40" : C.brd),
                      }}>
                        <input
                          type="checkbox" checked={s.take} onChange={() => toggleTake(c.sessionId)}
                          style={{ accentColor: C.coach, width: 16, height: 16, flexShrink: 0, cursor: "pointer" }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                          <div style={{ fontSize: 10, color: C.tx3 }}>{c.exoCount} exo{c.exoCount > 1 ? "s" : ""}</div>
                        </div>
                        {/* Toggle avec exos / vide */}
                        <div style={{ display: "flex", borderRadius: 7, overflow: "hidden", border: "1px solid " + C.brdL, opacity: s.take ? 1 : 0.4, pointerEvents: s.take ? "auto" : "none", flexShrink: 0 }}>
                          {[
                            { v: true,  l: "Avec exos" },
                            { v: false, l: "Vide" },
                          ].map(({ v, l }) => (
                            <button
                              key={l}
                              onClick={() => setWithExos(c.sessionId, v)}
                              style={{
                                padding: "5px 9px", border: "none", cursor: "pointer", fontFamily: "inherit",
                                fontSize: 10, fontWeight: 700,
                                background: s.withExos === v ? C.coach : "transparent",
                                color:      s.withExos === v ? "#fff" : C.tx3,
                              }}
                            >{l}</button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", gap: 10, padding: "14px 22px", borderTop: "1px solid " + C.brd }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px 0", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Annuler
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || !name.trim() || !parentId}
            style={{
              flex: 2, padding: "11px 0", borderRadius: 4, border: "none",
              background: C.acV, color: "#0E0C0A", fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
              opacity: (saving || !name.trim() || !parentId) ? 0.5 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <Check size={14} />{saving ? "Création…" : "Créer le cycle"}
          </button>
        </div>
      </div>
    </>
  );
}

function chipBtn(active: boolean): React.CSSProperties {
  return {
    padding: "5px 10px", borderRadius: 7, fontFamily: "inherit",
    border: "1px solid " + (active ? C.coach + "60" : C.brdL),
    background: active ? C.coachS : "transparent",
    color: active ? C.coach : C.tx3,
    fontSize: 10, fontWeight: 700, cursor: "pointer",
  };
}
