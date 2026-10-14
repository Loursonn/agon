/**
 * RoadmapItemDrawer — formulaire création/édition d'item.
 * Modal centré. Boutons pour catégorie, priorité, statut.
 * Coaches certifiés : suggestions uniquement (status='idea').
 * Admins : accès complet.
 */
import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X } from "lucide-react";
import { C } from "@/lib/theme";
import { useCreateItem, useUpdateItem } from "@/features/shared/hooks/useRoadmap";
import type { RoadmapItem, RoadmapPhase, RoadmapCategory, RoadmapItemStatus, RoadmapPriority } from "@/features/coach/types/roadmap";
import { CATEGORY_LABEL, CATEGORY_COLOR, PRIORITY_LABEL, PRIORITY_COLOR, ITEM_STATUS_LABEL, ITEM_STATUS_COLOR } from "@/features/coach/types/roadmap";

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  title:       z.string().min(1, "Titre requis"),
  description: z.string().optional(),
  category:    z.enum(["coach", "athlete", "planning", "nutrition", "infra", "ux"]),
  priority:    z.enum(["P0", "P1", "P2", "P3"]),
  status:      z.enum(["idea", "backlog", "planned", "in_progress", "shipped"]),
  phase_id:    z.string().nullable().optional(),
  sort_order:  z.number().int().min(0),
});

type FormValues = z.infer<typeof schema>;

// ─── Button group helper ──────────────────────────────────────────────────────

function BtnGroup<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string; color?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map((o) => {
        const active = value === o.value;
        const color = o.color ?? C.ac;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              padding: "5px 12px", borderRadius: 6, cursor: "pointer",
              border: `1px solid ${active ? color : C.brdL}`,
              background: active ? `${color}20` : "transparent",
              color: active ? color : C.tx3,
              fontSize: 12, fontWeight: active ? 700 : 400,
              fontFamily: "inherit", transition: "all 120ms",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Options ──────────────────────────────────────────────────────────────────

const CATEGORIES: RoadmapCategory[] = ["coach", "athlete", "planning", "nutrition", "infra", "ux"];
const PRIORITIES: RoadmapPriority[] = ["P0", "P1", "P2", "P3"];
const STATUSES:   RoadmapItemStatus[] = ["idea", "backlog", "planned", "in_progress", "shipped"];

const catOptions  = CATEGORIES.map((c) => ({ value: c,  label: CATEGORY_LABEL[c],  color: CATEGORY_COLOR[c]  }));
const priOptions  = PRIORITIES.map((p) => ({ value: p,  label: PRIORITY_LABEL[p],  color: PRIORITY_COLOR[p]  }));
const statOptions = STATUSES.map((s)   => ({ value: s,  label: ITEM_STATUS_LABEL[s], color: ITEM_STATUS_COLOR[s] }));

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 4,
  border: `1px solid ${C.brdL}`, background: C.s2,
  color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: C.tx3,
  textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8,
  display: "block",
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  item?:           RoadmapItem | null;
  phases:          RoadmapPhase[];
  isAdmin:         boolean;
  onClose:         () => void;
  defaultPhaseId?: string | null;
}

export function RoadmapItemDrawer({ item, phases, isAdmin, onClose, defaultPhaseId }: Props) {
  const isEdit = !!item;
  const create = useCreateItem();
  const update = useUpdateItem();

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title:       item?.title       ?? "",
      description: item?.description ?? "",
      category:    item?.category    ?? "coach",
      priority:    item?.priority    ?? "P2",
      status:      (isAdmin ? (item?.status ?? "idea") : "idea") as RoadmapItemStatus,
      phase_id:    item?.phase_id    ?? defaultPhaseId ?? null,
      sort_order:  item?.sort_order  ?? 0,
    },
  });

  useEffect(() => {
    if (item) reset({
      title:       item.title,
      description: item.description ?? "",
      category:    item.category,
      priority:    item.priority,
      status:      item.status,
      phase_id:    item.phase_id,
      sort_order:  item.sort_order,
    });
  }, [item, reset]);

  function onSubmit(vals: FormValues) {
    const payload = {
      ...vals,
      description: vals.description || null,
      phase_id:    vals.phase_id || null,
      status:      (isAdmin ? vals.status : "idea") as RoadmapItemStatus,
    };
    if (isEdit) {
      update.mutate({ id: item!.id, ...payload }, { onSuccess: onClose });
    } else {
      create.mutate(payload, { onSuccess: onClose });
    }
  }

  const busy = create.isPending || update.isPending;

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.65)" }} />

      {/* Modal centré */}
      <div style={{
        position: "fixed", top: "50%", left: "50%", zIndex: 91,
        transform: "translate(-50%, -50%)",
        width: "min(96vw, 540px)", maxHeight: "90vh",
        background: C.s1, borderRadius: 6,
        border: `1px solid ${C.brd}`,
        display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: `1px solid ${C.brd}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.tx }}>
            {isEdit ? "Modifier l'item" : isAdmin ? "Nouvel item" : "Suggérer une fonctionnalité"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.tx3, padding: 4, borderRadius: 6 }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 18 }}
        >
          {/* Coach info banner */}
          {!isAdmin && (
            <div style={{ padding: "8px 12px", borderRadius: 4, background: `${C.ac}15`, border: `1px solid ${C.ac}30`, fontSize: 12, color: C.tx2 }}>
              Votre suggestion sera soumise à l'équipe avec le statut "Idée".
            </div>
          )}

          {/* Titre */}
          <div>
            <label style={labelStyle}>Titre</label>
            <input {...register("title")} style={inputStyle} placeholder="Résumé en une ligne…" />
            {errors.title && <div style={{ fontSize: 11, color: C.r, marginTop: 4 }}>{errors.title.message}</div>}
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description (optionnel)</label>
            <textarea
              {...register("description")}
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
              placeholder="Contexte, use-case, problème à résoudre…"
            />
          </div>

          {/* Catégorie */}
          <div>
            <label style={labelStyle}>Catégorie</label>
            <Controller
              name="category"
              control={control}
              render={({ field }) => (
                <BtnGroup options={catOptions} value={field.value} onChange={field.onChange} />
              )}
            />
          </div>

          {/* Priorité (admin) */}
          {isAdmin && (
            <div>
              <label style={labelStyle}>Priorité</label>
              <Controller
                name="priority"
                control={control}
                render={({ field }) => (
                  <BtnGroup options={priOptions} value={field.value} onChange={field.onChange} />
                )}
              />
            </div>
          )}

          {/* Statut (admin) */}
          {isAdmin && (
            <div>
              <label style={labelStyle}>Statut</label>
              <Controller
                name="status"
                control={control}
                render={({ field }) => (
                  <BtnGroup options={statOptions} value={field.value} onChange={field.onChange} />
                )}
              />
            </div>
          )}

          {/* Phase (admin) */}
          {isAdmin && (
            <div>
              <label style={labelStyle}>Phase</label>
              <select {...register("phase_id")} style={inputStyle}>
                <option value="">— Sans phase —</option>
                {phases.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.quarter})</option>
                ))}
              </select>
            </div>
          )}

          {/* Sort order (admin) */}
          {isAdmin && (
            <div>
              <label style={labelStyle}>Ordre d'affichage</label>
              <input {...register("sort_order", { valueAsNumber: true })} type="number" min={0} style={{ ...inputStyle, width: 80, boxSizing: "border-box" }} />
            </div>
          )}

          {/* Footer */}
          <div style={{ paddingTop: 8, display: "flex", gap: 10 }}>
            <button
              type="button" onClick={onClose}
              style={{
                flex: 1, padding: "9px 0", borderRadius: 4,
                border: `1px solid ${C.brdL}`, background: "transparent",
                color: C.tx2, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Annuler
            </button>
            <button
              type="submit" disabled={busy}
              style={{
                flex: 2, padding: "9px 0", borderRadius: 4,
                border: "none", background: C.ac,
                color: "#fff", fontSize: 13, fontWeight: 700,
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.6 : 1, fontFamily: "inherit",
              }}
            >
              {busy ? "…" : isEdit ? "Enregistrer" : isAdmin ? "Créer l'item" : "Soumettre"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
