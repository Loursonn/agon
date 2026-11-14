import { useSearchParams } from "react-router-dom";
import { AthletePageHeader } from "@/features/athlete/components/AthletePageHeader";

const VUES = [
  { key: "seances", label: "Séances" },
  { key: "fiches", label: "Fiches" },
] as const;

/** En-tête de l'onglet Programme (maquette) : titre + onglets Séances | Fiches (?vue=fiches). */
export function ProgramHeader() {
  const [params, setParams] = useSearchParams();
  const vue = params.get("vue") === "fiches" ? "fiches" : "seances";
  const go = (v: "seances" | "fiches") => {
    const next = new URLSearchParams(params);
    if (v === "fiches") next.set("vue", "fiches");
    else next.delete("vue");
    setParams(next, { replace: true });
  };
  return (
    <AthletePageHeader
      title="Programme"
      titleSize={26}
      titleGap={22}
      padding="56px 20px 18px"
      tabs={VUES}
      activeTab={vue}
      onTab={go}
    />
  );
}
