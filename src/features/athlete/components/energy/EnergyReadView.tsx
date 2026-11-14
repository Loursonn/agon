import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, FileText } from "lucide-react";
import { C, alpha } from "@/lib/theme";
import { zoneColor } from "@/lib/seance";
import { TYPE_COLOR } from "@/lib/peps";
import { DISPLAY, KICKER, LABEL, MONO } from "@/features/shared/components/seance/seanceUi";
import {
  profileBars, readBlocks, sessionLine, type MainTarget, type ReadBlock, type ReadGroup, type Refs, type ZoneScale,
} from "@/lib/energy/energyRun";
import type { EnergySessionRow } from "@/types/energy";
import { tintColor } from "./energyTint";

/**
 * Lecture d'une séance d'énergie avant de la faire (planche EnergieTel, écrans
 * 01-02) : l'essentiel en une ligne, le profil en barres, chaque bloc lu comme
 * une phrase avec UNE cible en grand, consignes du coach repliées.
 */
export function EnergyReadView({
  session, refs, hrZones, badge, onClose, onStart, onNote, onDetail,
}: {
  session: EnergySessionRow;
  refs: Refs;
  /** Nombre de zones du modèle FC du coach (3, 5 ou 7) pour l'échelle sous un bloc en FC. */
  hrZones?: number | null;
  /** « Sur ta montre » quand la séance a été envoyée sur la montre. */
  badge?: React.ReactNode;
  onClose: () => void;
  onStart: () => void;
  onNote: () => void;
  onDetail: () => void;
}) {
  const steps = useMemo(() => session.intervals ?? [], [session.intervals]);
  const blocks = useMemo(() => readBlocks(steps, refs, { hrZones }), [steps, refs, hrZones]);
  const bars = useMemo(() => profileBars(steps, refs), [steps, refs]);
  const totalS = session.total_duration_s ?? blocks.reduce((a, b) => a + b.durationS, 0);
  const consignes = [session.notes?.trim(), ...blocks.flatMap((b) => b.instructions)].filter((x): x is string => !!x);
  const [open, setOpen] = useState(false);
  const energie = TYPE_COLOR.energie;

  return (
    <div role="dialog" aria-label={session.name} style={{
      position: "fixed", inset: 0, zIndex: 61, background: C.bg, color: C.tx,
      display: "flex", flexDirection: "column", maxWidth: 480, margin: "0 auto",
    }}>
      <div style={{ padding: "calc(env(safe-area-inset-top, 0px) + 14px) 18px 10px", display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" aria-label="Retour" onClick={onClose} style={{
          width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.brdL}`, background: "transparent",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none",
        }}><ChevronLeft size={16} color={C.tx} /></button>
        <span style={{ ...KICKER, flex: 1, minWidth: 0 }}>Séance d'énergie</span>
        {badge}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 18px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{
            ...MONO, alignSelf: "flex-start", height: 24, padding: "0 9px", borderRadius: 999, background: energie, color: C.ink,
            fontSize: 11, letterSpacing: "0.06em", fontWeight: 500, display: "inline-flex", alignItems: "center", textTransform: "uppercase",
          }}>Énergie</span>
          <h2 style={{ ...DISPLAY, margin: 0, fontWeight: 400, fontSize: 24 }}>{session.name}</h2>
          <div style={{ ...MONO, fontSize: 16 }}>{sessionLine(totalS, session.total_distance_m)}</div>
        </div>

        {bars.length > 0 && (
          <div aria-hidden style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 46, flex: "none" }}>
            {bars.map((b, i) => (
              <span key={i} style={{ flex: `${b.width} 0 0`, minWidth: 2, height: `${Math.round(b.height * 100)}%`, borderRadius: 2, background: tintColor(b.tint) }} />
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {blocks.map((b) => (
            <div key={b.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {b.tree ? <GroupCard b={b} tree={b.tree} /> : <BlockRow b={b} />}
              {b.scale && <ScaleBar scale={b.scale} />}
            </div>
          ))}
          {blocks.length === 0 && <div style={{ color: C.tx2, fontSize: 13 }}>Pas de bloc détaillé : suis les consignes du coach.</div>}
        </div>

        {consignes.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{
              display: "flex", alignItems: "center", gap: 8, background: "transparent", border: 0, padding: "6px 0",
              color: C.tx2, fontSize: 13, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
            }}>
              <FileText size={16} color={C.ac} aria-hidden />
              Consignes du coach ({consignes.length})
              <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : undefined }} aria-hidden />
            </button>
            {open && consignes.map((c, i) => (
              <div key={i} style={{ background: C.s1, border: `1px solid ${C.brd}`, borderRadius: 14, padding: "12px 14px", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{c}</div>
            ))}
          </div>
        )}

        <button type="button" onClick={onDetail} style={{
          alignSelf: "flex-start", background: "transparent", border: 0, padding: 0, color: C.ac, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
        }}>Voir le détail complet ›</button>
      </div>

      <div style={{
        padding: "14px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)", borderTop: `1px solid ${C.brd}`,
        background: C.bg, display: "flex", gap: 12,
      }}>
        <button type="button" onClick={onStart} style={{
          flex: 1.3, height: 52, border: 0, borderRadius: 12, background: C.ac, color: C.ink,
          fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}>Commencer</button>
        <button type="button" onClick={onNote} style={{
          flex: 1, height: 52, borderRadius: 12, background: "transparent", border: `1px solid ${C.brdL}`, color: C.tx,
          fontSize: 14, cursor: "pointer", fontFamily: "inherit",
        }}>Noter ma séance</button>
      </div>
    </div>
  );
}

function Target({ t, color, size = 22 }: { t: MainTarget; color: string; size?: number }) {
  return (
    <span style={{ ...MONO, fontSize: size, lineHeight: 1.1, color, whiteSpace: "nowrap" }}>
      {t.value}<span style={{ fontSize: 12, color: C.tx2 }}>{t.unit}</span>
    </span>
  );
}

/** Ligne de bloc (planche EnergieTelCas, « Lecture ») : barre de couleur, bloc à gauche, la cible en grand à droite. */
function BlockRow({ b }: { b: ReadBlock }) {
  const color = tintColor(b.tint);
  const sub = [b.target?.secondary, b.scale?.active ? `Z${b.scale.active}` : null].filter(Boolean).join(" · ");
  return (
    <div style={{ background: C.s1, border: `1px solid ${C.brd}`, borderRadius: 14, padding: "12px 14px", display: "flex", gap: 12, alignItems: "stretch" }}>
      <span aria-hidden style={{ width: 4, borderRadius: 2, background: color, flex: "none" }} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ ...LABEL, color: C.tx2 }}>{b.title}</span>
        <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>{b.phrase}</div>
        {b.tints.length > 1 && (
          <div aria-hidden style={{ display: "flex", gap: 4, marginTop: 2 }}>
            {b.tints.map((t, i) => <span key={i} style={{ width: 18, height: 4, borderRadius: 2, background: tintColor(t) }} />)}
          </div>
        )}
      </div>
      {b.target && (
        <div style={{ flex: "none", maxWidth: "48%", display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", gap: 4, textAlign: "right" }}>
          <Target t={b.target} color={color} />
          {sub && <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{sub}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * Groupe dans un groupe (planche EnergieTelCas, cas 04) : carte teintée, « 2 séries »
 * et la récup entre séries en tête, les répétitions lues en phrase, en retrait.
 */
function GroupCard({ b, tree }: { b: ReadBlock; tree: ReadGroup }) {
  const color = tintColor(b.tint);
  return (
    <div style={{ background: alpha(color, 0.07), border: `1px solid ${alpha(color, 0.33)}`, borderRadius: 14, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ ...LABEL, color: C.tx2 }}>{b.title}</span>
      <GroupLevel tree={tree} color={color} />
    </div>
  );
}

function GroupLevel({ tree, color }: { tree: ReadGroup; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <span style={{ ...LABEL, color: C.tx2, whiteSpace: "nowrap" }}>{tree.label}</span>
        {tree.between && <span style={{ fontSize: 12, color: C.tx2, textAlign: "right" }}>{tree.between}</span>}
      </div>
      {tree.items.map((it) => {
        const c = it.kind === "line" ? tintColor(it.tint) : color;
        return (
          <div key={it.id} style={{ marginLeft: 12, paddingLeft: 12, borderLeft: `2px solid ${alpha(c, 0.47)}` }}>
            {it.kind === "group" ? (
              <GroupLevel tree={it.group} color={color} />
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16 }}>{it.main}</div>
                  {it.sub && <div style={{ fontSize: 12.5, color: C.tx2 }}>{it.sub}</div>}
                </div>
                {it.target && <Target t={it.target} color={c} />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Échelle Z1–Zn sous un bloc en watts ou en FC, aux couleurs des zones (vert → rouge). */
function ScaleBar({ scale }: { scale: ZoneScale }) {
  const zones = Array.from({ length: scale.n }, (_, i) => i + 1);
  return (
    <div role="img" aria-label={`Échelle de ${scale.n} zones${scale.active ? `, zone ${scale.active} visée` : ""}`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 4 }}>
        {zones.map((z) => (
          <span key={z} style={{
            flex: 1, height: 6, borderRadius: 3, background: zoneColor(z, scale.n),
            outline: z === scale.active ? `1.5px solid ${C.tx}` : undefined, outlineOffset: 1,
          }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", ...MONO, fontSize: 10.5, color: C.tx3 }}>
        {zones.map((z) => <span key={z} style={{ color: z === scale.active ? C.tx : undefined }}>Z{z}</span>)}
      </div>
    </div>
  );
}
