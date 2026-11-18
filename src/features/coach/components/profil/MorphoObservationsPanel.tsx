/**
 * Onglet « Observations » du bloc Mensurations & photos : ce que le coach
 * juge à l'œil (abdomen, clavicules, cage, coude) et la carte musculaire
 * (muscle long ou court, d'après les photos). Enregistré au clic.
 */
import { useState, type ReactNode } from "react";
import { C, alpha } from "@/lib/theme";
import { MUSCLES, type Length, type MuscleKey } from "@/lib/morpho";
import { useMorphoObservations } from "./useMorphoObservations";

const LONG = C.b;
const COURT = C.o;

function Choice<T extends string>({ value, options, onChange }: {
  value: T | null; options: { v: T; label: string; color?: string }[]; onChange: (v: T | null) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1">
      {options.map((o) => {
        const on = value === o.v;
        const col = o.color ?? C.ac;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(on ? null : o.v)}
            className="cursor-pointer rounded-full px-2.5 py-1 font-[inherit] text-[12px]"
            style={{ border: "1px solid " + (on ? col : C.brdL), background: on ? alpha(col, 0.18) : "transparent", color: on ? C.tx : C.tx2 }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-[8px] border border-agon-brd px-2.5 py-2">
      <div className="min-w-0 flex-[1_1_200px]">
        <div className="text-[13px] text-agon-tx">{label}</div>
        <div className="text-[11.5px] leading-snug text-agon-tx3">{hint}</div>
      </div>
      {children}
    </div>
  );
}

const LEN: { v: Length; label: string; color: string }[] = [
  { v: "long", label: "Long", color: LONG },
  { v: "court", label: "Court", color: COURT },
];

export function MorphoObservationsPanel({ athleteId }: { athleteId: string }) {
  const { obs, update } = useMorphoObservations(athleteId);
  const [zone, setZone] = useState<"squelette" | "haut" | "bras" | "bas">("squelette");
  const setMuscle = (k: MuscleKey, v: Length | null) => {
    const muscles = { ...obs.muscles };
    if (v) muscles[k] = v; else delete muscles[k];
    update({ muscles });
  };
  const filled = [obs.abdomen, obs.clavicules, obs.cage, obs.coude_valgus].filter(Boolean).length + Object.keys(obs.muscles).length;

  return (
    <div className="flex flex-col gap-3" data-testid="morpho-observations">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {([["squelette", "Squelette"], ["haut", "Haut du corps"], ["bras", "Bras"], ["bas", "Bas du corps"]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setZone(k)}
              className="cursor-pointer rounded-full px-3 py-1 font-[inherit] text-[12px]"
              style={{ border: "1px solid " + (zone === k ? C.ac : C.brdL), background: zone === k ? alpha(C.ac, 0.14) : "transparent", color: zone === k ? C.tx : C.tx2 }}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-[11.5px] text-agon-tx3">{filled} / 18 renseignés · à remplir d'après les photos</span>
      </div>

      {zone === "squelette" ? (
        <div className="flex flex-col gap-1.5">
          <Row label="Abdomen" hint="Bas des pecs → bas des abdos, comparé à bas des pecs → clavicule">
            <Choice value={obs.abdomen} options={[{ v: "long", label: "Long", color: LONG }, { v: "court", label: "Court", color: COURT }]} onChange={(v) => update({ abdomen: v })} />
          </Row>
          <Row label="Clavicules" hint="Verticale depuis les acromions : plus larges que le bassin = longues">
            <Choice value={obs.clavicules} options={[{ v: "longues", label: "Longues", color: LONG }, { v: "courtes", label: "Courtes", color: COURT }]} onChange={(v) => update({ clavicules: v })} />
          </Row>
          <Row label="Cage thoracique" hint="De profil, torse bombé : la verticale du nez touche le sternum = épaisse">
            <Choice value={obs.cage} options={[{ v: "epaisse", label: "Épaisse", color: LONG }, { v: "etroite", label: "Étroite", color: COURT }]} onChange={(v) => update({ cage: v })} />
          </Row>
          <Row label="Valgus du coude" hint="Position anatomique : la ligne épaule → majeur dévie ?">
            <Choice value={obs.coude_valgus} options={[{ v: "aucun", label: "Aucun" }, { v: "modere", label: "Modéré" }, { v: "marque", label: "Marqué" }]} onChange={(v) => update({ coude_valgus: v })} />
          </Row>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {MUSCLES.filter((m) => m.zone === zone).map((m) => {
            const val = obs.muscles[m.key] ?? null;
            return (
              <Row key={m.key} label={`${m.label} · ${m.pose}`} hint={`Long si ${m.long} · court si ${m.court}`}>
                <Choice value={val} options={LEN} onChange={(v) => setMuscle(m.key, v)} />
              </Row>
            );
          })}
        </div>
      )}
    </div>
  );
}
