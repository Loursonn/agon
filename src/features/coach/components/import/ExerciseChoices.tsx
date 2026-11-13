/**
 * Choix des exercices de la bibliothèque pendant un import texte :
 * nom identique → lié ; noms proches → le coach choisit ; sinon → créé.
 */
import { useMemo, useState } from "react";
import { C } from "@/lib/theme";
import { matchExercise, nameKey, type ExerciseMatch, type LibraryExercise } from "@/lib/import/yoxx/matchExercise";
import { useExerciseLibrary, useCreateExercises } from "@/features/shared/hooks/useExerciseLibrary";
import { mono } from "./importTextStyles";
import { CREATE, useExerciseChoices } from "./useExerciseChoices";



export function ExerciseChoiceList({ choices }: { choices: ReturnType<typeof useExerciseChoices> }) {
  const { matches, choiceFor, setChoice } = choices;
  if (matches.size === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {[...matches.entries()].map(([key, { name, match }]) => {
        if (match.exact) {
          return (
            <ChoiceRow key={key} color={C.g} badge="Lié">
              <span style={{ color: C.tx }}>{match.exact.name}</span>
            </ChoiceRow>
          );
        }
        if (match.candidates.length === 0) {
          return (
            <ChoiceRow key={key} color={C.b} badge="Créé">
              <span style={{ color: C.tx }}>{name}</span>
              <span style={{ color: C.tx3 }}> — aucun nom proche, sera ajouté à ta bibliothèque</span>
            </ChoiceRow>
          );
        }
        return (
          <ChoiceRow key={key} color={C.o} badge="À choisir">
            <div style={{ color: C.tx, marginBottom: 4 }}>{name}</div>
            <select
              value={choiceFor(name)}
              onChange={(e) => setChoice(name, e.target.value)}
              style={{ width: "100%", background: C.bg, color: C.tx, border: `1px solid ${C.brdL}`, borderRadius: 4, padding: "4px 6px", fontSize: 12, fontFamily: "inherit" }}
            >
              {match.candidates.map((c) => (
                <option key={c.exercise.id} value={c.exercise.id}>→ {c.exercise.name}</option>
              ))}
              <option value={CREATE}>＋ Créer « {name} »</option>
            </select>
          </ChoiceRow>
        );
      })}
    </div>
  );
}

export function ChoiceRow({ color, badge, children }: { color: string; badge: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "6px 8px", borderRadius: 4, borderLeft: `3px solid ${color}`, background: color + "0F", fontSize: 12 }}>
      <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 4, background: color + "22", color, flexShrink: 0, marginTop: 1, fontFamily: mono }}>
        {badge}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
