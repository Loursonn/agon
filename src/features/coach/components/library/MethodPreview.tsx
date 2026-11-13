/**
 * MethodPreview — résumé textuel d'une configuration de méthode.
 * S'adapte au scope (set ou exercise) et se met à jour en temps réel.
 * Aucun nom de méthode inscrit en dur : purement paramétrique.
 */
import { C } from "@/lib/theme";
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
      <div style={{ fontSize: 12, color: C.tx3, fontStyle: "italic" }}>
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
      <div style={{
        fontSize: 11, color: C.tx3,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {preview}
      </div>
    );
  }

  return (
    <div style={{
      background: C.s2, borderRadius: 4, padding: "10px 14px",
      border: `1px solid ${C.brdL}`,
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: C.tx3, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
        Aperçu
      </div>
      <div style={{ fontSize: 13, color: C.tx2, lineHeight: 1.5, fontFamily: "monospace" }}>
        {preview}
      </div>
    </div>
  );
}

// ─── RestConfig (shared with MethodBuilder) ───────────────────────────────────


// ─── ExerciceParams ↔ MethodConfig converters ─────────────────────────────────



// ─── Builder for partial form values → MethodConfig ──────────────────────────

