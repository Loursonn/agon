import { useState } from "react";
import { C } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { getAllPRs } from "@/lib/calculations";

export default function DataManager() {
  const {
    exos, setExos, sets, setSets, sessions, setSessions,
    completedSessions, setCompletedSessions, athleteNotes, setAthleteNotes,
    blockHistory, setBlockHistory, exMeta, setExMeta,
    setWellness, setWellnessHistory, setWeightLog, setInjuries,
    injuries, weeksArr,
  } = useAthleteContext();
  const [confirm, setConfirm] = useState<string | null>(null);

  const section = (title: string, desc: string | null, items: Array<{ label: string; detail?: string; action: () => void; key: string }>) => (
    <div style={{ background: C.s1, borderRadius: 6, padding: "12px 16px", border: "1px solid " + C.brd, marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.r, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>{title}</div>
      {desc && <div style={{ fontSize: 10, color: C.tx3, marginBottom: 10 }}>{desc}</div>}
      {items.length === 0 && <div style={{ fontSize: 11, color: C.tx3, textAlign: "center", padding: "8px 0" }}>Aucune donnée</div>}
      {items.map(({ label, detail, action, key }) => (
        <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid " + C.brd }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
            {detail && <div style={{ fontSize: 10, color: C.tx3 }}>{detail}</div>}
          </div>
          {confirm === key ? (
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button onClick={() => setConfirm(null)} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>Non</button>
              <button onClick={() => { action(); setConfirm(null); }} style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: C.rV, color: "#0E0C0A", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Confirmer</button>
            </div>
          ) : (
            <button onClick={() => setConfirm(key)} style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid " + C.r + "40", background: C.rS, color: C.r, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>Supprimer</button>
          )}
        </div>
      ))}
    </div>
  );

  const totalExos = Object.values(exos).flat().length;
  const totalLogs = Object.values(sets).flat().filter((s: unknown) => (s as { done?: boolean }).done).length;
  const totalCompleted = Object.values(completedSessions).flat().length;

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Gestion des données</div>
      <div style={{ fontSize: 12, color: C.tx2, marginBottom: 16 }}>Supprimer sélectivement des données</div>
      <div style={{ background: C.s1, borderRadius: 6, padding: "12px 16px", border: "1px solid " + C.brd, marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>Résumé</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[{ l: "Séances", v: sessions.length, c: C.coach }, { l: "Exercices", v: totalExos, c: C.ac }, { l: "Séries logguées", v: totalLogs, c: C.g }, { l: "Blocs archivés", v: (blockHistory || []).length, c: C.b }].map(({ l, v, c }) => (
            <div key={l} style={{ background: C.s2, borderRadius: 4, padding: "8px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: c }}>{v}</div>
              <div style={{ fontSize: 9, color: C.tx3 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      {section("Séances du bloc", "Supprimer une séance et ses exercices",
        sessions.map((s, i) => ({
          key: "sess_" + s.id, label: s.name + " (" + s.short + ")", detail: (exos[s.id] || []).length + " exercices",
          action: () => { setSessions((p: typeof sessions) => p.filter((_, idx) => idx !== i)); setExos((p: typeof exos) => { const n = { ...p }; delete n[s.id]; return n; }); },
        }))
      )}
      {section("Logs d'entraînement", "Supprimer les données de séances réalisées",
        weeksArr.map(w => ({
          key: "logs_w" + w, label: "Semaine " + w, detail: (completedSessions[w] || []).length + " séances validées",
          action: () => {
            const newSets = { ...sets }; Object.keys(newSets).forEach(k => { if (k.endsWith("_" + w)) delete newSets[k]; }); setSets(newSets);
            setCompletedSessions({ ...completedSessions, [w]: [] });
            const na = { ...athleteNotes }; Object.keys(na).forEach(k => { if (k.endsWith("_" + w)) delete na[k]; }); setAthleteNotes(na);
          },
        }))
      )}
      {section("Historique des blocs", "Supprimer des blocs archivés",
        (blockHistory || []).map((b, i) => ({
          key: "block_" + i, label: b.blockConfig?.blockName || "Bloc " + (i + 1),
          detail: new Date(b.archivedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }),
          action: () => setBlockHistory(blockHistory.filter((_, idx) => idx !== i)),
        }))
      )}
      {section("Nettoyage rapide", "Effacer des données par catégorie", [
        { key: "all_logs", label: "Tous les logs du bloc", detail: totalLogs + " séries + " + totalCompleted + " séances validées", action: () => { setSets({}); setCompletedSessions({} as Record<number, string[]>); setAthleteNotes({}); } },
        { key: "all_wellness", label: "Wellness & poids", detail: "Score du jour + historique poids", action: () => { setWellness(null); setWellnessHistory({}); setWeightLog({}); } },
        { key: "all_injuries", label: "Toutes les blessures", detail: (injuries || []).length + " blessure(s)", action: () => setInjuries([]) },
      ])}
    </div>
  );
}
