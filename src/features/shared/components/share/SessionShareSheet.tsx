import { useEffect, useMemo, useRef, useState } from "react";
import { C, alpha } from "@/lib/theme";
import { DISPLAY, MONO, buttonStyle } from "@/features/shared/components/seance/seanceUi";
import { useOptionalAthleteContext } from "@/features/shared/context/AthleteContext";
import { useAthleteCoaches } from "@/features/shared/hooks/useCoCoach";
import {
  coachLabel, DEFAULT_SHARE_OPTIONS, defaultObjectiveId, firstNameOf, objectiveChoices, shareObjective,
  type ShareCard, type ShareOptions,
} from "@/lib/share/sessionShare";
import { useCompetitionList } from "@/features/shared/hooks/useCompetitionList";
import { localIsoDay } from "@shared/domain/dates";
import { CARD_H, CARD_W } from "@/lib/share/shareLayout";
import { drawSessionShare, loadSessionShareFonts, sessionShareBlob, shareFileName } from "./sessionShareCanvas";

/** Ce que la carte a besoin de savoir sur l'athlète et son coach. */
export interface SharePeople {
  athleteFirstName: string | null;
  coach: string | null;
}

export interface ShareVariant {
  key: "planned" | "done";
  build: (opts: ShareOptions, people: SharePeople) => ShareCard;
}

interface Props {
  /** Prévue et/ou faite ; s'il y a les deux, un sélecteur permet de choisir. */
  variants: ShareVariant[];
  initial?: "planned" | "done";
  /** Jour de la séance (nom du fichier). */
  day: string | null;
  /** Séance de musculation : propose de masquer les charges. */
  hasLoads?: boolean;
  /** Fin de séance : « Bravo », et « Plus tard » au lieu de fermer. */
  celebrate?: boolean;
  onClose: () => void;
}

type Nav = Navigator & { canShare?: (d: ShareData) => boolean };

/**
 * « Partager ma séance » (maquette du 25/11/2026) : story 9:16, séance prévue
 * ou faite, prénom / charges / coach au choix. L'image est créée sur le
 * téléphone ; « Partager » ouvre la feuille de partage du système (Instagram,
 * WhatsApp, Messages…), sinon l'image est enregistrée.
 */
/**
 * Au-dessus de tout l'écran athlète (bandeau « Séance non terminée », barre
 * d'onglets, invite de mise à jour à 1000), sous les toasts.
 */
export const SHARE_Z = 1100;

export function SessionShareSheet({ variants, initial, day, hasLoads = false, celebrate = false, onClose }: Props) {
  const ctx = useOptionalAthleteContext();
  const athleteId = ctx?.athleteId ?? null;
  const athleteProfile = ctx?.athleteProfile ?? null;
  const { data: coaches } = useAthleteCoaches(athleteId);
  const { data: competitions } = useCompetitionList(athleteId);
  const [which, setWhich] = useState<"planned" | "done">(
    initial && variants.some((v) => v.key === initial) ? initial : variants[variants.length - 1]?.key ?? "done",
  );
  const [opts, setOpts] = useState<ShareOptions>(DEFAULT_SHARE_OPTIONS);
  const [fontsReady, setFontsReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Image prête d'avance : iOS n'ouvre la feuille de partage que si l'appel
  // suit directement le toucher (pas d'attente de génération entre les deux).
  const fileRef = useRef<File | null>(null);

  const people: SharePeople = useMemo(() => ({
    athleteFirstName: firstNameOf(athleteProfile?.first_name, athleteProfile?.full_name),
    coach: coachLabel(coaches?.referent?.full_name),
  }), [athleteProfile?.first_name, athleteProfile?.full_name, coaches?.referent?.full_name]);

  // Objectif : compte à rebours vers une compétition choisie par l'athlète,
  // depuis le jour de la séance. Masqué par défaut (Hugo, 25/11).
  const refDay = day ?? localIsoDay();
  const choices = useMemo(() => objectiveChoices(competitions, refDay), [competitions, refDay]);
  const [objectiveOn, setObjectiveOn] = useState(false);
  const [objectiveId, setObjectiveId] = useState<string | null>(null);
  const chosen = choices.find((c) => c.id === objectiveId) ?? choices.find((c) => c.id === defaultObjectiveId(choices)) ?? null;
  const objective = useMemo(
    () => (objectiveOn && chosen ? shareObjective(chosen, refDay) : null),
    [objectiveOn, chosen, refDay],
  );

  const variant = variants.find((v) => v.key === which) ?? variants[0];
  const card = useMemo(() => {
    try {
      const c = variant ? variant.build(opts, people) : null;
      return c ? { ...c, objective } : null;
    } catch { return null; }
  }, [variant, opts, people, objective]);

  useEffect(() => {
    let alive = true;
    loadSessionShareFonts().then(() => { if (alive) setFontsReady(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const cv = canvasRef.current;
    fileRef.current = null;
    if (!cv || !card || !fontsReady) return;
    if (!drawSessionShare(cv, card)) return;
    let alive = true;
    void sessionShareBlob(cv).then((b) => {
      if (alive && b) fileRef.current = new File([b], shareFileName(day), { type: "image/png" });
    });
    return () => { alive = false; };
  }, [card, fontsReady, day]);

  // Échap ferme la feuille.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const currentFile = async (): Promise<File | null> => {
    if (fileRef.current) return fileRef.current;
    const cv = canvasRef.current;
    if (!cv) return null;
    const b = await sessionShareBlob(cv);
    return b ? new File([b], shareFileName(day), { type: "image/png" }) : null;
  };

  const download = (file: File) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const save = async () => {
    setError(null);
    const f = await currentFile();
    if (f) download(f); else setError("L'image n'a pas pu être créée.");
  };

  const share = async () => {
    setError(null);
    const nav = navigator as Nav;
    const ready = fileRef.current;
    if (ready && nav.share && nav.canShare?.({ files: [ready] })) {
      setBusy(true);
      try {
        await nav.share({ files: [ready] });
      } catch (e) {
        // Annulé par l'athlète : rien à dire. Autre refus : on enregistre l'image.
        if ((e as DOMException)?.name !== "AbortError") download(ready);
      } finally {
        setBusy(false);
      }
      return;
    }
    await save();
  };

  const toggles: Array<{ key: keyof ShareOptions; label: string; show: boolean }> = [
    { key: "showName", label: "Mon prénom", show: !!people.athleteFirstName },
    { key: "showLoads", label: "Les charges", show: hasLoads },
    { key: "showCoach", label: "Mon coach", show: !!people.coach },
  ];
  const visibleToggles = toggles.filter((t) => t.show);
  const ready = fontsReady && !!card;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: SHARE_Z }} />
      <div role="dialog" aria-modal="true" aria-label="Partager ma séance"
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: SHARE_Z + 1, maxWidth: 480, margin: "0 auto",
          borderRadius: "24px 24px 0 0", borderTop: `1px solid ${alpha(C.ac, 0.5)}`, background: C.s1,
          maxHeight: "94dvh", overflowY: "auto", overscrollBehavior: "contain",
        }}>
        <div style={{ padding: "12px 20px max(24px, env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 14 }}>
          <button type="button" onClick={onClose} aria-label="Fermer"
            style={{ alignSelf: "center", width: 36, height: 4, padding: 0, border: "none", borderRadius: 2, background: alpha(C.tx2, 0.25), cursor: "pointer" }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 4, textAlign: "center" }}>
            {celebrate && (
              <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.ac }}>Séance terminée</span>
            )}
            <h2 style={{ margin: 0, ...DISPLAY, fontWeight: 500, fontSize: 21, letterSpacing: "0.04em", color: C.tx }}>
              {celebrate ? "Bravo !" : "Partager ma séance"}
            </h2>
            {celebrate && (
              <span style={{ fontSize: 13.5, color: C.tx2 }}>Partage-la en story ou à tes proches.</span>
            )}
          </div>

          {variants.length > 1 && (
            <div role="radiogroup" aria-label="Version" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 3, borderRadius: 12, background: C.s2 }}>
              {variants.map((v) => {
                const on = v.key === which;
                return (
                  <button key={v.key} type="button" role="radio" aria-checked={on} onClick={() => setWhich(v.key)}
                    style={{
                      height: 38, borderRadius: 9, border: `1px solid ${on ? alpha(C.ac, 0.45) : "transparent"}`,
                      background: on ? alpha(C.ac, 0.12) : "transparent", color: on ? C.tx : C.tx2,
                      fontFamily: "inherit", fontSize: 13.5, cursor: "pointer",
                    }}>
                    {v.key === "planned" ? "Prévue" : "Faite"}
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ alignSelf: "center", position: "relative", height: "min(50dvh, 440px)", aspectRatio: `${CARD_W} / ${CARD_H}`, maxWidth: "100%" }}>
            <canvas ref={canvasRef} aria-label="Aperçu de l'image à partager"
              style={{ width: "100%", height: "100%", borderRadius: 12, border: `1px solid ${C.brdL}`, background: C.bg, display: "block" }} />
            {!ready && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: C.tx2, fontSize: 13 }}>
                {card ? "Préparation…" : "Aperçu indisponible"}
              </div>
            )}
          </div>

          {(visibleToggles.length > 0 || choices.length > 0) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {[...visibleToggles.map((t) => ({ key: t.key as string, label: t.label, on: opts[t.key], toggle: () => setOpts((o) => ({ ...o, [t.key]: !o[t.key] })) })),
                ...(choices.length > 0 ? [{ key: "objective", label: "Mon objectif", on: objectiveOn, toggle: () => setObjectiveOn((v) => !v) }] : []),
              ].map((t) => {
                const on = t.on;
                return (
                  <button key={t.key} type="button" role="switch" aria-checked={on}
                    onClick={t.toggle}
                    style={{
                      minHeight: 36, padding: "0 14px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontSize: 13,
                      display: "inline-flex", alignItems: "center", gap: 7,
                      border: `1px solid ${on ? alpha(C.ac, 0.5) : C.brdL}`, background: on ? alpha(C.ac, 0.12) : "transparent",
                      color: on ? C.tx : C.tx2,
                    }}>
                    <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, background: on ? C.ac : "transparent", border: `1px solid ${on ? C.ac : C.tx3}` }} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          )}

          {objectiveOn && choices.length > 1 && (
            <div role="radiogroup" aria-label="Compétition visée" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, scrollbarWidth: "none" }}>
              {choices.map((c) => {
                const on = c.id === chosen?.id;
                const o = shareObjective(c, refDay);
                return (
                  <button key={c.id} type="button" role="radio" aria-checked={on} onClick={() => setObjectiveId(c.id)}
                    style={{
                      flex: "none", maxWidth: 220, minHeight: 36, padding: "0 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5,
                      border: `1px solid ${on ? alpha(C.ac, 0.5) : C.brdL}`, background: on ? alpha(C.ac, 0.12) : "transparent", color: on ? C.tx : C.tx2,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                    <span style={{ ...MONO, color: on ? C.ac : C.tx3 }}>{o?.countdown}</span> · {c.name}
                  </button>
                );
              })}
            </div>
          )}

          {error && <span role="alert" style={{ fontSize: 12.5, color: C.r, textAlign: "center" }}>{error}</span>}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 10 }}>
            <button type="button" onClick={save} disabled={!ready} style={{ ...buttonStyle("ghost", !ready), height: 48, borderRadius: 12, fontSize: 14.5 }}>
              Enregistrer
            </button>
            <button type="button" onClick={share} disabled={!ready || busy} style={{ ...buttonStyle("primary", !ready || busy), height: 48, borderRadius: 12, fontSize: 14.5 }}>
              Partager…
            </button>
          </div>
          {celebrate && (
            <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: C.tx2, fontFamily: "inherit", fontSize: 13.5, minHeight: 40, cursor: "pointer" }}>
              Plus tard
            </button>
          )}
          <span style={{ fontSize: 11.5, color: C.tx3, lineHeight: 1.5, textAlign: "center" }}>
            Image créée sur ton téléphone, rien n'est envoyé.
          </span>
        </div>
      </div>
    </>
  );
}

/** Petit bouton « Partager » (icône) pour les en-têtes de séance. */
export function ShareIconButton({ onClick, label = "Partager ma séance", size = 36 }: { onClick: () => void; label?: string; size?: number }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      style={{
        width: size, height: size, flex: "none", borderRadius: 10, border: `1px solid ${C.brdL}`, background: "transparent",
        color: C.tx, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
      }}>
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3v12" />
        <path d="m7 8 5-5 5 5" />
        <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
      </svg>
    </button>
  );
}
