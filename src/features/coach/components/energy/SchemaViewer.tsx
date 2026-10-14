/**
 * SchemaViewer — read-only SVG render of a FieldSchema.
 * Used by coach preview + athlete timeline/execution.
 * Also exports SchemaFullscreenDialog for tap-to-zoom.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { FieldSchema } from "@/types/energy";
import { FIELD_BACKGROUNDS, FIELD_DISTANCE_LABELS, SCHEMA_COLORS, renderSchemaElementsSVG } from "@/lib/energy/renderSchema";

// ── SchemaViewer ─────────────────────────────────────────────────────────────

interface ViewerProps {
  schema: FieldSchema;
  compact?: boolean;
  onClick?: () => void;
}

export function SchemaViewer({ schema, compact, onClick }: ViewerProps) {
  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: compact ? 10 : 14,
        overflow: "hidden",
        border: "1px solid var(--border, #2E2D33)",
        cursor: onClick ? "pointer" : "default",
        lineHeight: 0,
      }}
    >
      <svg
        viewBox="0 0 500 320"
        style={{ width: "100%", display: "block" }}
        dangerouslySetInnerHTML={{
          __html:
            FIELD_BACKGROUNDS[schema.field] +
            (schema.showDistances && FIELD_DISTANCE_LABELS[schema.field] ? FIELD_DISTANCE_LABELS[schema.field] : "") +
            renderSchemaElementsSVG(schema.elements),
        }}
      />
    </div>
  );
}

// ── SchemaFullscreenDialog ───────────────────────────────────────────────────

interface FullscreenProps {
  schema: FieldSchema;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function SchemaFullscreenDialog({ schema, open, onOpenChange }: FullscreenProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[95vw] w-full sm:max-w-[700px] p-4 bg-[#0E0C0A] border-[#2E2D33]"
        style={{ borderRadius: 6 }}
      >
        <DialogTitle className="sr-only">Schéma</DialogTitle>
        <div style={{ borderRadius: 6, overflow: "hidden", border: "1px solid #2E2D33" }}>
          <svg
            viewBox="0 0 500 320"
            style={{ width: "100%", display: "block", touchAction: "manipulation" }}
            dangerouslySetInnerHTML={{
              __html:
                FIELD_BACKGROUNDS[schema.field] +
                renderSchemaElementsSVG(schema.elements),
            }}
          />
        </div>
        {/* Legend */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8 }}>
          {SCHEMA_COLORS.map(({ color, label }) => (
            <span key={color} style={{ fontSize: 11, color: "#8B8A92", display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 14, height: 3, borderRadius: 2, background: color, display: "inline-block" }} />
              {label}
            </span>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Convenience wrapper: miniature + fullscreen on click ─────────────────────

export function SchemaViewerWithZoom({ schema }: { schema: FieldSchema }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SchemaViewer schema={schema} compact onClick={() => setOpen(true)} />
      <SchemaFullscreenDialog schema={schema} open={open} onOpenChange={setOpen} />
    </>
  );
}

export default SchemaViewer;
