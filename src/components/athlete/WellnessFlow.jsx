import { useState, useRef, useEffect } from "react";
import { C } from "@/lib/theme";
import { ALL_BZ } from "@/lib/muscles";
import { todayKey } from "@/lib/date";
import { WELL_ITEMS, calcScore, getReco, getAlerts } from "@/lib/wellness";
import { useOptionalAthleteContext } from "@/features/shared/context/AthleteContext";
import { loadDraft, saveDraft, wellnessDraftKey } from "@/lib/localDraft";
import { BodyZoneMap } from "@/features/athlete/components/wellness/BodyZoneMap";
import { DOMS_LEVEL_COLOR, PAIN_COLORS, levelsList } from "@/lib/bodyZones";

// ── Wellness du matin (planche « Wellness athlète » retenue, 12/11) ─────────
// Écran 1 « Comment tu te sens » : readiness, nuit, 6 lignes (la 6ᵉ, envie de
// s'entraîner, hors score). Écran 2 « Corps » : zones du corps notées 1-3,
// douleur 0-10, malade, poids. Puis le bilan. Même enregistrement et même
// brouillon local qu'avant.

const MONO_S = { fontFamily: "var(--agon-font-data)", fontVariantNumeric: "tabular-nums" };
const DISPLAY_S = { fontFamily: "var(--agon-font-display)", fontStretch: "125%", textTransform: "uppercase", fontWeight: 300, letterSpacing: "0.06em", lineHeight: 1.2 };
/** Échelle 1 → 5 : rouge, orange vif, orange, vert-jaune, vert (planche). */
const SCALE5 = ["#FF3B1F", "#FF7A45", "#FF9500", "#B8F03C", "#66F03C"];
const CARD_S = { padding: "12px 14px", borderRadius: 14, background: "#1E1A16", border: "1px solid rgba(231,211,168,0.10)" };
const KICK_S = { ...MONO_S, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#B9AE9C" };
const PILL_S = { ...MONO_S, fontSize: 10.5, fontWeight: 500, letterSpacing: "0.10em", textTransform: "uppercase", whiteSpace: "nowrap", flex: "none", borderRadius: 999, padding: "3px 9px" };
const TX2 = "#B9AE9C";
const TX3 = "#8E8780";

/** La 6ᵉ ligne de la planche : hors score (le score reste les 5 notes). */
const ENVIE_ITEM = { k: "envie", q: "Envie de t’entraîner", lo: "Aucune envie", hi: "Très motivé·e" };
const ROWS = [...WELL_ITEMS, ENVIE_ITEM];

/** Ancien brouillon (questions une par une, étapes 0 à 9) → nouvel écran. */
function normStep(s) {
  if (typeof s !== "number" || s <= 5) return 0;
  return s >= 9 ? 2 : 1;
}

function headerDay() {
  const t = new Date().toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function ScoreRing({ score, color, size = 68 }) {
  const c = size / 2, r = size * 26 / 68, sw = size * 6 / 68, circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ flex: "none" }}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="#27221D" strokeWidth={sw} />
      {score != null && <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${(circ * score) / 100} ${circ}`} transform={`rotate(-90 ${c} ${c})`} />}
      <text x={c} y={c + 5} textAnchor="middle" fill="#FFFFFF" style={{ ...MONO_S, fontSize: 17 }}>{score ?? "—"}</text>
    </svg>
  );
}

function RatingRow({ item, index, value, onPick }) {
  return (
    <div style={{ ...CARD_S, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", whiteSpace: "nowrap" }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "#FFFFFF" }}>{item.q}</span>
        <span style={{ ...MONO_S, fontSize: 10.5, color: TX3 }}>{index + 1}/{ROWS.length}</span>
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
              style={{ flex: 1, height: 48, borderRadius: 12, ...MONO_S, fontSize: 18, cursor: "pointer", border: sel ? "none" : "1px solid " + col + "40", background: sel ? col : col + "14", color: sel ? "#0E0C0A" : col, fontWeight: sel ? 500 : 400, boxShadow: sel ? `0 0 18px ${col}55` : "none" }}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: TX3 }}>
        <span>{item.lo}</span><span>{item.hi}</span>
      </div>
    </div>
  );
}

function YesNo({ value, onYes, onNo }) {
  const base = { width: 72, height: 40, borderRadius: 12, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" };
  return (
    <div style={{ display: "flex", gap: 8, flex: "none" }}>
      <button type="button" aria-pressed={value === true} onClick={onYes} style={{ ...base, border: value === true ? "none" : "1px solid rgba(255,59,31,0.45)", background: value === true ? "#FF3B1F" : "rgba(255,59,31,0.08)", color: value === true ? "#0E0C0A" : "#FF3B1F" }}>Oui</button>
      <button type="button" aria-pressed={value === false} onClick={onNo} style={{ ...base, border: value === false ? "none" : "1px solid rgba(231,211,168,0.18)", background: value === false ? "#66F03C" : "transparent", color: value === false ? "#0E0C0A" : TX2 }}>Non</button>
    </div>
  );
}

const bSm = { width: 32, height: 28, borderRadius: 8, border: "1px solid rgba(231,211,168,0.18)", background: "transparent", color: TX2, fontSize: 15, cursor: "pointer", fontFamily: "inherit", padding: 0 };

function TimePick({ label, time, setTime }) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    <div style={{ flex: 1, minWidth: 0, padding: "9px 10px", borderRadius: 10, background: "#27221D", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 10.5, color: TX3 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
          <button type="button" aria-label={label + " : une heure de plus"} onClick={() => setTime((t) => ({ ...t, h: (t.h + 1) % 24 }))} style={bSm}>+</button>
          <span style={{ ...MONO_S, fontSize: 20, color: "#FFFFFF" }}>{pad(time.h)}</span>
          <button type="button" aria-label={label + " : une heure de moins"} onClick={() => setTime((t) => ({ ...t, h: (t.h - 1 + 24) % 24 }))} style={bSm}>−</button>
        </div>
        <span style={{ ...MONO_S, fontSize: 18, color: TX3 }}>:</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
          <button type="button" aria-label={label + " : 15 minutes de plus"} onClick={() => setTime((t) => ({ ...t, m: (t.m + 15) % 60 }))} style={bSm}>+</button>
          <span style={{ ...MONO_S, fontSize: 20, color: "#FFFFFF" }}>{pad(time.m)}</span>
          <button type="button" aria-label={label + " : 15 minutes de moins"} onClick={() => setTime((t) => ({ ...t, m: (t.m - 15 + 60) % 60 }))} style={bSm}>−</button>
        </div>
      </div>
    </div>
  );
}

function StepHeader({ step, total, title, subtitle, onBack, backLabel = "Retour" }) {
  const pct = Math.round((Math.min(step + 1, total) / total) * 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "22px 20px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 28 }}>
        {onBack ? (
          <button type="button" onClick={onBack} aria-label={backLabel} style={{ width: 28, height: 28, border: "none", background: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={TX2} strokeWidth="1.5" strokeLinecap="square" aria-hidden><path d="M15 5L8 12L15 19" /></svg>
          </button>
        ) : <span style={{ width: 28 }} />}
        <span style={{ ...MONO_S, fontSize: 11, color: TX2, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          {step < total ? `Wellness · ${step + 1} / ${total}` : "Wellness · bilan"}
        </span>
        <span style={{ ...MONO_S, fontSize: 11, color: TX3 }}>{headerDay()}</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: "#27221D", overflow: "hidden" }}>
        <div style={{ width: pct + "%", height: "100%", background: "linear-gradient(90deg,#FF9500,#66F03C)", transition: "width 0.3s" }} />
      </div>
      <div>
        <h1 style={{ margin: 0, ...DISPLAY_S, fontSize: 22, color: "#FFFFFF" }}>{title}</h1>
        {subtitle && <div style={{ fontSize: 12.5, color: TX2, marginTop: 4 }}>{subtitle}</div>}
      </div>
    </div>
  );
}

const bigBtn = (enabled, bg = "#FFC933") => ({ width: "100%", height: 54, borderRadius: 14, border: "none", background: enabled ? bg : "#27221D", color: enabled ? "#0E0C0A" : TX3, fontSize: 13, fontWeight: 600, cursor: enabled ? "pointer" : "default", fontFamily: "inherit" });

/** Note « blessé / malade » lue par le coach (rubrique Blessé / malade), déduite des réponses. */
function injuryNoteOf(sick, pain, levels) {
  const parts = [];
  if (sick) parts.push("Malade ou fiévreux·se");
  if (pain != null && pain > 0) {
    const z = levelsList(levels).map((x) => x.label.toLowerCase());
    parts.push(`Douleur ${pain}/10` + (z.length ? ` (${z.join(", ")})` : ""));
  }
  return parts.length ? parts.join(" · ") : null;
}

function WellnessFlow({ existing, onSave, sleepTarget, weightLog, onClose }) {
  const tgt = sleepTarget || 8;
  // Brouillon local du formulaire en cours (par athlète + jour) : restauré à la
  // réouverture si l'app a été fermée/tuée avant l'enregistrement, purgé par
  // saveWellness une fois l'enregistrement confirmé par le serveur.
  const athleteId = useOptionalAthleteContext()?.athleteId;
  const [dKey] = useState(() => (athleteId ? wellnessDraftKey(athleteId, todayKey()) : null));
  const [draft] = useState(() => (dKey ? loadDraft(dKey, { maxAgeMs: 24 * 3600 * 1000 })?.value ?? null : null));
  const [step, setStep] = useState(normStep(draft?.step));
  // Pas de note pré-cochée : chaque ligne demande une tape (sauf saisie déjà faite aujourd'hui).
  const [vals, setVals] = useState(draft?.vals ?? { fatigue: existing?.fatigue ?? null, sommeil: existing?.sommeil ?? null, stress: existing?.stress ?? null, energie: existing?.energie ?? null, doms: existing?.doms ?? null, envie: existing?.envie ?? null });
  // Anciennes saisies (zones sans niveau, points libres) : gardées telles quelles, plus affichées.
  const [domsZones] = useState(existing?.domsZones || []);
  const [domsPoints] = useState(existing?.domsPoints || []);
  const [levels, setLevels] = useState(draft?.domsLevels ?? (existing?.domsLevels || {}));
  const [selZone, setSelZone] = useState(null);
  const [pain, setPain] = useState(draft ? draft.pain ?? null : existing?.pain ?? null);
  const [sick, setSick] = useState(draft ? draft.sick ?? null : existing?.sick ?? null);
  const [coucher, setCoucher] = useState(draft?.coucher ?? (existing?.coucher || { h: 23, m: 0 }));
  const [reveil, setReveil] = useState(draft?.reveil ?? (existing?.reveil || { h: 7, m: 0 }));
  const [poids, setPoids] = useState(draft?.poids ?? (existing?.poids || ""));
  const prevPoids = (() => { if (!weightLog) return null; const d = new Date(); d.setDate(d.getDate() - 1); const k = String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0"); return weightLog[k] || null; })();
  const snapshot = { step, vals, domsLevels: levels, pain, sick, coucher, reveil, poids };
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
  const answered = ROWS.filter((it) => vals[it.k] != null).length;
  const allAnswered = answered === ROWS.length;
  const sleepDur = (() => { const rM = reveil.h * 60 + reveil.m, cM = coucher.h * 60 + coucher.m; return Math.round(((rM <= cM ? rM + 1440 - cM : rM - cM) / 60) * 10) / 10; })();
  const diff = Math.round((sleepDur - tgt) * 10) / 10;
  const sleepC = Math.abs(diff) <= 0.5 ? C.g : Math.abs(diff) <= 1.5 ? C.o : C.r;
  const fmtH = (h) => { const hh = Math.floor(h); const mm = Math.round((h - hh) * 60); return mm ? `${hh} h ${String(mm).padStart(2, "0")}` : `${hh} h`; };
  const ringColor = score != null ? reco.c : TX3;

  // ── Écran 1 : comment tu te sens ──
  if (step === 0) {
    return (
      <div style={{ paddingBottom: 32 }}>
        <StepHeader step={0} total={2} title="Comment tu te sens" subtitle="Une tape par ligne, 30 secondes." onBack={onClose} backLabel="Fermer" />
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 20px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", borderRadius: 14, border: "1px solid " + (score != null ? ringColor + "73" : "rgba(231,211,168,0.10)"), background: score != null ? `radial-gradient(120% 120% at 0% 0%,${ringColor}2E,transparent 60%),#1E1A16` : "#1E1A16" }}>
            <ScoreRing score={score} color={ringColor} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={KICK_S}>Readiness</span>
                {score != null && <span style={{ ...PILL_S, color: "#0E0C0A", background: ringColor }}>{reco.label}</span>}
              </div>
              <div style={{ fontSize: 12, color: TX2, marginTop: 4 }}>{score != null ? "Se met à jour à chaque réponse." : `Se calcule à la 5ᵉ réponse (${Math.min(answered, 5)}/5).`}</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", borderRadius: 14, background: "linear-gradient(135deg,rgba(51,181,255,0.14),rgba(51,181,255,0.03)),#1E1A16", border: "1px solid rgba(51,181,255,0.4)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", whiteSpace: "nowrap" }}>
              <span style={KICK_S}>Cette nuit</span>
              <span style={{ ...MONO_S, fontSize: 10.5, color: TX3 }}>objectif {fmtH(tgt)}</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <TimePick label="Coucher" time={coucher} setTime={setCoucher} />
              <TimePick label="Réveil" time={reveil} setTime={setReveil} />
              <div style={{ flex: 1, minWidth: 0, padding: "9px 10px", borderRadius: 10, background: "#27221D", display: "flex", flexDirection: "column", gap: 3, justifyContent: "center" }}>
                <span style={{ fontSize: 10.5, color: TX3, whiteSpace: "nowrap" }}>Sommeil</span>
                <span style={{ ...MONO_S, fontSize: 20, color: "#FFFFFF", whiteSpace: "nowrap" }}>{fmtH(sleepDur)}</span>
                <span style={{ fontSize: 10.5, color: sleepC, whiteSpace: "nowrap" }}>{diff === 0 ? "objectif atteint" : `${diff > 0 ? "+" : ""}${String(diff).replace(".", ",")} h`}</span>
              </div>
            </div>
            <div style={{ fontSize: 11, color: TX3 }}>Sans montre, tu indiques tes heures de sommeil. Montre reliée : rien à saisir.</div>
          </div>

          {ROWS.map((it, i) => (
            <RatingRow key={it.k} item={it} index={i} value={vals[it.k]} onPick={(n) => setVals((v) => ({ ...v, [it.k]: n }))} />
          ))}

          <button type="button" disabled={!allAnswered} onClick={() => setStep(1)} style={{ ...bigBtn(allAnswered), marginTop: 6 }}>
            {allAnswered ? "Suivant · corps" : `Encore ${ROWS.length - answered} ligne${ROWS.length - answered > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    );
  }

  // ── Écran 2 : corps ──
  if (step === 1) {
    const poidsOn = poids !== "" && poids != null;
    return (
      <div style={{ paddingBottom: 32 }}>
        <StepHeader step={1} total={2} title="Corps" subtitle="Courbatures, douleur, santé. Touche une zone pour la noter." onBack={() => setStep(0)} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "16px 20px 20px" }}>
          <BodyZoneMap levels={levels} onChange={setLevels} selected={selZone} onSelect={setSelZone} />

          <div style={{ ...CARD_S, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", whiteSpace: "nowrap" }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: "#FFFFFF" }}>Douleur</span>
              <span style={{ fontSize: 11.5, color: TX3 }}>autre que les courbatures</span>
            </div>
            <div role="radiogroup" aria-label="Douleur de 0 à 10" style={{ display: "flex", gap: 3 }}>
              {PAIN_COLORS.map((col, n) => {
                const sel = pain === n;
                return (
                  <button key={n} type="button" role="radio" aria-checked={sel} onClick={() => setPain(n)}
                    style={{ flex: 1, minWidth: 0, height: 36, borderRadius: 8, padding: 0, ...MONO_S, fontSize: 13, cursor: "pointer", border: sel ? "none" : "1px solid " + col + "40", background: sel ? col : col + "14", color: sel ? "#0E0C0A" : col, fontWeight: sel ? 500 : 400 }}>
                    {n}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: TX3 }}><span>Aucune</span><span>Insupportable</span></div>
            <div style={{ fontSize: 11.5, color: TX3 }}>Au-dessus de 0, tu touches la zone sur la carte.</div>
          </div>

          <div style={{ ...CARD_S, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "#FFFFFF" }}>Malade ou fiévreux·se ?</div>
            <YesNo value={sick} onYes={() => setSick(true)} onNo={() => setSick(false)} />
          </div>

          <div style={{ ...CARD_S, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={KICK_S}>Poids</span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
                <input
                  type="number" inputMode="decimal" step="0.1" aria-label="Poids en kg"
                  value={poids} onChange={(e) => setPoids(e.target.value)}
                  placeholder={prevPoids ? String(prevPoids).replace(".", ",") : "—"}
                  style={{ width: `${Math.max(String(poids !== "" && poids != null ? poids : prevPoids ?? "—").length, 1) + 0.6}ch`, padding: 0, border: "none", background: "transparent", color: "#FFFFFF", ...MONO_S, fontSize: 24, outline: "none" }}
                />
                <span style={{ ...MONO_S, fontSize: 11, color: TX3 }}>kg</span>
              </div>
            </div>
            <span style={{ display: "flex", gap: 6 }}>
              <span style={{ ...PILL_S, color: poidsOn ? "#0E0C0A" : TX2, background: poidsOn ? "#66F03C" : "rgba(231,211,168,0.08)", border: poidsOn ? "none" : "1px solid rgba(231,211,168,0.10)" }}>À jeun</span>
              <button type="button" aria-pressed={!poidsOn} onClick={() => setPoids("")} style={{ ...PILL_S, fontSize: 11, fontWeight: 400, color: TX2, background: !poidsOn ? "rgba(231,211,168,0.16)" : "rgba(231,211,168,0.08)", border: "1px solid rgba(231,211,168,0.10)", cursor: "pointer", fontFamily: "var(--agon-font-data)" }}>Pas de pesée</button>
            </span>
          </div>

          <button type="button" onClick={() => setStep(2)} style={{ ...bigBtn(true), marginTop: 6 }}>Voir mon bilan</button>
        </div>
      </div>
    );
  }

  // ── Bilan ──
  const zones = levelsList(levels);
  const injComment = injuryNoteOf(sick, pain, levels);
  return (
    <div style={{ paddingBottom: 32 }}>
      <StepHeader step={2} total={2} title="Bilan du jour" onBack={() => setStep(1)} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 20px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px", borderRadius: 14, border: "1px solid " + ringColor + "73", background: `radial-gradient(120% 120% at 0% 0%,${ringColor}2E,transparent 60%),#1E1A16` }}>
          <ScoreRing score={score} color={ringColor} />
          <div>
            <div style={{ ...DISPLAY_S, fontSize: 18, color: ringColor }}>{reco.label}</div>
            <div style={{ fontSize: 13, color: TX2, marginTop: 4 }}>{reco.desc}</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {ROWS.map((it) => {
            const v = vals[it.k];
            return (
              <div key={it.k} style={{ padding: "8px 10px", borderRadius: 10, background: "#1E1A16", border: "1px solid rgba(231,211,168,0.10)" }}>
                <div style={{ fontSize: 10.5, color: TX3 }}>{it.q}</div>
                <div style={{ ...MONO_S, fontSize: 18, color: v ? SCALE5[v - 1] : TX3 }}>{v ?? "—"}<span style={{ fontSize: 10, color: TX3 }}>/5</span></div>
              </div>
            );
          })}
          <div style={{ padding: "8px 10px", borderRadius: 10, background: "#1E1A16", border: "1px solid " + sleepC + "40" }}>
            <div style={{ fontSize: 10.5, color: TX3 }}>Nuit</div>
            <div style={{ ...MONO_S, fontSize: 16, color: sleepC }}>{fmtH(sleepDur)}</div>
          </div>
          <div style={{ padding: "8px 10px", borderRadius: 10, background: "#1E1A16", border: "1px solid rgba(231,211,168,0.10)" }}>
            <div style={{ fontSize: 10.5, color: TX3 }}>Douleur</div>
            <div style={{ ...MONO_S, fontSize: 18, color: pain != null ? PAIN_COLORS[pain] : TX3 }}>{pain ?? "—"}<span style={{ fontSize: 10, color: TX3 }}>/10</span></div>
          </div>
        </div>
        {poids !== "" && poids != null && <div style={{ ...CARD_S, fontSize: 13, color: TX2 }}>Poids à jeun : <span style={{ ...MONO_S, color: "#FFFFFF" }}>{String(poids).replace(".", ",")} kg</span></div>}
        {zones.length > 0 && (
          <div style={{ ...CARD_S, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <span style={{ ...KICK_S, marginRight: 4 }}>Courbatures</span>
            {zones.map((z) => (
              <span key={z.id} style={{ display: "flex", alignItems: "center", gap: 6, height: 28, padding: "0 10px", borderRadius: 999, background: DOMS_LEVEL_COLOR[z.level] + "1F", border: "1px solid " + DOMS_LEVEL_COLOR[z.level] + "55", fontSize: 12, color: "#FFFFFF" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: DOMS_LEVEL_COLOR[z.level] }} />{z.label}<span style={{ ...MONO_S, color: TX3 }}>{z.level}</span>
              </span>
            ))}
          </div>
        )}
        {zones.length === 0 && domsZones.length > 0 && (
          <div style={{ ...CARD_S, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {domsZones.map((id) => { const z = ALL_BZ.find((x) => x.id === id); return z ? <span key={id} style={{ fontSize: 12, padding: "3px 9px", borderRadius: 999, background: C.o + "1F", color: "#FFFFFF" }}>{z.label}</span> : null; })}
          </div>
        )}
        {injComment && <div style={{ ...CARD_S, borderColor: "rgba(255,59,31,0.45)", fontSize: 13, color: "#FFFFFF" }}><span style={{ ...KICK_S, color: "#FF3B1F", display: "block", marginBottom: 4 }}>Pour ton coach</span>{injComment}</div>}
        {alerts.map((a, i) => <div key={i} style={{ padding: "8px 12px", borderRadius: 10, background: C.o + "14", border: "1px solid " + C.o + "40", fontSize: 12, color: "#FFFFFF" }}>{a}</div>)}
        <button
          type="button"
          onClick={() => onSave({
            ...vals,
            domsZones: zones.length ? zones.map((z) => z.id) : domsZones,
            domsPoints,
            domsLevels: levels,
            pain, sick,
            coucher, reveil, sleepDur,
            poids: +poids || null, score,
            injComment,
            sleepInterrupt: existing?.sleepInterrupt ?? null,
            sleepInterruptNote: existing?.sleepInterruptNote ?? null,
          })}
          style={{ ...bigBtn(true, "#66F03C"), marginTop: 6 }}
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
}

export { WellnessFlow };
