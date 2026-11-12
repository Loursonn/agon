import { useState, type CSSProperties } from "react";
import { Check, ChevronRight, RefreshCw, Watch } from "lucide-react";
import { C, alpha } from "@/lib/theme";
import { SERIES_COLORS, zoneColor } from "@/lib/seance";
import type { PlanningCardModel } from "@/lib/planningCard";
import type { PlannedKind } from "@/lib/plannedVsDone";
import { MONO, buttonStyle, pillStyle } from "@/features/shared/components/seance/seanceUi";

export interface AssociableSession {
  kind: PlannedKind;
  id: string;
  label: string;
}

interface Props {
  card: PlanningCardModel;
  /** Colonne étroite (semaine de 7 jours à l'ordinateur) : boutons empilés, source réduite à la marque. */
  narrow?: boolean;
  /** Ouvre l'onglet Séance de l'activité. */
  onOpen?: (activityId: string) => void;
  onConfirm?: (linkId: string) => void;
  onReject?: (linkId: string) => void;
  /** Séances du jour auxquelles rattacher une activité libre. */
  associable?: AssociableSession[];
  onAssociate?: (activityId: string, s: AssociableSession) => void;
  busy?: boolean;
}

/** Couleur de la pastille de sport (mêmes repères que l'en-tête de l'onglet Séance). */
const sportColor = (badge: string) => (badge === "HYROX" ? C.o : badge === "Course" || badge === "Marche" || badge === "Randonnée" ? C.b : C.pat);

/**
 * Carte du planning (P34), identique pour le coach et l'athlète : prévue,
 * synchro en cours, à confirmer, réalisée, séance libre. La carte réalisée
 * remplace la carte prévue : jamais deux cartes pour la même séance.
 */
export function PlanningSessionCard({ card, narrow = false, onOpen, onConfirm, onReject, associable = [], onAssociate, busy }: Props) {
  const [picking, setPicking] = useState(false);
  const { state } = card;
  const accent = state === "toConfirm" ? C.ac : state === "done" ? C.g : null;
  const clickable = !!card.activityId && !!onOpen && state !== "syncing";
  const open = () => clickable && onOpen!(card.activityId!);

  const box: CSSProperties = {
    position: "relative", display: "flex", flexDirection: "column", gap: 8, padding: narrow ? "10px 10px" : "12px 14px",
    borderRadius: 12, textAlign: "left", width: "100%", minWidth: 0,
    background: accent ? alpha(accent, state === "toConfirm" ? 0.07 : 0.05) : C.s1,
    border: `1px solid ${accent ? alpha(accent, state === "toConfirm" ? 0.45 : 0.6) : C.brdL}`,
    cursor: clickable ? "pointer" : "default",
  };

  return (
    <div
      style={box}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={open}
      onKeyDown={(e) => { if (clickable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } }}
      aria-label={clickable ? `Ouvrir la séance ${card.title}` : undefined}
    >
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {state === "free"
          ? <span style={pillStyle(C.tx2)}>Séance libre</span>
          : <span style={pillStyle(sportColor(card.badge), true)}>{card.badge}</span>}
        {state === "toConfirm" && <span style={pillStyle(C.ac)}>À confirmer</span>}
        {state === "done" && <span style={pillStyle(C.g, true)}>Réalisée</span>}
      </div>

      <div style={{ fontSize: narrow ? 13 : 14, fontWeight: 600, color: C.tx, lineHeight: 1.25, overflowWrap: "anywhere" }}>{card.title}</div>

      {state === "syncing" && (
        <>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.b }}>
            <RefreshCw size={13} className="animate-spin" style={{ animationDuration: "2.4s" }} aria-hidden />
            Synchro en cours…
          </span>
          <Source card={card} narrow={narrow} />
        </>
      )}

      {state === "toConfirm" && (
        <>
          <div style={{ padding: "8px 10px", borderRadius: 9, background: alpha(C.bg, 0.55), border: `1px solid ${C.brd}`, display: "flex", flexDirection: "column", gap: 4 }}>
            <Source card={card} narrow={narrow} />
            <span style={{ ...MONO, fontSize: 12, fontWeight: 600, color: C.tx }}>{sportWord(card.badge)} · {card.summary}</span>
            {card.startLabel && <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{card.startLabel}</span>}
          </div>
          {card.linkId && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button
                type="button"
                disabled={busy}
                style={{ ...buttonStyle("primary", busy), width: "100%", height: 36, fontSize: 12.5 }}
                onClick={(e) => { e.stopPropagation(); onConfirm?.(card.linkId!); }}
              >
                <Check size={14} />C’est bien cette séance
              </button>
              <button
                type="button"
                disabled={busy}
                style={{ ...buttonStyle("ghost", busy), width: "100%", height: 34, fontSize: 12, whiteSpace: "normal" }}
                onClick={(e) => { e.stopPropagation(); onReject?.(card.linkId!); }}
              >
                Ce n’est pas cette séance
              </button>
            </div>
          )}
        </>
      )}

      {(state === "done" || state === "free") && (
        <>
          <Figures card={card} />
          {state === "done" && <ZoneBar shares={card.zoneShares} />}
          <Source card={card} narrow={narrow} />
        </>
      )}

      {state === "free" && card.activityId && onAssociate && associable.length > 0 && (
        picking ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }} onClick={(e) => e.stopPropagation()}>
            <span style={{ fontSize: 11.5, color: C.tx3 }}>Associer à :</span>
            {associable.map((s) => (
              <button
                key={`${s.kind}:${s.id}`}
                type="button"
                disabled={busy}
                style={{ ...buttonStyle("ghost", busy), justifyContent: "flex-start", height: 32, fontSize: 12, whiteSpace: "normal", textAlign: "left" }}
                onClick={() => { onAssociate(card.activityId!, s); setPicking(false); }}
              >
                {s.label}
              </button>
            ))}
            <button type="button" style={{ ...buttonStyle("ghost"), border: "none", height: 28, fontSize: 11.5 }} onClick={() => setPicking(false)}>Annuler</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setPicking(true); }}
            style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: 0, border: "none", background: "transparent", color: C.ac, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", alignSelf: "flex-start" }}
          >
            Associer à une séance prévue <ChevronRight size={13} />
          </button>
        )
      )}
    </div>
  );
}

function sportWord(badge: string): string {
  return badge === "Séance libre" ? "Activité" : badge;
}

function Figures({ card }: { card: PlanningCardModel }) {
  return (
    <span style={{ ...MONO, fontSize: 12, fontWeight: 600, color: C.tx }}>
      {card.summary}
      {card.pace && (
        <>
          {" · "}
          <span style={{ color: SERIES_COLORS.pace }}>{card.pace}</span>
          {card.paceUnit === "km/h" && <span style={{ color: C.tx3, fontWeight: 400 }}> km/h</span>}
        </>
      )}
    </span>
  );
}

/** Barre des 3 zones de FC (mêmes couleurs que l'onglet Séance). Rien sans FC. */
function ZoneBar({ shares }: { shares: number[] | null }) {
  if (!shares || shares.every((s) => !s)) return null;
  return (
    <div style={{ display: "flex", height: 4, borderRadius: 2, overflow: "hidden", background: C.s2 }} aria-label="Temps par zone">
      {shares.map((s, i) => (s > 0 ? <span key={i} style={{ width: `${s}%`, background: zoneColor(i + 1, shares.length) }} /> : null))}
    </div>
  );
}

/** Source de l'activité : « Garmin Forerunner 265 » (règle Garmin), « Garmin » seul en colonne étroite. */
function Source({ card, narrow }: { card: PlanningCardModel; narrow: boolean }) {
  if (!card.attribution) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, ...MONO, fontSize: 11, color: C.tx2, minWidth: 0 }} title={card.attribution}>
      <Watch size={12} strokeWidth={1.5} aria-hidden style={{ flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{narrow ? card.brand : card.attribution}</span>
    </span>
  );
}
