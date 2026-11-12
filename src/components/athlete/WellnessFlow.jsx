import { useState, useRef, useCallback, useEffect } from "react";
import { C } from "@/lib/theme";
import { ALL_BZ } from "@/lib/muscles";
import { todayKey } from "@/lib/date";
import { WELL_ITEMS, calcScore, getReco, getAlerts } from "@/lib/wellness";
import { useOptionalAthleteContext } from "@/features/shared/context/AthleteContext";
import { loadDraft, saveDraft, wellnessDraftKey } from "@/lib/localDraft";

// ── Free-point DOMS BodyMap ─────────────────────────────────────────────────
const DOMS_COLORS = ["#F5A623", "#F07030", "#FF5A33"];
function domsColor(intensity) {
  if (!intensity || intensity <= 3) return DOMS_COLORS[0];
  if (intensity <= 6) return DOMS_COLORS[1];
  return DOMS_COLORS[2];
}

const BODY_OUTLINE = (bp) => (
  <>
    <ellipse cx="50" cy="12" rx="10" ry="11" fill="none" stroke={bp} strokeWidth="1.5"/>
    <path d="M34,24 L28,28 L24,74 L76,74 L72,28 L66,24 Q60,21 50,21 Q40,21 34,24 Z" fill="none" stroke={bp} strokeWidth="1.5"/>
    <path d="M28,28 L20,32 L12,56 L9,74 L14,74 L17,56 L23,33" fill="none" stroke={bp} strokeWidth="1.5"/>
    <path d="M72,28 L80,32 L88,56 L91,74 L86,74 L83,56 L77,33" fill="none" stroke={bp} strokeWidth="1.5"/>
    <path d="M40,74 L36,110 L34,148 L41,148 L43,112 L46,74" fill="none" stroke={bp} strokeWidth="1.5"/>
    <path d="M60,74 L64,110 L66,148 L59,148 L57,112 L54,74" fill="none" stroke={bp} strokeWidth="1.5"/>
  </>
);

function DomsBodyMap({ points, onChange }) {
  const [view, setView] = useState("front");
  const [selected, setSelected] = useState(null); // selected point id for intensity edit
  const [dragging, setDragging] = useState(null);
  const svgRef = useRef(null);
  const bp = C.brdL;

  const getSvgCoords = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 160;
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  }, []);

  const handleSvgClick = useCallback((e) => {
    if (dragging) return;
    const coords = getSvgCoords(e);
    if (!coords) return;
    // Check if clicking near an existing point (within ~5 SVG units)
    const near = points.find(p => p.side === view && Math.hypot(p.x - coords.x, p.y - coords.y) < 5);
    if (near) {
      setSelected(selected === near.id ? null : near.id);
      return;
    }
    // Add new point
    const np = { id: String(Date.now()), x: coords.x, y: coords.y, side: view };
    onChange([...points, np]);
    setSelected(null);
  }, [points, view, onChange, getSvgCoords, dragging, selected]);

  const handlePointerDown = useCallback((e, id) => {
    e.stopPropagation();
    e.preventDefault();
    setDragging(id);
    e.target.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e) => {
    if (!dragging) return;
    const coords = getSvgCoords(e);
    if (!coords) return;
    onChange(points.map(p => p.id === dragging ? { ...p, x: coords.x, y: coords.y } : p));
  }, [dragging, points, onChange, getSvgCoords]);

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  const removePoint = useCallback((id) => {
    onChange(points.filter(p => p.id !== id));
    if (selected === id) setSelected(null);
  }, [points, onChange, selected]);

  const setIntensity = useCallback((id, val) => {
    onChange(points.map(p => p.id === id ? { ...p, intensity: val } : p));
  }, [points, onChange]);

  const viewPoints = points.filter(p => p.side === view);
  const selectedPt = selected ? points.find(p => p.id === selected) : null;

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {["front", "back"].map(v => (
          <button key={v} onClick={() => { setView(v); setSelected(null); }} style={{
            flex: 1, padding: "6px 0", borderRadius: 7,
            border: "1px solid " + (view === v ? C.o : C.brdL),
            background: view === v ? C.o + "20" : "transparent",
            color: view === v ? C.o : C.tx3,
            fontSize: 11, cursor: "pointer", fontFamily: "inherit",
          }}>
            {v === "front" ? "Vue avant" : "Vue arrière"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <svg
          ref={svgRef}
          viewBox="0 0 100 160"
          style={{ width: "55%", height: "auto", flexShrink: 0, touchAction: "none" }}
          onClick={handleSvgClick}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* Clickable background */}
          <rect x="0" y="0" width="100" height="160" fill="transparent" />
          {BODY_OUTLINE(bp)}

          {/* DOMS points */}
          {viewPoints.map(p => {
            const col = domsColor(p.intensity);
            const isSel = selected === p.id;
            return (
              <g key={p.id} style={{ cursor: dragging === p.id ? "grabbing" : "grab" }}>
                {/* Outer glow */}
                <circle cx={p.x} cy={p.y} r={isSel ? 6 : 4.5} fill={col + "30"} stroke={col} strokeWidth={isSel ? 1.5 : 1} />
                {/* Inner dot */}
                <circle cx={p.x} cy={p.y} r={2} fill={col} />
                {/* Drag handle (invisible larger area) */}
                <circle
                  cx={p.x} cy={p.y} r={7} fill="transparent"
                  onPointerDown={(e) => handlePointerDown(e, p.id)}
                  style={{ cursor: "grab" }}
                />
                {/* Intensity label */}
                {p.intensity && (
                  <text x={p.x} y={p.y + 1} textAnchor="middle" dominantBaseline="central"
                    style={{ fontSize: 3.5, fontWeight: 800, fill: "#fff", pointerEvents: "none" }}>
                    {p.intensity}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, color: C.tx3, marginBottom: 6 }}>
            {points.length === 0 ? "Touche le corps pour ajouter un point" : `${points.length} point${points.length > 1 ? "s" : ""}`}
          </div>

          {/* Point list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {points.map(p => {
              const col = domsColor(p.intensity);
              return (
                <div key={p.id} style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "3px 6px", borderRadius: 6,
                  background: selected === p.id ? col + "15" : "transparent",
                  border: "1px solid " + (selected === p.id ? col + "40" : "transparent"),
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: col, flexShrink: 0 }} />
                  <span style={{ fontSize: 9, color: C.tx2, flex: 1 }}>
                    {p.side === "front" ? "Av." : "Ar."}{p.intensity ? ` — ${p.intensity}/10` : ""}
                  </span>
                  <button onClick={() => { setSelected(selected === p.id ? null : p.id); setView(p.side); }} style={{
                    border: "none", background: "none", color: C.tx3, fontSize: 9, cursor: "pointer", padding: 0, fontFamily: "inherit",
                  }}></button>
                  <button onClick={() => removePoint(p.id)} style={{
                    border: "none", background: "none", color: C.r, fontSize: 9, cursor: "pointer", padding: 0, fontFamily: "inherit",
                  }}>✕</button>
                </div>
              );
            })}
          </div>

          {/* Intensity editor for selected point */}
          {selectedPt && (
            <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 4, background: C.s1, border: "1px solid " + C.brd }}>
              <div style={{ fontSize: 9, color: C.tx3, textTransform: "uppercase", marginBottom: 6 }}>Intensité douleur</div>
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => {
                  const sel = selectedPt.intensity === n;
                  const nc = domsColor(n);
                  return (
                    <button key={n} onClick={() => setIntensity(selectedPt.id, n)} style={{
                      width: 24, height: 24, borderRadius: 6,
                      border: "1.5px solid " + (sel ? nc : C.brdL),
                      background: sel ? nc + "30" : "transparent",
                      color: sel ? nc : C.tx3,
                      fontSize: 10, fontWeight: sel ? 800 : 500,
                      cursor: "pointer", fontFamily: "inherit", padding: 0,
                    }}>{n}</button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Wellness du matin (canvas 12/11 « Wellness athlète ») ───────────────────
// Écran 1 « Comment tu te sens » : nuit + 5 notes (score en direct).
// Écran 2 « Corps » : courbatures sur la carte, blessé/malade, poids.
// Puis le bilan et « Sauvegarder ». Même enregistrement et même brouillon
// local qu'avant : seule la mise en page change.

const MONO_S = { fontFamily: "var(--agon-font-data)", fontVariantNumeric: "tabular-nums" };
const DISPLAY_S = { fontFamily: "var(--agon-font-display)", fontStretch: "125%", textTransform: "uppercase", fontWeight: 400, letterSpacing: "0.04em" };
/** Échelle 1 → 5 : rouge, orange vif, orange, vert-jaune, vert (canvas). */
const SCALE5 = ["#FF3B1F", "#FF7A45", "#FF9500", "#B8F03C", "#66F03C"];
const CARD_S = { padding: "12px 14px", borderRadius: 14, background: C.s1, border: "1px solid " + C.brd };
const KICK_S = { ...MONO_S, fontSize: 11, letterSpacing: "0.10em", textTransform: "uppercase", color: C.tx2 };

/** Ancien brouillon (questions une par une, étapes 0 à 9) → nouvel écran. */
function normStep(s) {
  if (typeof s !== "number" || s <= 5) return 0;
  return s >= 9 ? 2 : 1;
}

function ScoreRing({ score, color }) {
  const r = 22, circ = 2 * Math.PI * r;
  return (
    <svg width={56} height={56} viewBox="0 0 56 56" aria-hidden style={{ flex: "none" }}>
      <circle cx={28} cy={28} r={r} fill="none" stroke={C.s2} strokeWidth={5} />
      {score != null && <circle cx={28} cy={28} r={r} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" strokeDasharray={`${(circ * score) / 100} ${circ}`} transform="rotate(-90 28 28)" />}
      <text x={28} y={33} textAnchor="middle" fill={C.tx} style={{ ...MONO_S, fontSize: 15 }}>{score ?? "—"}</text>
    </svg>
  );
}

function RatingRow({ item, index, value, onPick }) {
  return (
    <div style={{ ...CARD_S, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 14, color: C.tx }}>{item.q}</span>
        <span style={{ ...MONO_S, fontSize: 10.5, color: C.tx3 }}>{index + 1}/{WELL_ITEMS.length}</span>
      </div>
      <div role="radiogroup" aria-label={item.q} style={{ display: "flex", gap: 6 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const col = SCALE5[n - 1];
          const sel = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={sel}
              onClick={() => onPick(n)}
              style={{ flex: 1, height: 48, borderRadius: 12, ...MONO_S, fontSize: 18, cursor: "pointer", border: sel ? "none" : "1px solid " + col + "40", background: sel ? col : col + "14", color: sel ? C.bg : col }}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.tx3 }}>
        <span>{item.lo}</span><span>{item.hi}</span>
      </div>
    </div>
  );
}

function YesNo({ value, onYes, onNo, yesColor = C.r }) {
  const base = { width: 72, height: 40, borderRadius: 12, fontSize: 14, cursor: "pointer", fontFamily: "inherit" };
  return (
    <div style={{ display: "flex", gap: 8, flex: "none" }}>
      <button type="button" aria-pressed={value === true} onClick={onYes} style={{ ...base, border: value === true ? "none" : "1px solid " + yesColor + "73", background: value === true ? yesColor : yesColor + "14", color: value === true ? C.bg : yesColor }}>Oui</button>
      <button type="button" aria-pressed={value === false} onClick={onNo} style={{ ...base, border: value === false ? "none" : "1px solid " + C.brdL, background: value === false ? C.g : "transparent", color: value === false ? C.bg : C.tx2 }}>Non</button>
    </div>
  );
}

const bSm = { width: 32, height: 28, borderRadius: 8, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 15, cursor: "pointer", fontFamily: "inherit", padding: 0 };

function TimePick({ label, time, setTime }) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    <div style={{ flex: 1, padding: "9px 10px", borderRadius: 10, background: C.s2, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 10.5, color: C.tx3 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
          <button type="button" aria-label={label + " : une heure de plus"} onClick={() => setTime((t) => ({ ...t, h: (t.h + 1) % 24 }))} style={bSm}>+</button>
          <span style={{ ...MONO_S, fontSize: 20, color: C.tx }}>{pad(time.h)}</span>
          <button type="button" aria-label={label + " : une heure de moins"} onClick={() => setTime((t) => ({ ...t, h: (t.h - 1 + 24) % 24 }))} style={bSm}>−</button>
        </div>
        <span style={{ ...MONO_S, fontSize: 18, color: C.tx3 }}>:</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
          <button type="button" aria-label={label + " : 15 minutes de plus"} onClick={() => setTime((t) => ({ ...t, m: (t.m + 15) % 60 }))} style={bSm}>+</button>
          <span style={{ ...MONO_S, fontSize: 20, color: C.tx }}>{pad(time.m)}</span>
          <button type="button" aria-label={label + " : 15 minutes de moins"} onClick={() => setTime((t) => ({ ...t, m: (t.m - 15 + 60) % 60 }))} style={bSm}>−</button>
        </div>
      </div>
    </div>
  );
}

function StepHeader({ step, total, title, subtitle, onBack }) {
  const pct = Math.round((Math.min(step + 1, total) / total) * 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "18px 20px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, height: 28 }}>
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Retour" style={{ width: 28, height: 28, border: "none", background: "none", color: C.tx2, cursor: "pointer", padding: 0, fontSize: 18 }}>←</button>
        )}
        <span style={{ ...MONO_S, fontSize: 11, color: C.tx2, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {step < total ? `Wellness · ${step + 1} / ${total}` : "Wellness · bilan"}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ ...MONO_S, fontSize: 11, color: C.tx3, textTransform: "capitalize" }}>
          {new Date().toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
        </span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: C.s2, overflow: "hidden" }}>
        <div style={{ width: pct + "%", height: "100%", background: C.g, transition: "width 0.3s" }} />
      </div>
      <div>
        <h2 style={{ margin: 0, ...DISPLAY_S, fontSize: 22, color: C.tx }}>{title}</h2>
        {subtitle && <div style={{ fontSize: 12.5, color: C.tx2, marginTop: 4 }}>{subtitle}</div>}
      </div>
    </div>
  );
}

const bigBtn = (enabled, bg = C.ac) => ({ width: "100%", height: 54, borderRadius: 14, border: "none", background: enabled ? bg : C.s2, color: enabled ? C.bg : C.tx3, fontSize: 15, fontWeight: 600, cursor: enabled ? "pointer" : "default", fontFamily: "inherit" });

function WellnessFlow({ existing, onSave, sleepTarget, weightLog }) {
  const tgt = sleepTarget || 8;
  // Brouillon local du formulaire en cours (par athlète + jour) : restauré à la
  // réouverture si l'app a été fermée/tuée avant « Sauvegarder », purgé par
  // saveWellness une fois l'enregistrement confirmé par le serveur.
  const athleteId = useOptionalAthleteContext()?.athleteId;
  const [dKey] = useState(() => (athleteId ? wellnessDraftKey(athleteId, todayKey()) : null));
  const [draft] = useState(() => (dKey ? loadDraft(dKey, { maxAgeMs: 24 * 3600 * 1000 })?.value ?? null : null));
  const [step, setStep] = useState(normStep(draft?.step));
  // Pas de note pré-cochée : chaque ligne demande une tape (sauf saisie déjà faite aujourd'hui).
  const [vals, setVals] = useState(draft?.vals ?? { fatigue: existing?.fatigue ?? null, sommeil: existing?.sommeil ?? null, stress: existing?.stress ?? null, energie: existing?.energie ?? null, doms: existing?.doms ?? null });
  const [domsZones] = useState(draft?.domsZones ?? (existing?.domsZones || []));
  const [domsPoints, setDomsPoints] = useState(draft?.domsPoints ?? (existing?.domsPoints || []));
  const [coucher, setCoucher] = useState(draft?.coucher ?? (existing?.coucher || { h: 23, m: 0 }));
  const [reveil, setReveil] = useState(draft?.reveil ?? (existing?.reveil || { h: 7, m: 0 }));
  const [poids, setPoids] = useState(draft?.poids ?? (existing?.poids || ""));
  const [sleepInterrupt, setSleepInterrupt] = useState(draft ? draft.sleepInterrupt ?? null : existing?.sleepInterrupt ?? null);
  const [sleepInterruptNote, setSleepInterruptNote] = useState(draft?.sleepInterruptNote ?? (existing?.sleepInterruptNote || ""));
  const prevPoids = (() => { if (!weightLog) return null; const d = new Date(); d.setDate(d.getDate() - 1); const k = String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0"); return weightLog[k] || null; })();
  const [injOui, setInjOui] = useState(draft ? draft.injOui ?? null : existing?.injComment ? true : null);
  const [injComment, setInjComment] = useState(draft?.injComment ?? (existing?.injComment || ""));
  const snapshot = { step, vals, domsZones, domsPoints, coucher, reveil, poids, sleepInterrupt, sleepInterruptNote, injOui, injComment };
  const snapJson = JSON.stringify(snapshot);
  const initialSnapRef = useRef(snapJson);
  useEffect(() => {
    // Rien de saisi depuis l'ouverture → pas de brouillon (sinon il masquerait
    // un wellness enregistré entre-temps depuis un autre appareil).
    if (!dKey || snapJson === initialSnapRef.current) return;
    saveDraft(dKey, JSON.parse(snapJson));
  }, [dKey, snapJson]);
  useEffect(() => { window.scrollTo?.(0, 0); }, [step]);

  const score = calcScore(vals);
  const reco = getReco(score);
  const alerts = getAlerts(vals);
  const answered = WELL_ITEMS.filter((it) => vals[it.k] != null).length;
  const allAnswered = answered === WELL_ITEMS.length;
  const sleepDur = (() => { const rM = reveil.h * 60 + reveil.m, cM = coucher.h * 60 + coucher.m; return Math.round(((rM <= cM ? rM + 1440 - cM : rM - cM) / 60) * 10) / 10; })();
  const diff = Math.round((sleepDur - tgt) * 10) / 10;
  const sleepC = Math.abs(diff) <= 0.5 ? C.g : Math.abs(diff) <= 1.5 ? C.o : C.r;
  const fmtH = (h) => { const hh = Math.floor(h); const mm = Math.round((h - hh) * 60); return mm ? `${hh} h ${String(mm).padStart(2, "0")}` : `${hh} h`; };
  const injOk = injOui !== true || injComment.trim().length > 0;

  // ── Écran 1 : comment tu te sens ──
  if (step === 0) {
    return (
      <div style={{ paddingBottom: 32 }}>
        <StepHeader step={0} total={2} title="Comment tu te sens" subtitle="Une tape par ligne, 30 secondes." />
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 20px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", borderRadius: 14, border: "1px solid " + (score != null ? reco.c + "73" : C.brd), background: score != null ? reco.c + "1A" : C.s1 }}>
            <ScoreRing score={score} color={reco.c} />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={KICK_S}>Forme du jour</span>
                {score != null && <span style={{ ...MONO_S, fontSize: 10.5, color: C.bg, background: reco.c, borderRadius: 999, padding: "3px 9px" }}>{reco.label}</span>}
              </div>
              <div style={{ fontSize: 12, color: C.tx2 }}>{score != null ? reco.desc : `Se calcule à la 5ᵉ réponse (${answered}/5).`}</div>
            </div>
          </div>

          <div style={{ ...CARD_S, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={KICK_S}>Cette nuit</span>
              <span style={{ ...MONO_S, fontSize: 12, color: sleepC }}>{fmtH(sleepDur)} <span style={{ color: C.tx3 }}>· objectif {fmtH(tgt)}</span></span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <TimePick label="Coucher" time={coucher} setTime={setCoucher} />
              <TimePick label="Réveil" time={reveil} setTime={setReveil} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ flex: 1, fontSize: 13, color: C.tx }}>Réveillée cette nuit ?</span>
              <YesNo value={sleepInterrupt} yesColor={C.o} onYes={() => setSleepInterrupt(true)} onNo={() => { setSleepInterrupt(false); setSleepInterruptNote(""); }} />
            </div>
            {sleepInterrupt === true && (
              <textarea value={sleepInterruptNote} onChange={(e) => setSleepInterruptNote(e.target.value)} placeholder="Durée, raison… (ex : bruit, bébé, ~45 min)" rows={2} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid " + C.o + "50", background: C.s2, color: C.tx, fontSize: 13, fontFamily: "inherit", resize: "none", outline: "none", boxSizing: "border-box" }} />
            )}
            <div style={{ fontSize: 11, color: C.tx3 }}>Les données de ta montre (sommeil, VFC) arriveront ici quand elle sera reliée.</div>
          </div>

          {WELL_ITEMS.map((it, i) => (
            <RatingRow key={it.k} item={it} index={i} value={vals[it.k]} onPick={(n) => setVals((v) => ({ ...v, [it.k]: n }))} />
          ))}

          <button type="button" disabled={!allAnswered} onClick={() => setStep(1)} style={{ ...bigBtn(allAnswered), marginTop: 6 }}>
            {allAnswered ? "Suivant · corps" : `Encore ${WELL_ITEMS.length - answered} ligne${WELL_ITEMS.length - answered > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    );
  }

  // ── Écran 2 : corps ──
  if (step === 1) {
    return (
      <div style={{ paddingBottom: 32 }}>
        <StepHeader step={1} total={2} title="Corps" subtitle="Courbatures, blessure, poids. Touche le corps pour placer une courbature." onBack={() => setStep(0)} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "16px 20px 0" }}>
          <div style={{ ...CARD_S, display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={KICK_S}>Courbatures</span>
            <DomsBodyMap points={domsPoints} onChange={setDomsPoints} />
            <div style={{ display: "flex", gap: 16, fontSize: 11.5, color: C.tx2 }}>
              {[["Légère", DOMS_COLORS[0]], ["Marquée", DOMS_COLORS[1]], ["Intense", DOMS_COLORS[2]]].map(([l, c]) => (
                <span key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{l}</span>
              ))}
            </div>
          </div>

          <div style={{ ...CARD_S, display: "flex", flexDirection: "column", gap: 10, borderColor: injOui === true ? C.r + "73" : C.brd }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: C.tx }}>Blessée ou malade ?</div>
                <div style={{ fontSize: 11.5, color: C.tx3 }}>Douleur, maladie ou gêne autre que les courbatures</div>
              </div>
              <YesNo value={injOui} onYes={() => setInjOui(true)} onNo={() => setInjOui(false)} />
            </div>
            {injOui === true && (
              <textarea value={injComment} onChange={(e) => setInjComment(e.target.value)} placeholder="Décris : zone, type, intensité…" rows={3} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid " + C.r + "50", background: C.s2, color: C.tx, fontSize: 13, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }} />
            )}
          </div>

          <div style={{ ...CARD_S, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={KICK_S}>Poids</span>
              <span style={{ ...MONO_S, fontSize: 10.5, color: C.bg, background: C.g, borderRadius: 999, padding: "3px 9px" }}>À jeun</span>
              <span style={{ flex: 1 }} />
              <button type="button" aria-pressed={poids === ""} onClick={() => setPoids("")} style={{ ...MONO_S, fontSize: 11, color: C.tx2, background: poids === "" ? "rgba(231,211,168,0.12)" : "transparent", border: "1px solid " + C.brd, borderRadius: 999, padding: "3px 9px", cursor: "pointer" }}>Pas de pesée</button>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button type="button" aria-label="Moins 100 g" onClick={() => setPoids((p) => Math.max(30, +((+p || +prevPoids || 60) - 0.1).toFixed(1)))} style={{ width: 44, height: 44, borderRadius: 12, border: "1px solid " + C.brdL, background: "transparent", color: C.tx, fontSize: 20, cursor: "pointer" }}>−</button>
              <input type="number" inputMode="decimal" step="0.1" aria-label="Poids en kg" value={poids} onChange={(e) => setPoids(e.target.value)} placeholder={prevPoids ? String(prevPoids) : "—"} style={{ flex: 1, minWidth: 0, height: 44, borderRadius: 12, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, ...MONO_S, fontSize: 22, textAlign: "center" }} />
              <span style={{ ...MONO_S, fontSize: 12, color: C.tx3 }}>kg</span>
              <button type="button" aria-label="Plus 100 g" onClick={() => setPoids((p) => +((+p || +prevPoids || 60) + 0.1).toFixed(1))} style={{ width: 44, height: 44, borderRadius: 12, border: "1px solid " + C.brdL, background: "transparent", color: C.tx, fontSize: 20, cursor: "pointer" }}>+</button>
            </div>
            {prevPoids && <div style={{ fontSize: 11.5, color: C.tx3 }}>Hier : {String(prevPoids).replace(".", ",")} kg</div>}
          </div>

          <button type="button" disabled={!injOk} onClick={() => setStep(2)} style={{ ...bigBtn(injOk), marginTop: 6 }}>
            {injOk ? "Voir mon bilan" : "Décris ta blessure pour continuer"}
          </button>
        </div>
      </div>
    );
  }

  // ── Bilan ──
  return (
    <div style={{ paddingBottom: 32 }}>
      <StepHeader step={2} total={2} title="Bilan du jour" onBack={() => setStep(1)} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px", borderRadius: 14, border: "1px solid " + reco.c + "73", background: reco.c + "1A" }}>
          <ScoreRing score={score} color={reco.c} />
          <div>
            <div style={{ ...DISPLAY_S, fontSize: 18, color: reco.c }}>{reco.label}</div>
            <div style={{ fontSize: 13, color: C.tx2, marginTop: 4 }}>{reco.desc}</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {WELL_ITEMS.map((it) => {
            const v = vals[it.k];
            return (
              <div key={it.k} style={{ padding: "8px 10px", borderRadius: 10, background: C.s1, border: "1px solid " + C.brd }}>
                <div style={{ fontSize: 10.5, color: C.tx3 }}>{it.q}</div>
                <div style={{ ...MONO_S, fontSize: 18, color: v ? SCALE5[v - 1] : C.tx3 }}>{v ?? "—"}<span style={{ fontSize: 10, color: C.tx3 }}>/5</span></div>
              </div>
            );
          })}
          <div style={{ padding: "8px 10px", borderRadius: 10, background: C.s1, border: "1px solid " + sleepC + "40" }}>
            <div style={{ fontSize: 10.5, color: C.tx3 }}>Nuit</div>
            <div style={{ ...MONO_S, fontSize: 16, color: sleepC }}>{fmtH(sleepDur)}</div>
          </div>
        </div>
        {poids !== "" && poids != null && <div style={{ ...CARD_S, fontSize: 13, color: C.tx2 }}>Poids à jeun : <span style={{ ...MONO_S, color: C.tx }}>{String(poids).replace(".", ",")} kg</span></div>}
        {domsPoints.length > 0 && (
          <div style={{ ...CARD_S, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <span style={{ ...KICK_S, marginRight: 4 }}>Courbatures</span>
            {domsPoints.map((p) => (
              <span key={p.id} style={{ fontSize: 12, padding: "3px 9px", borderRadius: 999, background: domsColor(p.intensity) + "1F", border: "1px solid " + domsColor(p.intensity) + "55", color: C.tx }}>
                {p.side === "front" ? "Avant" : "Dos"}{p.intensity ? ` · ${p.intensity}/10` : ""}
              </span>
            ))}
          </div>
        )}
        {domsPoints.length === 0 && domsZones.length > 0 && (
          <div style={{ ...CARD_S, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {domsZones.map((id) => { const z = ALL_BZ.find((x) => x.id === id); return z ? <span key={id} style={{ fontSize: 12, padding: "3px 9px", borderRadius: 999, background: C.o + "1F", color: C.tx }}>{z.label}</span> : null; })}
          </div>
        )}
        {injOui && injComment && <div style={{ ...CARD_S, borderColor: C.r + "73", fontSize: 13, color: C.tx }}><span style={{ ...KICK_S, color: C.r, display: "block", marginBottom: 4 }}>Blessure ou maladie</span>{injComment}</div>}
        {sleepInterrupt === true && sleepInterruptNote && <div style={{ ...CARD_S, fontSize: 13, color: C.tx }}><span style={{ ...KICK_S, display: "block", marginBottom: 4 }}>Réveil nocturne</span>{sleepInterruptNote}</div>}
        {alerts.map((a, i) => <div key={i} style={{ padding: "8px 12px", borderRadius: 10, background: C.o + "14", border: "1px solid " + C.o + "40", fontSize: 12, color: C.tx }}>{a}</div>)}
        <button
          type="button"
          onClick={() => onSave({ ...vals, domsZones, domsPoints, coucher, reveil, sleepDur, poids: +poids || null, score, injComment: injOui ? injComment : null, sleepInterrupt: sleepInterrupt ?? null, sleepInterruptNote: sleepInterrupt ? sleepInterruptNote || null : null })}
          style={{ ...bigBtn(true, C.g), marginTop: 6 }}
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
}

export { DomsBodyMap, WellnessFlow };
