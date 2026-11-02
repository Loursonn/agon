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

const ghostBtn: React.CSSProperties = {
  padding: "6px 10px", minHeight: 32, borderRadius: 4, border: "1px solid " + C.brdL,
  background: "transparent", color: C.tx2, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
};

function CoachRow({ name, tag, action }: { name: string; tag: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: C.s1, border: "1px solid " + C.brd, borderRadius: 6, padding: "10px 12px" }}>
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>{name}</div>
        <div style={{ fontSize: 11, color: C.tx3 }}>{tag}</div>
      </div>
      {action}
    </div>
  );
}

export function CoCoachPanel({
  athleteId,
  athleteName,
  mode,
}: {
  athleteId: string;
  athleteName: string;
  mode: "coach" | "athlete";
}) {
  const { user, refreshAthletes } = useAuth();
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

  const onAdd = () => {
    if (!code.trim()) return;
    add.mutate(
      { athleteId, coachCode: code },
      {
        onSuccess: async (res) => {
          setCode("");
          toast.success(`${res.full_name} est maintenant co-coach`, {
            description: "Les deux coachs voient et modifient les mêmes entraînements.",
          });
          if (mode === "coach") await refreshAthletes();
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
          if (mode === "coach") {
            await refreshAthletes();
            if (iAmCoCoach) navigate("/coach/athletes");
          }
        },
        onError: (e) => toast.error("Retrait impossible", { description: e.message }),
      },
    );
  };

  if (isLoading) return <div style={{ fontSize: 13, color: C.tx3 }}>Chargement…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12, color: C.tx3, lineHeight: 1.6 }}>
        {mode === "coach"
          ? `Deux coachs maximum. Ils ont les mêmes droits : chacun voit, crée et modifie tous les entraînements de ${athleteName}. Ce que l'un change, l'autre le voit.`
          : "Tu peux être suivi par deux coachs. Ils ont les mêmes droits sur tes entraînements et reçoivent tous les deux tes retours."}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {referent && (
          <CoachRow
            name={referent.id === me ? "Toi" : referent.full_name}
            tag={selfCoached ? "Coach référent · autocoaché" : "Coach référent"}
          />
        )}
        {coCoach && (
          <CoachRow
            name={coCoach.id === me ? "Toi" : coCoach.full_name}
            tag={`Co-coach · ajouté par ${coCoach.added_by_role === "athlete" ? "l'athlète" : "le coach"} le ${new Date(coCoach.created_at).toLocaleDateString("fr-FR")}`}
            action={canRemove && (
              <button onClick={onRemove} disabled={remove.isPending} style={ghostBtn}>
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
      </div>

      {canAdd && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter") onAdd(); }}
            placeholder="Code du 2e coach"
            maxLength={12}
            aria-label="Code coach du second coach"
            style={{ flex: 1, minWidth: 150, maxWidth: 220, padding: "9px 12px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 13, fontFamily: "inherit", letterSpacing: "1px" }}
          />
          <button
            onClick={onAdd}
            disabled={add.isPending || !code.trim()}
            style={{ padding: "9px 16px", borderRadius: 4, border: "none", background: C.ac, color: "#0E0C0A", fontWeight: 700, fontSize: 12, cursor: add.isPending ? "wait" : "pointer", fontFamily: "inherit", opacity: code.trim() ? 1 : 0.5 }}
          >
            Ajouter un co-coach
          </button>
        </div>
      )}
    </div>
  );
}

