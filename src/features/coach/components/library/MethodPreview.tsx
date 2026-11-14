/**
 * MethodPreview — résumé textuel d'une configuration de méthode.
 * S'adapte au scope (set ou exercise) et se met à jour en temps réel.
 * Aucun nom de méthode inscrit en dur : purement paramétrique.
 */
import type { MethodConfig, SetMethodConfig, ExerciseMethodConfig, ClassicMethodConfig, FullWeekConfig, MethodScope } from "@/types/trainingMethods";
import type { ExerciceParams } from "../programmation/types";
import { buildClassicPreview, buildExercisePreview, buildSetPreview, type RestConfig } from "./methodConfigConvert";

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface MethodPreviewProps {
  config: Partial<MethodConfig> | null;
  compact?: boolean;
}

export function MethodPreview({ config, compact = false }: MethodPreviewProps) {
  if (!config || !config.scope) {
    return (
      <div className="text-[12px] italic text-agon-tx3">
        Aperçu disponible après configuration
      </div>
    );
  }

  let preview: string;
  try {
    if (config.scope === "set") {
      preview = buildSetPreview(config as SetMethodConfig);
    } else if (config.scope === "classic") {
      preview = buildClassicPreview(config as ClassicMethodConfig);
    } else {
      preview = buildExercisePreview(config as ExerciseMethodConfig);
    }
  } catch {
    preview = "Configuration incomplète";
  }

  if (compact) {
    return (
      <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-agon-tx3">
        {preview}
      </div>
    );
  }

  return (
    <div className="rounded border border-agon-brd-l bg-agon-s2 px-3.5 py-2.5">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.5px] text-agon-tx3">
        Aperçu
      </div>
      <div className="text-[13px] leading-[1.5] text-agon-tx2 [font-family:monospace]">
        {preview}
      </div>
    </div>
  );
}

// ─── RestConfig (shared with MethodBuilder) ───────────────────────────────────


// ─── ExerciceParams ↔ MethodConfig converters ─────────────────────────────────



// ─── Builder for partial form values → MethodConfig ──────────────────────────
