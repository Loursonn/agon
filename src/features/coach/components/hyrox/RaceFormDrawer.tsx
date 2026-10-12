import { useState, useMemo } from "react";
import { C } from "@/lib/theme";
import { X, ClipboardPaste } from "lucide-react";
import { parseMmSs, formatMmSs } from "@/lib/time";
import { parseResultText } from "@/lib/hyrox/parseResultText";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useAuth } from "@/hooks/useAuth";
import { useCreateHyroxResult, useUpdateHyroxResult } from "@/features/shared/hooks/hyrox/useHyroxResults";
import {
  RACE_ORDER, STATION_KEYS, DIVISION_LABEL,
  FORMAT_LABEL, SEGMENT_LABEL,
  type HyroxResult, type HyroxDivision, type HyroxFormat, type HyroxStatus,
} from "@/features/shared/types/hyrox";
import { toast } from "sonner";

interface Props {
  race?: HyroxResult | null;
  onClose: () => void;
}

const DIVISION_OPTIONS = Object.entries(DIVISION_LABEL) as [HyroxDivision, string][];
const FORMAT_OPTIONS = Object.entries(FORMAT_LABEL) as [HyroxFormat, string][];
const STATUS_OPTIONS: [HyroxStatus, string][] = [
  ["finished", "Terminée"], ["dnf", "DNF"], ["dns", "DNS"], ["dq", "DQ"],
];

export default function RaceFormDrawer({ race, onClose }: Props) {
  const { athleteId } = useAthleteContext();
  const { user } = useAuth();
  const createMut = useCreateHyroxResult(athleteId);
  const updateMut = useUpdateHyroxResult(athleteId);
  const isEdit = !!race;

  // Form state
  const [date, setDate] = useState(race?.date ?? new Date().toISOString().slice(0, 10));
  const [eventName, setEventName] = useState(race?.event_name ?? "");
  const [venue, setVenue] = useState(race?.venue ?? "");
  const [format, setFormat] = useState<HyroxFormat>(race?.format as HyroxFormat ?? "solo");
  const [division, setDivision] = useState<HyroxDivision>(race?.division as HyroxDivision ?? "men");
  const [ageGroup, setAgeGroup] = useState(race?.age_group ?? "");
  const [isOfficial, setIsOfficial] = useState(race?.is_official ?? true);
  const [status, setStatus] = useState<HyroxStatus>(race?.status as HyroxStatus ?? "finished");
  const [totalStr, setTotalStr] = useState(race ? formatMmSs(race.total_s, { hours: true }) : "");

  // Segments stored as mm:ss strings
  const initSeg = (key: string) => {
    if (!race) return "";
    const val = (race as Record<string, unknown>)[key + "_s"] as number | null;
    return val != null ? formatMmSs(val) : "";
  };

  const [segments, setSegments] = useState<Record<string, string>>(() => {
    const s: Record<string, string> = {};
    for (const k of RACE_ORDER) s[k] = initSeg(k);
    return s;
  });

  const [roxzoneStr, setRoxzoneStr] = useState(race?.roxzone_total_s != null ? formatMmSs(race.roxzone_total_s) : "");
  const [penaltiesS, setPenaltiesS] = useState(String(race?.penalties_s ?? 0));
  const [penaltiesNote, setPenaltiesNote] = useState(race?.penalties_note ?? "");
  const [rankOverall, setRankOverall] = useState(race?.rank_overall?.toString() ?? "");
  const [rankAG, setRankAG] = useState(race?.rank_age_group?.toString() ?? "");
  const [partOverall, setPartOverall] = useState(race?.participants_overall?.toString() ?? "");
  const [partAG, setPartAG] = useState(race?.participants_age_group?.toString() ?? "");
  const [activityUrl, setActivityUrl] = useState(race?.activity_url ?? "");
  const [comment, setComment] = useState(race?.athlete_comment ?? "");

  const setSeg = (key: string, val: string) => setSegments(s => ({ ...s, [key]: val }));

  // Paste import
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [showTuto, setShowTuto] = useState(false);

  function handlePaste() {
    const parsed = parseResultText(pasteText);
    if (!parsed) { toast.error("Aucun segment reconnu dans le texte collé"); return; }

    const newSegs: Record<string, string> = { ...segments };
    for (const key of RACE_ORDER) {
      const val = parsed[(key + "_s") as keyof typeof parsed] as number | null;
      if (val != null) newSegs[key] = formatMmSs(val);
    }
    setSegments(newSegs);

    if (parsed.roxzone_total_s != null) setRoxzoneStr(formatMmSs(parsed.roxzone_total_s));
    if (parsed.total_s != null) setTotalStr(formatMmSs(parsed.total_s, { hours: true }));

    setShowPaste(false);
    setPasteText("");
    toast.success("Segments importés depuis le texte collé");
  }

  // Live totals
  const parsedTotal = parseMmSs(totalStr);
  const parsedSegments = useMemo(() => {
    const result: Record<string, number | null> = {};
    for (const k of RACE_ORDER) result[k] = parseMmSs(segments[k]);
    return result;
  }, [segments]);

  const runSum = useMemo(() => {
    const runs = RACE_ORDER.filter(k => k.startsWith("run_")).map(k => parsedSegments[k]);
    return runs.every(v => v != null) ? runs.reduce((a, b) => a! + b!, 0) : null;
  }, [parsedSegments]);

  const stationSum = useMemo(() => {
    const stats = STATION_KEYS.map(k => parsedSegments[k]);
    return stats.every(v => v != null) ? stats.reduce((a, b) => a! + b!, 0) : null;
  }, [parsedSegments]);

  const parsedRoxzone = parseMmSs(roxzoneStr);
  const segmentsSum = (runSum ?? 0) + (stationSum ?? 0) + (parsedRoxzone ?? 0);
  const ecart = parsedTotal != null && runSum != null && stationSum != null
    ? parsedTotal - segmentsSum : null;

  async function handleSave() {
    if (!date || !eventName.trim()) { toast.error("Date et nom d'événement obligatoires"); return; }
    if (parsedTotal == null || parsedTotal <= 0) { toast.error("Total invalide"); return; }

    const segFields: Record<string, number | null> = {};
    for (const k of RACE_ORDER) {
      const v = parsedSegments[k];
      if (v != null && (v <= 0 || v > 10800)) { toast.error(`${SEGMENT_LABEL[k]} : valeur invalide`); return; }
      segFields[k + "_s"] = v;
    }

    const payload = {
      athlete_id: athleteId,
      date,
      event_name: eventName.trim(),
      venue: venue.trim() || null,
      format, division, age_group: ageGroup || null,
      is_official: isOfficial, status,
      total_s: parsedTotal,
      ...segFields,
      roxzone_total_s: parsedRoxzone,
      roxzone_splits: null,
      penalties_s: parseInt(penaltiesS) || 0,
      penalties_note: penaltiesNote.trim() || null,
      rank_overall: rankOverall ? parseInt(rankOverall) : null,
      rank_age_group: rankAG ? parseInt(rankAG) : null,
      participants_overall: partOverall ? parseInt(partOverall) : null,
      participants_age_group: partAG ? parseInt(partAG) : null,
      activity_url: activityUrl.trim() || null,
      athlete_comment: comment.trim() || null,
      coach_comment: race?.coach_comment ?? null,
      competition_id: race?.competition_id ?? null,
      created_by: race?.created_by ?? user?.id ?? null,
      source: (race?.source ?? "manual") as "manual" | "import",
    };

    try {
      if (isEdit && race) {
        await updateMut.mutateAsync({ id: race.id, ...payload });
      } else {
        await createMut.mutateAsync(payload);
      }
      onClose();
    } catch {
      // toast handled by mutation
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 4,
    border: "1px solid " + C.brdL, background: C.s2, color: C.tx,
    fontSize: 13, fontFamily: "inherit", outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 10, fontWeight: 600, color: C.tx3, marginBottom: 4,
  };
  const timeInputStyle: React.CSSProperties = {
    ...inputStyle, fontFamily: "monospace", textAlign: "center" as const,
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} onClick={onClose} />
      <div style={{
        position: "relative", width: "min(460px, 100vw)", height: "100%",
        background: C.bg, borderLeft: "1px solid " + C.brd,
        overflowY: "auto", padding: "16px 20px 40px",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.tx }}>{isEdit ? "Modifier la course" : "Ajouter une course"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.tx3, cursor: "pointer" }}><X size={18} /></button>
        </div>

        {/* Event info */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div><label style={labelStyle}>Date</label><input style={inputStyle} type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><label style={labelStyle}>Événement</label><input style={inputStyle} value={eventName} onChange={e => setEventName(e.target.value)} placeholder="HYROX Bordeaux" /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div><label style={labelStyle}>Lieu</label><input style={inputStyle} value={venue} onChange={e => setVenue(e.target.value)} placeholder="Bordeaux" /></div>
          <div>
            <label style={labelStyle}>Format</label>
            <select style={{ ...inputStyle }} value={format} onChange={e => setFormat(e.target.value as HyroxFormat)}>
              {FORMAT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Division</label>
            <select style={{ ...inputStyle }} value={division} onChange={e => setDivision(e.target.value as HyroxDivision)}>
              {DIVISION_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div><label style={labelStyle}>Groupe d'âge</label><input style={inputStyle} value={ageGroup} onChange={e => setAgeGroup(e.target.value)} placeholder="30-34" /></div>
          <div>
            <label style={labelStyle}>Statut</label>
            <select style={{ ...inputStyle }} value={status} onChange={e => setStatus(e.target.value as HyroxStatus)}>
              {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 1 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.tx2, cursor: "pointer" }}>
              <input type="checkbox" checked={isOfficial} onChange={e => setIsOfficial(e.target.checked)} style={{ width: 14, height: 14 }} />
              Officielle
            </label>
          </div>
        </div>

        {/* Total */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Temps total (h:mm:ss ou mm:ss)</label>
          <input style={{ ...timeInputStyle, fontSize: 16, fontWeight: 700 }} value={totalStr} onChange={e => setTotalStr(e.target.value)} placeholder="1:24:12" />
        </div>

        {/* Paste import */}
        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setShowPaste(p => !p)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 12px", borderRadius: 4,
              border: "1px dashed " + C.brdL, background: showPaste ? C.s1 : "transparent",
              color: C.tx2, fontSize: 11, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <ClipboardPaste size={13} /> Coller les résultats (results.hyrox.com)
          </button>
          {showPaste && (
            <div style={{ marginTop: 8 }}>
              {/* Tuto video toggle */}
              <button
                type="button"
                onClick={() => setShowTuto(t => !t)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: 0, border: "none", background: "none",
                  color: C.b, fontSize: 10, fontWeight: 600, cursor: "pointer",
                  fontFamily: "inherit", marginBottom: 8,
                }}
              >
                {showTuto ? "▾" : "▸"} Comment faire ?
              </button>
              {showTuto && (
                <div style={{ marginBottom: 10, borderRadius: 6, overflow: "hidden", border: "1px solid " + C.brd }}>
                  <video
                    controls
                    playsInline
                    preload="metadata"
                    style={{ width: "100%", display: "block" }}
                    src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/public-assets/hyrox-import-tuto.mp4`}
                  />
                </div>
              )}
              <textarea
                style={{
                  width: "100%", minHeight: 120, padding: "8px 10px", borderRadius: 4,
                  border: "1px solid " + C.brdL, background: C.s2, color: C.tx,
                  fontSize: 11, fontFamily: "monospace", resize: "vertical", outline: "none",
                }}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder={"Split\tTime\tPlace\nRunning 1\t00:03:04\t–\n1000m SkiErg\t00:03:54\t52\n…"}
              />
              <button
                type="button"
                onClick={handlePaste}
                disabled={!pasteText.trim()}
                style={{
                  marginTop: 6, padding: "6px 14px", borderRadius: 4,
                  border: "none", background: C.ac, color: "#0E0C0A",
                  fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  opacity: pasteText.trim() ? 1 : 0.4,
                }}
              >
                Importer
              </button>
            </div>
          )}
        </div>

        {/* Segments in race order */}
        <div style={{ fontSize: 11, fontWeight: 700, color: C.tx2, marginBottom: 8 }}>Segments (dans l'ordre de course)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          {RACE_ORDER.map(key => (
            <div key={key}>
              <label style={labelStyle}>{SEGMENT_LABEL[key] ?? key}</label>
              <input
                style={{ ...timeInputStyle, borderColor: key.startsWith("run_") ? C.b + "40" : C.ac + "40" }}
                value={segments[key]}
                onChange={e => setSeg(key, e.target.value)}
                placeholder="m:ss"
              />
            </div>
          ))}
        </div>

        {/* Roxzone */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Roxzone totale (optionnel — déduite si vide)</label>
          <input style={timeInputStyle} value={roxzoneStr} onChange={e => setRoxzoneStr(e.target.value)} placeholder="6:42" />
        </div>

        {/* Live check */}
        {parsedTotal != null && runSum != null && stationSum != null && (
          <div style={{
            padding: "8px 12px", borderRadius: 4, marginBottom: 12,
            background: C.s1, border: "1px solid " + C.brd, fontSize: 11, color: C.tx2,
          }}>
            Course {formatMmSs(runSum)} + Stations {formatMmSs(stationSum)}
            {parsedRoxzone != null && <> + Roxzone {formatMmSs(parsedRoxzone)}</>}
            {" = "}{formatMmSs(segmentsSum)} · Total saisi {formatMmSs(parsedTotal)}
            {ecart != null && (
              <span style={{ color: Math.abs(ecart) > 60 && parsedRoxzone != null ? C.o : C.tx3, fontWeight: 600 }}>
                {" · Écart "}{ecart >= 0 ? "+" : ""}{ecart}s
                {parsedRoxzone == null && " (Roxzone déduite)"}
              </span>
            )}
          </div>
        )}

        {/* Penalties & ranks */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div><label style={labelStyle}>Pénalités (s)</label><input style={inputStyle} type="number" min={0} value={penaltiesS} onChange={e => setPenaltiesS(e.target.value)} /></div>
          <div><label style={labelStyle}>Note pénalités</label><input style={inputStyle} value={penaltiesNote} onChange={e => setPenaltiesNote(e.target.value)} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div><label style={labelStyle}>Rang overall</label><input style={inputStyle} type="number" min={1} value={rankOverall} onChange={e => setRankOverall(e.target.value)} /></div>
          <div><label style={labelStyle}>Partants</label><input style={inputStyle} type="number" min={1} value={partOverall} onChange={e => setPartOverall(e.target.value)} /></div>
          <div><label style={labelStyle}>Rang AG</label><input style={inputStyle} type="number" min={1} value={rankAG} onChange={e => setRankAG(e.target.value)} /></div>
          <div><label style={labelStyle}>Partants AG</label><input style={inputStyle} type="number" min={1} value={partAG} onChange={e => setPartAG(e.target.value)} /></div>
        </div>

        {/* Extra fields */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Lien activité</label>
          <input style={inputStyle} value={activityUrl} onChange={e => setActivityUrl(e.target.value)} placeholder="https://..." />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Commentaire</label>
          <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={comment} onChange={e => setComment(e.target.value)} />
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={createMut.isPending || updateMut.isPending}
          style={{
            width: "100%", padding: "14px 0", borderRadius: 6,
            border: "none", background: C.ac, color: "#0E0C0A",
            fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {createMut.isPending || updateMut.isPending ? "Enregistrement…" : isEdit ? "Mettre à jour" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
