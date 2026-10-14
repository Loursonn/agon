import { useState } from "react";
import { C } from "@/lib/theme";
import { useNavigate } from "react-router-dom";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { ExerciseBank } from "@/components/coach/ExerciseBank";
import EnergyExerciseBank from "@/components/coach/EnergyExerciseBank";

export default function BanquePage() {
  const [banqueSubTab, setBanqueSubTab] = useState("muscu");
  const [bankAddEx, setBankAddEx] = useState<null | { name: string; bloc?: string; target?: string; ex_type?: string; id: string }>(null);
  const [bankAddMsg, setBankAddMsg] = useState("");
  const navigate = useNavigate();
  const { athleteId, sessions, setExos, exos } = useAthleteContext();

  const handleBankAdd = (ex: typeof bankAddEx & object) => {
    if (!ex) return;
    if (sessions.length === 0) {
      setBankAddMsg("Crée un bloc programme d'abord (onglet Prog)");
      setTimeout(() => setBankAddMsg(""), 3000);
      return;
    }
    const makeEx = (sid: string) => ({ id: "g_" + Date.now(), name: ex.name, bloc: ex.bloc || "ESTH", target: ex.target || "Pecs", exType: ex.ex_type || "muscu", exercise_id: ex.id, weeks: { 1: { kg: 0, sets: 3, repsRange: "10", rir: 2 } } });
    if (sessions.length === 1) {
      const sid = sessions[0].id;
      setExos((prev: typeof exos) => ({ ...prev, [sid]: [...(prev[sid] || []), makeEx(sid)] }));
      navigate("../prog");
      setBankAddMsg("Ajouté à " + sessions[0].name + " !");
      setTimeout(() => setBankAddMsg(""), 2500);
    } else setBankAddEx(ex as typeof bankAddEx);
  };

  return (
    <>
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid " + C.brd, marginBottom: 16 }}>
        {[{ k: "muscu", l: "Musculation" }, { k: "energie", l: "Énergétique" }].map(t => (
          <button key={t.k} onClick={() => setBanqueSubTab(t.k)} style={{ padding: "9px 18px", border: "none", borderBottom: "2px solid " + (banqueSubTab === t.k ? C.coach : "transparent"), background: "transparent", color: banqueSubTab === t.k ? C.coach : C.tx3, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase" as const, letterSpacing: "0.3px" }}>{t.l}</button>
        ))}
      </div>

      {banqueSubTab === "muscu" && (
        <>
          <ExerciseBank coachId={athleteId} onAddToExos={handleBankAdd} />
          {bankAddMsg && <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", zIndex: 250, background: C.gV, color: "#0E0C0A", borderRadius: 6, padding: "10px 20px", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>{bankAddMsg}</div>}
        </>
      )}
      {banqueSubTab === "energie" && <EnergyExerciseBank coachId={athleteId} C={C} />}

      {bankAddEx && sessions.length > 1 && (
        <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setBankAddEx(null)}>
          <div style={{ width: "100%", maxWidth: 640, background: C.s1, borderRadius: "6px 6px 0 0", padding: 24 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Ajouter à quelle séance ?</div>
            <div style={{ fontSize: 12, color: C.tx3, marginBottom: 16 }}>{bankAddEx.name}</div>
            {sessions.map(s => (
              <button key={s.id} onClick={() => {
                const newEx = { id: "g_" + Date.now(), name: bankAddEx!.name, bloc: bankAddEx!.bloc || "ESTH", target: bankAddEx!.target || "Pecs", exType: bankAddEx!.ex_type || "muscu", exercise_id: bankAddEx!.id, weeks: { 1: { kg: 0, sets: 3, repsRange: "10", rir: 2 } } };
                setExos((prev: typeof exos) => ({ ...prev, [s.id]: [...(prev[s.id] || []), newEx] }));
                setBankAddEx(null); navigate("../prog");
              }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2, marginBottom: 8, cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const }}>
                <div style={{ width: 32, height: 32, borderRadius: 4, background: C.acS, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: C.ac }}>{s.short || s.name.charAt(0)}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>{s.name}</div>
              </button>
            ))}
            <button onClick={() => setBankAddEx(null)} style={{ width: "100%", padding: "10px 0", borderRadius: 4, border: "none", background: "transparent", color: C.tx3, fontSize: 12, cursor: "pointer", fontFamily: "inherit", marginTop: 4 }}>Annuler</button>
          </div>
        </div>
      )}
    </>
  );
}
