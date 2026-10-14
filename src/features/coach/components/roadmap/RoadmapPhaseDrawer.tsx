/**
 * RoadmapPhaseDrawer — formulaire création/édition de phase (admin).
 * Sheet latéral. Champs : nom, quarter, description, statut, sort_order.
 */
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X } from "lucide-react";
import { C } from "@/lib/theme";
import { useCreatePhase, useUpdatePhase } from "@/features/shared/hooks/useRoadmap";
import type { RoadmapPhase, RoadmapPhaseStatus } from "@/features/coach/types/roadmap";

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  name:        z.string().min(1, "Nom requis"),
  quarter:     z.string().min(1, "Quarter requis"),
  description: z.string().optional(),
  status:      z.enum(["planned", "in_progress", "shipped"]),
  sort_order:  z.number().int().min(0),
});

type FormValues = z.infer<typeof schema>;

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  phase?:   RoadmapPhase | null;
  onClose:  () => void;
}

const STATUS_OPTIONS: { value: RoadmapPhaseStatus; label: string }[] = [
  { value: "planned",     label: "Planifiée" },
  { value: "in_progress", label: "En cours" },
  { value: "shipped",     label: "Livrée" },
];

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 4,
  border: `1px solid ${C.brdL}`, background: C.s2,
  color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: C.tx3,
  textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4,
  display: "block",
};

export function RoadmapPhaseDrawer({ phase, onClose }: Props) {
  const isEdit = !!phase;
  const create = useCreatePhase();
  const update = useUpdatePhase();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name:        phase?.name        ?? "",
      quarter:     phase?.quarter     ?? "",
      description: phase?.description ?? "",
      status:      (phase?.status     ?? "planned") as RoadmapPhaseStatus,
      sort_order:  phase?.sort_order  ?? 0,
    },
  });

  useEffect(() => {
    if (phase) reset({
      name:        phase.name,
      quarter:     phase.quarter,
      description: phase.description ?? "",
      status:      phase.status,
      sort_order:  phase.sort_order,
    });
  }, [phase, reset]);

  function onSubmit(vals: FormValues) {
    if (isEdit) {
      update.mutate({ id: phase!.id, ...vals, description: vals.description || null }, {
        onSuccess: onClose,
      });
    } else {
      create.mutate({ ...vals, description: vals.description || null }, {
        onSuccess: onClose,
      });
    }
  }

  const busy = create.isPending || update.isPending;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.5)" }}
      />
      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 91,
        width: "min(100vw, 420px)", background: C.s1,
        borderLeft: `1px solid ${C.brd}`,
        display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: `1px solid ${C.brd}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.tx }}>
            {isEdit ? "Modifier la phase" : "Nouvelle phase"}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: C.tx3, padding: 4, borderRadius: 6,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Nom */}
          <div>
            <label style={labelStyle}>Nom</label>
            <input {...register("name")} style={inputStyle} placeholder="ex: Phase Alpha" />
            {errors.name && <div style={{ fontSize: 11, color: C.r, marginTop: 4 }}>{errors.name.message}</div>}
          </div>

          {/* Quarter */}
          <div>
            <label style={labelStyle}>Quarter</label>
            <input {...register("quarter")} style={inputStyle} placeholder="ex: Q3 2026" />
            {errors.quarter && <div style={{ fontSize: 11, color: C.r, marginTop: 4 }}>{errors.quarter.message}</div>}
          </div>

          {/* Statut */}
          <div>
            <label style={labelStyle}>Statut</label>
            <select {...register("status")} style={inputStyle}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Sort order */}
          <div>
            <label style={labelStyle}>Ordre d'affichage</label>
            <input
              {...register("sort_order", { valueAsNumber: true })}
              type="number" min={0} style={inputStyle}
            />
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description (optionnel)</label>
            <textarea
              {...register("description")}
              rows={4}
              style={{ ...inputStyle, resize: "vertical" }}
              placeholder="Objectifs de cette phase…"
            />
          </div>

          {/* Footer */}
          <div style={{ marginTop: "auto", paddingTop: 8, display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1, padding: "9px 0", borderRadius: 4,
                border: `1px solid ${C.brdL}`, background: "transparent",
                color: C.tx2, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={busy}
              style={{
                flex: 2, padding: "9px 0", borderRadius: 4,
                border: "none", background: C.ac,
                color: "#fff", fontSize: 13, fontWeight: 700,
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.6 : 1, fontFamily: "inherit",
              }}
            >
              {busy ? "…" : isEdit ? "Enregistrer" : "Créer la phase"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
