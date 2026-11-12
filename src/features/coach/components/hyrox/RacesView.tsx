import { useState } from "react";
import { C } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useHyroxResults } from "@/features/shared/hooks/hyrox/useHyroxResults";
import { formatMmSs } from "@/lib/time";
import { runTotal, stationsTotal, roxzoneTotal } from "@/lib/hyrox/calc";
import { DIVISION_LABEL, FORMAT_LABEL } from "@/features/shared/types/hyrox";
import type { HyroxResult } from "@/features/shared/types/hyrox";
import RaceFormDrawer from "./RaceFormDrawer";
import RaceSheet from "./RaceSheet";
import RaceCompare from "./RaceCompare";
import { Plus, HelpCircle } from "lucide-react";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { RaceCard } from "./RaceCard";

export default function RacesView() {
  const { athleteId } = useAthleteContext();
  const { data: races = [], isLoading } = useHyroxResults(athleteId);
  const [showForm, setShowForm] = useState(false);
  const [editRace, setEditRace] = useState<HyroxResult | null>(null);
  const [selectedRace, setSelectedRace] = useState<HyroxResult | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const toggleCompare = (id: string) =>
    setCompareIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 2 ? [...prev, id] : [prev[1], id]);

  // KPI data
  const officialFinished = races.filter(r => r.is_official && r.status === "finished");
  const record = officialFinished.length > 0 ? officialFinished.reduce((a, b) => a.total_s < b.total_s ? a : b) : null;
  const latest = races[0] ?? null;
  const ecartRecord = record && latest && record.id !== latest.id
    ? latest.total_s - record.total_s : null;

  if (selectedRace) {
    return <RaceSheet race={selectedRace} onBack={() => setSelectedRace(null)} onEdit={(r) => { setEditRace(r); setShowForm(true); setSelectedRace(null); }} />;
  }

  if (comparing && compareIds.length === 2) {
    const r1 = races.find(r => r.id === compareIds[0]);
    const r2 = races.find(r => r.id === compareIds[1]);
    if (r1 && r2) return <RaceCompare raceA={r1} raceB={r2} onBack={() => { setComparing(false); setCompareIds([]); }} />;
  }

  return (
    <>
      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 16, marginBottom: 16 }}>
        <KPICard accent label="Record" value={record ? formatMmSs(record.total_s, { hours: true }) : "—"} sub={record ? `${FORMAT_LABEL[record.format as keyof typeof FORMAT_LABEL] ?? record.format} · ${record.event_name}` : ""} />
        <KPICard label="Courses" value={String(races.length)} sub={`${officialFinished.length} officielles`} />
        <KPICard label="Dernier chrono" value={latest ? formatMmSs(latest.total_s, { hours: true }) : "—"} sub={ecartRecord != null ? `+${formatMmSs(ecartRecord)} vs record` : ""} />
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <button
          onClick={() => { setEditRace(null); setShowForm(true); }}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            height: 40, padding: "0 14px", borderRadius: 10, border: "none",
            background: C.ac, color: "#0E0C0A", fontSize: 13, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          <Plus size={14} /> Ajouter une course
        </button>
        <button
          onClick={() => setShowHelp(h => !h)}
          title="Comment ajouter une course ?"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 30, height: 30, borderRadius: "50%", border: "1px solid " + C.brdL,
            background: showHelp ? C.ac + "20" : "transparent", color: showHelp ? C.ac : C.tx3,
            cursor: "pointer", padding: 0,
          }}
        >
          <HelpCircle size={16} />
        </button>
        {compareIds.length === 2 && (
          <button
            onClick={() => setComparing(true)}
            style={{
              padding: "8px 14px", borderRadius: 6, border: "1px solid " + C.brdL,
              background: "transparent", color: C.tx2, fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Comparer ({compareIds.length}) ›
          </button>
        )}
      </div>

      {/* Help panel */}
      {showHelp && (
        <div style={{
          background: C.s1, borderRadius: 6, border: "1px solid " + C.brd,
          padding: "14px 16px", marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 8 }}>Comment ajouter une course ?</div>
          <ol style={{ margin: "0 0 12px", paddingLeft: 20, fontSize: 12, color: C.tx2, lineHeight: 1.8 }}>
            <li>Va sur <strong>results.hyrox.com</strong> ou ouvre l'app <strong>ROXFIT</strong></li>
            <li>Trouve ta course dans ton profil</li>
            <li>Copie les résultats (tous les splits)</li>
            <li>Clique <strong>« Ajouter une course »</strong> ci-dessus</li>
            <li>Utilise le bouton <strong>« Coller les résultats »</strong> pour remplir automatiquement</li>
          </ol>
          <div style={{ borderRadius: 6, overflow: "hidden", border: "1px solid " + C.brd }}>
            <video
              controls
              playsInline
              preload="metadata"
              style={{ width: "100%", display: "block" }}
              src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/public-assets/hyrox-import-tuto.mp4`}
            />
          </div>
        </div>
      )}

      {/* Race list */}
      {isLoading ? (
        <div style={{ padding: 20, textAlign: "center", color: C.tx3, fontSize: 12 }}>Chargement…</div>
      ) : races.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 6 }}>Aucune course HYROX</div>
          <div style={{ fontSize: 12, color: C.tx3 }}>Ajoutez votre première course pour commencer le suivi.</div>
        </div>
      ) : (
        <>
        <div className="flex flex-col gap-2.5 sm:hidden">
          {races.map(r => (
            <RaceCard
              key={r.id}
              race={r}
              isRecord={record?.id === r.id}
              checked={compareIds.includes(r.id)}
              onToggle={() => toggleCompare(r.id)}
              onOpen={() => setSelectedRace(r)}
            />
          ))}
        </div>
        <div className="hidden sm:block" style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid " + C.brd, color: C.tx3, fontSize: 10, fontWeight: 600 }}>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>
                  <input type="checkbox" disabled style={{ visibility: "hidden", width: 14 }} />
                </th>
                <th style={{ padding: "8px 6px", textAlign: "left" }}>Date</th>
                <th style={{ padding: "8px 6px", textAlign: "left" }}>Event</th>
                <th style={{ padding: "8px 6px", textAlign: "left" }}>Division</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>Total</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>Course</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>Stations</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>Roxzone</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>Rang</th>
              </tr>
            </thead>
            <tbody>
              {races.map(r => {
                const isSelected = compareIds.includes(r.id);
                return (
                  <tr
                    key={r.id}
                    style={{
                      borderBottom: "1px solid " + C.brd,
                      cursor: "pointer",
                      background: isSelected ? C.ac + "12" : "transparent",
                    }}
                    onClick={() => setSelectedRace(r)}
                  >
                    <td style={{ padding: "8px 10px" }} onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleCompare(r.id)}
                        style={{ width: 14, height: 14, cursor: "pointer" }}
                      />
                    </td>
                    <td style={{ padding: "8px 6px", color: C.tx2 }}>{r.date}</td>
                    <td style={{ padding: "8px 6px", color: C.tx, fontWeight: 600 }}>
                      {r.event_name}
                      {!r.is_official && <Badge text="Simulation" color={C.o} />}
                    </td>
                    <td style={{ padding: "8px 6px", color: C.tx3 }}>{DIVISION_LABEL[r.division as keyof typeof DIVISION_LABEL] ?? r.division}</td>
                    <td style={{ padding: "8px 6px", textAlign: "right", color: C.tx, fontWeight: 700, fontFamily: "monospace" }}>
                      {formatMmSs(r.total_s, { hours: true })}
                    </td>
                    <td style={{ padding: "8px 6px", textAlign: "right", color: C.b, fontFamily: "monospace" }}>{formatMmSs(runTotal(r))}</td>
                    <td style={{ padding: "8px 6px", textAlign: "right", color: C.ac, fontFamily: "monospace" }}>{formatMmSs(stationsTotal(r))}</td>
                    <td style={{ padding: "8px 6px", textAlign: "right", color: C.tx3, fontFamily: "monospace" }}>{formatMmSs(roxzoneTotal(r))}</td>
                    <td style={{ padding: "8px 6px", textAlign: "right", color: C.tx2 }}>
                      {r.rank_overall ? `${r.rank_overall}/${r.participants_overall ?? "?"}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {showForm && (
        <RaceFormDrawer
          race={editRace}
          onClose={() => { setShowForm(false); setEditRace(null); }}
        />
      )}
    </>
  );
}

function KPICard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div style={{
      background: accent ? C.ac + "1F" : C.s1, borderRadius: 14, border: "1px solid " + (accent ? C.ac + "73" : C.brd),
      padding: "12px 12px", minWidth: 0,
    }}>
      <div style={{ ...MONO, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: C.tx3, marginBottom: 6 }}>{label}</div>
      <div style={{ ...MONO, fontSize: 18, color: accent ? C.ac : C.tx, whiteSpace: "nowrap" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.tx3, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>}
    </div>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      marginLeft: 6, padding: "1px 6px", borderRadius: 4,
      background: color + "20", color, fontSize: 9, fontWeight: 600,
    }}>
      {text}
    </span>
  );
}
