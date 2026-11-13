/**
 * Coachs d'un athlète : coach référent + co-coach éventuel (2 max).
 *  - mode `coach` : vu par le référent (ajoute / retire le co-coach) ou par le
 *    co-coach (peut se retirer) ;
 *  - mode `athlete` : l'athlète voit ses coachs, ajoute un 2e coach par son
 *    code, ou le retire.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import { useAddCoCoach, useAthleteCoaches, useRemoveCoCoach } from "../hooks/useCoCoach";
import { Avatar, ORDI_CARD, Pill, SectionHead, btnStyle, frDate } from "./ordi/OrdiUi";

function CoachCard({ name, isMe, tag, line, color, badge, action }: {
  name: string; isMe: boolean; tag?: string; line: string; color: string; badge?: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div style={{ ...ORDI_CARD, padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Avatar name={name} color={color} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: C.tx }}>{name}</span>
            {isMe && <Pill color={C.tx2}>Toi</Pill>}
            {tag && <Pill color={color} filled>{tag}</Pill>}
          </div>
          <div style={{ fontSize: 12.5, color: C.tx3, marginTop: 2 }}>{line}</div>
        </div>
        {badge}
        {action}
      </div>
    </div>
  );
}

export function CoCoachPanel({
  athleteId,
  athleteName,
  athleteFirstName,
  mode,
  sectionNumber,
}: {
  athleteId: string;
  athleteName: string;
  athleteFirstName?: string;
  mode: "coach" | "athlete";
  /** Numéro de rubrique (« 01 — Coachs · 2 / 2 », planche CoachOrdiBStaff). */
  sectionNumber?: number;
}) {
  const { user, profile, refreshAthletes } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading } = useAthleteCoaches(athleteId);
  const add = useAddCoCoach();
  const remove = useRemoveCoCoach();
  const [code, setCode] = useState("");

  const referent = data?.referent ?? null;
  const coCoach = data?.coCoach ?? null;
  const me = user?.id;
  const iAmReferent = !!referent && referent.id === me;
  const iAmCoCoach = !!coCoach && coCoach.id === me;
  const selfCoached = !!referent && referent.id === athleteId;

  // Qui peut ajouter : l'athlète lui-même, ou son coach référent
  const canAdd = !coCoach && !!referent && (mode === "athlete" || iAmReferent);
  // Qui peut retirer : référent, athlète, ou le co-coach lui-même
  const canRemove = !!coCoach && (mode === "athlete" || iAmReferent || iAmCoCoach);

  // Coach-athlète suivi par un autre coach : il peut se co-coacher lui-même
  const canAddSelf = canAdd && mode === "athlete" && athleteId === me
    && profile?.role === "coach_athlete" && !!profile.coach_code && referent?.id !== me;

  const onAdd = (coachCode = code) => {
    if (!coachCode.trim()) return;
    add.mutate(
      { athleteId, coachCode },
      {
        onSuccess: async (res) => {
          setCode("");
          toast.success(res.co_coach_id === me ? "Tu es maintenant co-coach de ton entraînement" : `${res.full_name} est maintenant co-coach`, {
            description: res.co_coach_id === me
              ? "Ton programme apparaît dans ton espace coach, à côté de ton coach référent."
              : "Les deux coachs voient et modifient les mêmes entraînements.",
          });
          // Liste d'athlètes (et accès à son propre programme côté coach)
          await refreshAthletes();
        },
        onError: (e) => toast.error("Ajout impossible", { description: e.message }),
      },
    );
  };

  const onRemove = () => {
    if (!coCoach) return;
    const question = iAmCoCoach
      ? `Ne plus co-coacher ${athleteName} ? Tu perdras l'accès à ses entraînements.`
      : `Retirer ${coCoach.full_name} ? Il n'aura plus accès aux entraînements${mode === "athlete" ? "" : ` de ${athleteName}`}.`;
    if (!window.confirm(question)) return;
    remove.mutate(
      { athleteId },
      {
        onSuccess: async () => {
          toast.success(iAmCoCoach ? "Tu ne co-coaches plus cet athlète" : "Co-coach retiré");
          await refreshAthletes();
          if (mode === "coach" && iAmCoCoach) navigate("/coach/athletes");
        },
        onError: (e) => toast.error("Retrait impossible", { description: e.message }),
      },
    );
  };

  if (isLoading) return <div style={{ fontSize: 13, color: C.tx3 }}>Chargement…</div>;

  const first = athleteFirstName || athleteName;
  const count = (referent ? 1 : 0) + (coCoach ? 1 : 0);
  const addedBy = (c: NonNullable<typeof coCoach>) =>
    c.added_by_role === "athlete" ? (mode === "athlete" ? "toi" : first) : iAmReferent ? "toi" : "le coach référent";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {(() => {
        const hint = mode === "coach"
          ? `Les deux coachs voient, créent et modifient tous les entraînements de ${first}. Ce que l'un change, l'autre le voit.`
          : "Tu peux être suivi par deux coachs. Ils ont les mêmes droits sur tes entraînements et reçoivent tous les deux tes retours.";
        return sectionNumber != null
          ? <SectionHead n={sectionNumber} title={`Coachs · ${count} / 2`} right="Deux coachs maximum" hint={hint} />
          : <div style={{ fontSize: 13, color: C.tx3, lineHeight: 1.5 }}>{hint}</div>;
      })()}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 14 }}>
        {referent && (
          <CoachCard
            name={referent.full_name}
            isMe={referent.id === me}
            color={C.ac}
            line={selfCoached
              ? "Coach référent · autocoaché"
              : mode === "coach" ? `Coach référent · seul à pouvoir délier ${first} de son compte` : "Coach référent"}
            badge={<Pill color={C.ac} filled>Référent</Pill>}
          />
        )}
        {coCoach && (
          <CoachCard
            name={coCoach.full_name}
            isMe={coCoach.id === me}
            color={C.pat}
            tag="Co-coach"
            line={`Ajouté par ${addedBy(coCoach)} le ${frDate(coCoach.created_at)} · mêmes droits${iAmReferent ? " que toi" : ""}`}
            action={canRemove && (
              <button onClick={onRemove} disabled={remove.isPending} style={btnStyle("danger", "sm", remove.isPending)}>
                {iAmCoCoach ? "Ne plus co-coacher" : "Retirer"}
              </button>
            )}
          />
        )}
        {!referent && (
          <div style={{ fontSize: 13, color: C.tx3 }}>
            {mode === "athlete" ? "Rejoins d'abord un coach pour pouvoir en ajouter un second." : "Aucun coach."}
          </div>
        )}
        {canAdd && (
          <div style={{ ...ORDI_CARD, padding: "18px 20px", background: "transparent", borderStyle: "dashed", borderColor: C.brdL, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") onAdd(); }}
              placeholder="Code du 2e coach"
              maxLength={12}
              aria-label="Code coach du second coach"
              style={{ flex: 1, minWidth: 140, height: 36, boxSizing: "border-box", padding: "0 12px", borderRadius: 10, border: `1px solid ${C.brdL}`, background: C.s2, color: C.tx, fontSize: 13, fontFamily: "inherit", letterSpacing: "1px" }}
            />
            <button
              onClick={() => onAdd()}
              disabled={add.isPending || !code.trim()}
              style={btnStyle("primary", "md", add.isPending || !code.trim())}
            >
              Ajouter un co-coach
            </button>
            {canAddSelf && (
              <button
                onClick={() => onAdd(profile?.coach_code ?? "")}
                disabled={add.isPending}
                title="Programmer ton entraînement en duo avec ton coach"
                style={{ ...btnStyle("ghost"), color: C.coach, borderColor: C.coach + "50" }}
              >
                M'ajouter comme 2e coach
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
