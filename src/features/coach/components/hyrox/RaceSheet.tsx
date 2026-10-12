import { useState, useMemo } from "react";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { C } from "@/lib/theme";
import { formatMmSs, formatDelta } from "@/lib/time";
import {
  runTotal, stationsTotal, roxzoneTotal,
  shares, runStats, cumulative, alerts,
  stationPriorities, percentile, typology, bracketOf,
  type RefLookup,
} from "@/lib/hyrox/calc";
import { useHyroxReferences, pickRef } from "@/features/shared/hooks/hyrox/useHyroxReferences";
import { useDeleteHyroxResult } from "@/features/shared/hooks/hyrox/useHyroxResults";
import {
  DIVISION_LABEL, SEGMENT_LABEL, STATION_META, REFERENCE_DIVISION,
  RACE_ORDER, RUN_KEYS, STATION_KEYS,
  type HyroxResult, type HyroxDivision,
} from "@/features/shared/types/hyrox";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";

interface Props {
  race: HyroxResult;
  onBack: () => void;
  onEdit: (r: HyroxResult) => void;
}

const PROFILE_LABEL: Record<string, string> = {
  runner: "Runner",
  hybrid: "Hybride",
  powerhouse: "Powerhouse",
};

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      padding: "2px 7px", borderRadius: 4,
      background: color + "20", color,
      fontSize: 10, fontWeight: 700,
    }}>
      {text}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: C.tx3, letterSpacing: "0.6px",
      textTransform: "uppercase", marginBottom: 10, marginTop: 20,
    }}>
      {children}
    </div>
  );
}

function Pill({
  label, value, pct, color,
}: { label: string; value: string; pct: number | null; color: string }) {
  return (
    <div style={{
      background: C.s2, borderRadius: 6,
      border: "1px solid " + C.brd,
      padding: "10px 12px",
      display: "flex", flexDirection: "column", gap: 3,
    }}>
      <div style={{ fontSize: 10, color: C.tx3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color, fontFamily: "monospace" }}>{value}</div>
      {pct != null && (
        <div style={{ fontSize: 10, color: C.tx3 }}>{pct} %</div>
      )}
    </div>
  );
}

export default function RaceSheet({ race, onBack, onEdit }: Props) {
  const { athleteId } = useAthleteContext();
  const { data: refs = [] } = useHyroxReferences();
  const deleteMut = useDeleteHyroxResult(athleteId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Build refLookup wrapper
  const refLookup: RefLookup = useMemo(
    () => (d, s, b) => pickRef(refs, d, s, b) ?? undefined,
    [refs],
  );

  const refDiv = REFERENCE_DIVISION(race.division as HyroxDivision);
  const bracket = bracketOf(race.total_s);

  // Core calcs
  const rt = runTotal(race);
  const st = stationsTotal(race);
  const rox = roxzoneTotal(race);
  const sh = shares(race);
  const stats = runStats(race);
  const cumRows = cumulative(race);
  const alertList = alerts(race);
  const priorities = stationPriorities(race, refLookup).slice(0, 3);
  const typo = typology(sh.run, sh.stations);

  // Percentile for total
  const totalRef = pickRef(refs, refDiv, "total", bracket);
  const totalPct = totalRef ? percentile(race.total_s, totalRef) : null;

  const handleDelete = () => {
    deleteMut.mutate(race.id, { onSuccess: onBack });
  };

  // Segment color
  const segColor = (key: string): string => {
    if (RUN_KEYS.includes(key as typeof RUN_KEYS[number])) return C.b;
    if (STATION_KEYS.includes(key as typeof STATION_KEYS[number])) return C.ac;
    if (key === "roxzone_total") return C.tx3;
    return C.tx2;
  };

  const isRun = (key: string) => RUN_KEYS.includes(key as typeof RUN_KEYS[number]);
  const isStation = (key: string) => STATION_KEYS.includes(key as typeof STATION_KEYS[number]);

  return (
    <div style={{ minHeight: "100%" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        marginBottom: 16, paddingBottom: 16,
        borderBottom: "1px solid " + C.brd,
      }}>
        <button
          onClick={onBack}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 30, height: 30, borderRadius: 5,
            border: "1px solid " + C.brd, background: C.s2,
            color: C.tx3, cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
          }}
        >
          <ArrowLeft size={14} />
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: C.tx }}>{race.event_name}</span>
            {!race.is_official && <Badge text="Simulation" color={C.o} />}
            {race.penalties_s > 0 && (
              <Badge text={`+${formatMmSs(race.penalties_s)} pénalités`} color={C.r} />
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: C.tx3 }}>{race.date}</span>
            <span style={{ fontSize: 11, color: C.tx3 }}>
              {DIVISION_LABEL[race.division as HyroxDivision] ?? race.division}
            </span>
            {race.age_group && (
              <span style={{ fontSize: 11, color: C.tx3 }}>AG {race.age_group}</span>
            )}
          </div>

          {/* Total time */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{
              fontSize: 28, fontWeight: 900, color: C.tx,
              fontFamily: "monospace", lineHeight: 1,
            }}>
              {formatMmSs(race.total_s, { hours: true })}
            </span>
            {race.rank_overall != null && (
              <span style={{ fontSize: 12, color: C.tx3 }}>
                Rang {race.rank_overall}{race.participants_overall ? `/${race.participants_overall}` : ""}
              </span>
            )}
            {race.rank_age_group != null && (
              <span style={{ fontSize: 12, color: C.tx3 }}>
                AG {race.rank_age_group}{race.participants_age_group ? `/${race.participants_age_group}` : ""}
              </span>
            )}
            {totalPct != null && (
              <span style={{ fontSize: 11, color: C.tx2 }}>
                Top {totalPct} %
                {totalRef?.is_estimate && (
                  <span style={{ marginLeft: 4, fontSize: 9, color: C.o, fontWeight: 700 }}>estimé</span>
                )}
              </span>
            )}
            {totalPct == null && refs.length > 0 && (
              <span style={{ fontSize: 11, color: C.tx3 }}>réf. n.d.</span>
            )}
          </div>
        </div>
      </div>

      {/* Three metric pills */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <Pill
          label="Course"
          value={formatMmSs(rt)}
          pct={sh.run}
          color={C.b}
        />
        <Pill
          label="Stations"
          value={formatMmSs(st)}
          pct={sh.stations}
          color={C.ac}
        />
        <Pill
          label="Roxzone"
          value={formatMmSs(rox)}
          pct={sh.roxzone}
          color={C.tx3}
        />
      </div>

      {/* Cumulative table */}
      <SectionTitle>Détail par segment</SectionTitle>
      <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid " + C.brd }}>
              <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.tx3 }}>Segment</th>
              <th style={{ padding: "6px 8px", textAlign: "right", fontSize: 10, fontWeight: 700, color: C.tx3 }}>Split</th>
              <th style={{ padding: "6px 8px", textAlign: "right", fontSize: 10, fontWeight: 700, color: C.tx3 }}>Cumulé</th>
              <th style={{ padding: "6px 8px", textAlign: "right", fontSize: 10, fontWeight: 700, color: C.tx3 }}>%ile</th>
              <th style={{ padding: "6px 10px", textAlign: "right", fontSize: 10, fontWeight: 700, color: C.tx3 }}>vs médiane</th>
            </tr>
          </thead>
          <tbody>
            {cumRows.map((row, idx) => {
              const col = segColor(row.key);
              const ref = pickRef(refs, refDiv, row.key, bracket);
              const showPct = isStation(row.key) || row.key === "roxzone_total";
              const pct = showPct && row.split != null && ref
                ? percentile(row.split, ref)
                : null;
              const delta = row.split != null && ref ? row.split - ref.p50_s : null;

              return (
                <tr
                  key={row.key}
                  style={{
                    borderBottom: idx < cumRows.length - 1 ? "1px solid " + C.brd : "none",
                    background: "transparent",
                  }}
                >
                  {/* Segment label with color bar */}
                  <td style={{ padding: "6px 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{
                        width: 3, height: 14, borderRadius: 2,
                        background: col, flexShrink: 0,
                      }} />
                      <span style={{ color: C.tx2, fontSize: 11 }}>
                        {SEGMENT_LABEL[row.key] ?? row.key}
                      </span>
                    </div>
                  </td>

                  {/* Split */}
                  <td style={{
                    padding: "6px 8px", textAlign: "right",
                    fontFamily: "monospace", fontWeight: 600,
                    color: row.split != null ? col : C.tx3,
                    fontSize: 11,
                  }}>
                    {row.split != null ? formatMmSs(row.split) : "—"}
                  </td>

                  {/* Cumul */}
                  <td style={{
                    padding: "6px 8px", textAlign: "right",
                    fontFamily: "monospace", color: C.tx3, fontSize: 11,
                  }}>
                    {row.cumul != null ? formatMmSs(row.cumul, { hours: true }) : "—"}
                  </td>

                  {/* Percentile (stations + roxzone only) */}
                  <td style={{ padding: "6px 8px", textAlign: "right", fontSize: 11 }}>
                    {showPct ? (
                      pct != null ? (
                        <span style={{ color: pct <= 30 ? C.g : pct <= 60 ? C.tx2 : C.r }}>
                          {pct} %
                          {ref?.is_estimate && (
                            <span style={{ marginLeft: 3, fontSize: 9, color: C.o }}>est.</span>
                          )}
                        </span>
                      ) : (
                        <span style={{ color: C.tx3 }}>réf. n.d.</span>
                      )
                    ) : (
                      <span style={{ color: C.tx3 }}>—</span>
                    )}
                  </td>

                  {/* Delta vs médiane */}
                  <td style={{ padding: "6px 10px", textAlign: "right", fontSize: 11 }}>
                    {delta != null ? (
                      <span style={{
                        fontFamily: "monospace",
                        color: delta <= 0 ? C.g : delta < 30 ? C.tx2 : C.r,
                        fontWeight: 600,
                      }}>
                        {formatDelta(delta)}
                      </span>
                    ) : (
                      <span style={{ color: C.tx3 }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Lecture automatique */}
      <SectionTitle>Lecture automatique</SectionTitle>
      <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, padding: "12px 14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>

          {/* Best run */}
          <div style={{ background: C.s2, borderRadius: 5, padding: "8px 10px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, marginBottom: 3 }}>Meilleur run</div>
            {stats.best != null ? (
              <div style={{ fontSize: 12, color: C.g, fontFamily: "monospace", fontWeight: 700 }}>
                Run {stats.best.index + 1} — {formatMmSs(stats.best.s)}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.tx3 }}>—</div>
            )}
          </div>

          {/* Worst run */}
          <div style={{ background: C.s2, borderRadius: 5, padding: "8px 10px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, marginBottom: 3 }}>Pire run</div>
            {stats.worst != null ? (
              <div style={{ fontSize: 12, color: C.r, fontFamily: "monospace", fontWeight: 700 }}>
                Run {stats.worst.index + 1} — {formatMmSs(stats.worst.s)}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.tx3 }}>—</div>
            )}
          </div>

          {/* fade18 */}
          <div style={{ background: C.s2, borderRadius: 5, padding: "8px 10px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, marginBottom: 3 }}>Écart run 1 → 8</div>
            {stats.fade18 != null ? (
              <div style={{
                fontSize: 12, fontFamily: "monospace", fontWeight: 700,
                color: Math.abs(stats.fade18) < 30 ? C.g : stats.fade18 > 0 ? C.r : C.tx2,
              }}>
                {formatDelta(stats.fade18)}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.tx3 }}>—</div>
            )}
          </div>

          {/* drop12 */}
          <div style={{ background: C.s2, borderRadius: 5, padding: "8px 10px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, marginBottom: 3 }}>Chute run 1 → 2</div>
            {stats.drop12 != null ? (
              <div style={{
                fontSize: 12, fontFamily: "monospace", fontWeight: 700,
                color: stats.drop12 <= 30 ? C.g : stats.drop12 <= 60 ? C.o : C.r,
              }}>
                {formatDelta(stats.drop12)}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.tx3 }}>—</div>
            )}
          </div>

          {/* halvesDelta */}
          <div style={{ background: C.s2, borderRadius: 5, padding: "8px 10px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, marginBottom: 3 }}>Delta 2e moitié / run</div>
            {stats.halvesDelta != null ? (
              <div style={{
                fontSize: 12, fontFamily: "monospace", fontWeight: 700,
                color: stats.halvesDelta <= 10 ? C.g : stats.halvesDelta <= 20 ? C.o : C.r,
              }}>
                {formatDelta(stats.halvesDelta)}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.tx3 }}>—</div>
            )}
          </div>

          {/* Typology */}
          <div style={{ background: C.s2, borderRadius: 5, padding: "8px 10px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, marginBottom: 3 }}>Profil</div>
            {typo != null ? (
              <div style={{ fontSize: 12, color: C.ac, fontWeight: 700 }}>
                {PROFILE_LABEL[typo]}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.tx3 }}>—</div>
            )}
          </div>
        </div>

        {/* Alerts */}
        {alertList.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {alertList.map((a, i) => (
              <div
                key={i}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 7,
                  padding: "6px 10px", borderRadius: 5,
                  background: a.level === "warn" ? C.o + "10" : C.s2,
                  border: "1px solid " + (a.level === "warn" ? C.o + "30" : C.brd),
                }}
              >
                <div style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: a.level === "warn" ? C.o : C.tx3,
                  marginTop: 4, flexShrink: 0,
                }} />
                <span style={{
                  fontSize: 11,
                  color: a.level === "warn" ? C.o : C.tx2,
                }}>
                  {a.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Priorités */}
      {priorities.length > 0 && (
        <>
          <SectionTitle>Priorités d'amélioration</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {priorities.map((p, idx) => {
              const label = p.key === "roxzone"
                ? "Roxzone"
                : STATION_META[p.key]?.label ?? p.key;
              return (
                <div
                  key={p.key}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    background: C.s1, borderRadius: 6,
                    border: "1px solid " + C.brd,
                    padding: "10px 12px",
                  }}
                >
                  {/* Rank badge */}
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%",
                    background: idx === 0 ? C.ac + "20" : C.s2,
                    border: "1px solid " + (idx === 0 ? C.ac : C.brd),
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 800,
                    color: idx === 0 ? C.ac : C.tx3,
                    flexShrink: 0,
                  }}>
                    {idx + 1}
                  </div>

                  {/* Label + times */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>{label}</div>
                    <div style={{ fontSize: 10, color: C.tx3, marginTop: 2 }}>
                      Athlète&nbsp;
                      <span style={{ fontFamily: "monospace", color: C.tx2 }}>
                        {formatMmSs(p.athlete_s)}
                      </span>
                      &nbsp;· Médiane&nbsp;
                      <span style={{ fontFamily: "monospace", color: C.tx2 }}>
                        {formatMmSs(p.ref_s)}
                      </span>
                    </div>
                  </div>

                  {/* Gain */}
                  {p.gain_s > 0 && (
                    <div style={{
                      fontSize: 11, fontWeight: 700, color: C.g,
                      fontFamily: "monospace", flexShrink: 0,
                    }}>
                      -{formatMmSs(p.gain_s)} possible
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Comments */}
      {(race.athlete_comment || race.coach_comment) && (
        <>
          <SectionTitle>Commentaires</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {race.athlete_comment && (
              <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, padding: "10px 12px" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, marginBottom: 5 }}>Athlète</div>
                <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.5 }}>{race.athlete_comment}</div>
              </div>
            )}
            {race.coach_comment && (
              <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, padding: "10px 12px" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: C.ac, marginBottom: 5 }}>Coach</div>
                <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.5 }}>{race.coach_comment}</div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
        <button
          onClick={() => onEdit(race)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 6,
            border: "1px solid " + C.brdL, background: "transparent",
            color: C.tx2, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          <Pencil size={13} />
          Modifier
        </button>
        <button
          onClick={() => setConfirmDelete(true)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 6,
            border: "1px solid " + C.r + "40", background: "transparent",
            color: C.r, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          <Trash2 size={13} />
          Supprimer
        </button>
      </div>

      {/* Confirm delete overlay */}
      {confirmDelete && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
          zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20,
        }}>
          <div style={{
            background: C.s1, borderRadius: 8,
            border: "1px solid " + C.brd,
            padding: "24px 20px", maxWidth: 360, width: "100%",
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.tx, marginBottom: 8 }}>
              Supprimer cette course ?
            </div>
            <div style={{ fontSize: 12, color: C.tx3, marginBottom: 20, lineHeight: 1.5 }}>
              {race.event_name} — {race.date}. Cette action est irréversible.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleDelete}
                disabled={deleteMut.isPending}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 6,
                  border: "none", background: C.r,
                  color: "#fff", fontSize: 12, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit",
                  opacity: deleteMut.isPending ? 0.6 : 1,
                }}
              >
                {deleteMut.isPending ? "Suppression…" : "Supprimer"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 6,
                  border: "1px solid " + C.brdL, background: "transparent",
                  color: C.tx3, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
