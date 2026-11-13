import { AthleteFichesView } from "@/features/athlete/components/fiches/AthleteFichesView";
import { ProgramHeader } from "@/features/athlete/components/program/ProgramHeader";
import { ProgramSessionsView } from "@/features/athlete/components/program/ProgramSessionsView";
import { useSearchParams } from "react-router-dom";


// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProgramPage() {
  const [params] = useSearchParams();
  if (params.get("vue") !== "fiches") return <ProgramSessionsView />;
  return (
    <div className="mx-auto w-full max-w-[480px] font-ui lg:max-w-6xl">
      <ProgramHeader />
      <AthleteFichesView />
    </div>
  );
}
