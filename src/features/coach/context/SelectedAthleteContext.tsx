import { createContext, useContext } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { Profile } from "@/hooks/useAuth";

interface SelectedAthleteContextValue {
  selectedAthleteId: string | null;
  selectedAthlete: Profile | null;
  isOwnView: boolean;
  setSelectedAthlete: (id: string) => void;
}

const Ctx = createContext<SelectedAthleteContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useSelectedAthlete() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSelectedAthlete must be used inside SelectedAthleteProvider");
  return ctx;
}

export function SelectedAthleteProvider({ children }: { children: React.ReactNode }) {
  const { athleteId } = useParams<{ athleteId: string }>();
  const { athletes, hiddenAthletes, user, profile } = useAuth();
  const navigate = useNavigate();

  const selectedAthleteId = athleteId ?? null;
  const isOwnView = selectedAthleteId === user?.id;
  const selectedAthlete: Profile | null = isOwnView
    ? profile
    : ([...athletes, ...hiddenAthletes].find((a) => a.id === selectedAthleteId) ?? null);

  const setSelectedAthlete = (id: string) => {
    navigate(`/coach/athletes/${id}/planning`);
  };

  return (
    <Ctx.Provider value={{ selectedAthleteId, selectedAthlete, isOwnView, setSelectedAthlete }}>
      {children}
    </Ctx.Provider>
  );
}
