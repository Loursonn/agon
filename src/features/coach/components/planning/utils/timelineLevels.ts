/** Niveaux de la frise de planning : libellés et classes Tailwind (couleurs = tokens). */

export type CreateLevel = "macrocycle" | "mesocycle" | "cycle" | "microcycle";
export type DrawerType = CreateLevel | "competition";

export interface LevelStyle {
  /** Texte coloré du niveau. */
  text: string;
  /** Fond plein du niveau (pastille, bouton). */
  solid: string;
  /** Fond doux + bordure du niveau (blocs de la frise). */
  block: string;
  /** Bordure haute épaisse d'un bloc. */
  top: string;
  /** Bordure discrète du niveau. */
  border: string;
  /** Fond doux d'un fil d'Ariane actif. */
  crumb: string;
}

export const LEVEL_STYLE: Record<DrawerType, LevelStyle> = {
  macrocycle: {
    text: "text-agon-accent", solid: "bg-agon-accent", block: "bg-agon-accent-doux border-agon-accent/50",
    top: "border-t-agon-accent", border: "border-agon-accent/50", crumb: "bg-agon-accent/20",
  },
  mesocycle: {
    text: "text-agon-coach", solid: "bg-agon-coach", block: "bg-agon-coach-doux border-agon-coach/50",
    top: "border-t-agon-coach", border: "border-agon-coach/50", crumb: "bg-agon-coach/20",
  },
  cycle: {
    text: "text-agon-alerte", solid: "bg-agon-alerte", block: "bg-agon-alerte-doux border-agon-alerte/50",
    top: "border-t-agon-alerte", border: "border-agon-alerte/50", crumb: "bg-agon-alerte/20",
  },
  microcycle: {
    text: "text-agon-tx3", solid: "bg-agon-tx3", block: "bg-agon-sable/10 border-agon-tx3/50",
    top: "border-t-agon-tx3", border: "border-agon-tx3/50", crumb: "bg-agon-tx3/20",
  },
  competition: {
    text: "text-agon-coach", solid: "bg-agon-coach", block: "bg-agon-coach-doux border-agon-coach/50",
    top: "border-t-agon-coach", border: "border-agon-coach/50", crumb: "bg-agon-coach/20",
  },
};

export const LEVEL_LABEL: Record<CreateLevel, string> = {
  macrocycle: "Macrocycle", mesocycle: "Mésocycle", cycle: "Cycle", microcycle: "Microcycle",
};

export const CREATE_LEVELS: CreateLevel[] = ["macrocycle", "mesocycle", "cycle", "microcycle"];

export interface ParentOption {
  id: string;
  label: string;
  /** Début du parent, utilisé comme repli. */
  start_date: string;
}

export interface SnapConflict {
  name: string;
  start_date: string;
  end_date: string;
}

export interface CreateState {
  level: CreateLevel;
  parentId?: string;
  /** Si présent : affiche un sélecteur de parent. */
  parentOptions?: ParentOption[];
  /** Tous les enfants de tous les parents (enchaînement automatique). */
  siblingItems?: Array<{ parentId: string; end_date: string }>;
  defaultStart: string;
  defaultEnd: string;
  /** Plancher dur : pas de chevauchement avec le frère précédent. */
  minStart?: string;
  /** Périodes du même niveau, pour détecter un chevauchement côté client. */
  existingSiblings?: Array<{ id: string; name: string; start_date: string; end_date: string; parentId: string }>;
  /** Décale le conflit et tous les suivants du même parent de +1 semaine. */
  cascadeShiftFn?: (conflictStartDate: string, parentId: string) => Promise<void>;
}

export interface NoParentDragState {
  cycleId: string;
  newStart: string;
  newEnd: string;
}

export interface SnapDragDialogState {
  movingLabel: string;
  /** Début provisoire, calé sur un lundi. */
  movingStart: string;
  movingEnd: string;
  conflict: SnapConflict;
  onConfirmSnap: (newStart: string, newEnd: string) => void;
  /** Décale le conflit et les suivants de +1 semaine, puis place la période. */
  onCascadeShift?: () => Promise<void>;
  onCancel: () => void;
}
