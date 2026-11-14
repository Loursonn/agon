import { createContext, useContext, type ReactNode } from "react";

/**
 * Ce que la mise en page athlète prête aux en-têtes de page (maquettes) :
 * ouverture du menu (tiroir du profil), badges d'état, bascule « Mode Coach ».
 * `register` signale qu'une page dessine son propre en-tête : la barre
 * globale du haut se masque alors sur téléphone.
 */
export interface AthleteChrome {
  openMenu: () => void;
  onSwitchMode?: () => void;
  badges: ReactNode;
  register: () => () => void;
}

export const AthleteChromeContext = createContext<AthleteChrome | null>(null);

export function useAthleteChrome(): AthleteChrome | null {
  return useContext(AthleteChromeContext);
}
