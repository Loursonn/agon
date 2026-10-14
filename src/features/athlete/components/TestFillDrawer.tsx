import { useState, useEffect } from "react";
import { FlaskConical } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { C } from "@/lib/theme";
import type { TestVariable, TestDefinitionWithVariables } from "@/features/shared/types/tests";

interface TestFillDrawerProps {
  testId: string | null;
  athleteId: string;
  onClose: () => void;
}

interface TestData {
  id: string;
  title: string;
  type: string;
  date: string;
  completed: boolean;
  description: string | null;
  results_note: string | null;
  results_structured: Record<string, unknown> | null;
}

const TYPE_COLOR: Record<string, string> = {
  musculation: "#FFC933", endurance: "#33B5FF", vitesse: "#EF4444",
  puissance: "#F59E0B", souplesse: "#10B981", autre: "#6B7280",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ── Value type helpers ────────────────────────────────────────────────────────

function secsToPace(secs: number): string {
  if (!secs || isNaN(secs)) return "";
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
function paceToSecs(str: string): number | null {
  const m = str.match(/^(\d+):(\d{1,2})$/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

function secsToDuration(secs: number): string {
  if (!secs || isNaN(secs)) return "";
  const h = Math.floor(secs / 3600);
  const min = Math.floor((secs % 3600) / 60);
  const s = Math.round(secs % 60);
  if (h > 0) return `${h}:${String(min).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${min}:${String(s).padStart(2, "0")}`;
}
function durationToSecs(str: string): number | null {
  const parts = str.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

function parseToSecs(raw: string, vtype: TestVariable["value_type"]): number | null {
  if (!raw.trim()) return null;
  if (vtype === "pace")     return paceToSecs(raw);
  if (vtype === "duration") return durationToSecs(raw);
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}

function storedToDisplay(val: number, vtype: TestVariable["value_type"]): string {
  if (vtype === "pace")     return secsToPace(val);
  if (vtype === "duration") return secsToDuration(val);
  return String(val);
}

// ── Single variable input row ─────────────────────────────────────────────────

function VariableInput({
  variable, value, onChange, readOnly,
}: {
  variable: TestVariable;
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
}) {
  const placeholder =
    variable.value_type === "pace"     ? "ex: 4:30" :
    variable.value_type === "duration" ? "ex: 12:34" :
    variable.value_type === "scale5"   ? "0–5" :
    "ex: 95";
  const isNum = variable.value_type === "number" || variable.value_type === "scale5";

  return (
    <div style={{
      background: C.s2, borderRadius: 4, padding: "10px 14px",
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.tx2, marginBottom: 4 }}>
          {variable.label}
        </div>
        <input
          type={isNum ? "number" : "text"}
          inputMode={isNum ? "decimal" : "text"}
          min={variable.value_type === "scale5" ? 0 : undefined}
          max={variable.value_type === "scale5" ? 5 : undefined}
          step={variable.value_type === "scale5" ? 0.5 : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          placeholder={placeholder}
          style={{
            width: "100%", padding: "7px 10px", borderRadius: 4,
            border: "1px solid " + C.brdL, background: readOnly ? "transparent" : C.s1,
            color: C.tx, fontSize: 14, fontWeight: 700,
            fontFamily: "inherit", outline: "none",
            boxSizing: "border-box" as const,
            opacity: readOnly ? 0.8 : 1,
          }}
        />
      </div>
      <div style={{ flexShrink: 0, textAlign: "right" as const }}>
        <div style={{ fontSize: 11, color: C.tx3 }}>{variable.unit}</div>
        <div style={{ fontSize: 9, color: C.tx3, marginTop: 2, opacity: 0.7 }}>
          {variable.better_when === "higher" ? "↑ mieux" : "↓ mieux"}
        </div>
      </div>
    </div>
  );
}

// ── Drawer ────────────────────────────────────────────────────────────────────

export function TestFillDrawer({ testId, athleteId, onClose }: TestFillDrawerProps) {
  const qc = useQueryClient();
  const [test, setTest]             = useState<TestData | null>(null);
  const [definition, setDefinition] = useState<TestDefinitionWithVariables | null>(null);
  const [values, setValues]         = useState<Record<string, string>>({});
  const [note, setNote]             = useState("");     // free-text result (non-variable tests)
  const [comment, setComment]       = useState("");     // comment for all tests
  const [saving, setSaving]         = useState(false);
  const [loading, setLoading]       = useState(false);

  useEffect(() => {
    if (!testId) { setTest(null); setDefinition(null); setValues({}); setNote(""); setComment(""); return; }
    setLoading(true);

    db.from("test_sessions")
      .select("id, title, type, date, completed, description, results_note, results_structured")
      .eq("id", testId)
      .single()
      .then(async ({ data }: { data: TestData | null }) => {
        setTest(data);

        const structured = data?.results_structured as Record<string, unknown> | null;

        if (data?.title) {
          const { data: defs } = await db
            .from("test_definitions")
            .select("*, test_variables(*)")
            .ilike("name", data.title)
            .limit(1);

          const def = (defs?.[0] as TestDefinitionWithVariables | null) ?? null;
          if (def) {
            def.test_variables = [...def.test_variables].sort((a, b) => a.label.localeCompare(b.label));
          }
          setDefinition(def);

          if (def && structured) {
            // Pre-fill variable values
            const storedVars = (structured.variables ?? {}) as Record<string, number>;
            const preloaded: Record<string, string> = {};
            for (const v of def.test_variables) {
              const val = storedVars[v.key];
              if (val != null && !isNaN(Number(val))) {
                preloaded[v.key] = storedToDisplay(Number(val), v.value_type);
              }
            }
            setValues(preloaded);
          }

          // For non-variable tests, note = results_note
          if (!def || def.test_variables.length === 0) {
            setNote(data?.results_note ?? "");
          }
        } else {
          setNote(data?.results_note ?? "");
        }

        // Pre-fill comment from results_structured.comment
        setComment((structured?.comment as string) ?? "");

        setLoading(false);
      });
  }, [testId]);

  const tc = TYPE_COLOR[test?.type ?? ""] ?? "#6B7280";
  const coachFilled = definition?.fill_mode === "coach";
  const hasVariables = !coachFilled && (definition?.test_variables.length ?? 0) > 0;

  async function handleSubmit() {
    if (!test) return;
    setSaving(true);

    let results_note_val: string | null = null;
    const results_structured: Record<string, unknown> = {};

    if (hasVariables && definition) {
      const varMap: Record<string, number | null> = {};
      const parts: string[] = [];
      for (const v of definition.test_variables) {
        const raw = values[v.key]?.trim() ?? "";
        const num = parseToSecs(raw, v.value_type);
        varMap[v.key] = num;
        if (num != null) parts.push(`${v.label}: ${raw} ${v.unit}`);
      }
      results_structured.variables = varMap;
      if (parts.length > 0) results_note_val = parts.join(" · ");
    } else {
      results_note_val = note.trim() || null;
    }

    if (comment.trim()) results_structured.comment = comment.trim();

    const { error } = await db
      .from("test_sessions")
      .update({
        completed: true,
        results_note: results_note_val,
        results_structured: Object.keys(results_structured).length > 0 ? results_structured : null,
      })
      .eq("id", test.id);

    setSaving(false);
    if (error) { toast.error("Erreur lors de l'enregistrement"); return; }
    qc.invalidateQueries({ queryKey: QK.activePlan(athleteId) });
    qc.invalidateQueries({ queryKey: QK.testSessions(athleteId) });
    toast.success("Test enregistré ✓");
    onClose();
  }

  return (
    <Drawer open={!!testId} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent style={{ background: C.s1, borderTop: "1px solid " + C.brd, padding: "0 0 40px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <DrawerHeader style={{ padding: "16px 20px 12px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 4, flexShrink: 0,
              background: tc + "20", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <FlaskConical size={18} color={tc} />
            </div>
            {loading ? (
              <div style={{ fontSize: 14, color: C.tx3 }}>Chargement…</div>
            ) : test ? (
              <div>
                <DrawerTitle style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>{test.title}</DrawerTitle>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 4,
                    background: tc + "20", color: tc, textTransform: "capitalize",
                  }}>
                    {test.type}
                  </span>
                  {hasVariables && (
                    <span style={{ fontSize: 10, color: C.tx3 }}>
                      {definition!.test_variables.length} variable{definition!.test_variables.length > 1 ? "s" : ""}
                    </span>
                  )}
                  {test.completed && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.g }}>✓ Complété</span>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </DrawerHeader>

        {test && !loading && (
          <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none", padding: "0 20px", display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Description */}
            {(test.description ?? definition?.description) && (
              <div style={{ background: C.s2, borderRadius: 4, padding: "12px 14px" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>
                  Description
                </div>
                <div style={{ fontSize: 13, color: C.tx2, lineHeight: 1.5 }}>
                  {test.description ?? definition?.description}
                </div>
              </div>
            )}

            {/* Protocol */}
            {definition?.protocol?.text && (
              <div style={{ background: C.s2, borderRadius: 4, padding: "12px 14px" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>
                  Protocole
                </div>
                <div style={{ fontSize: 13, color: C.tx2, lineHeight: 1.5 }}>{definition.protocol.text}</div>
              </div>
            )}

            {/* Test rempli par le coach : pas de saisie athlète */}
            {coachFilled && (
              <div style={{ background: C.s2, borderRadius: 4, padding: "12px 14px", border: "1px solid " + C.o + "40" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.o, marginBottom: 4 }}>Rempli par ton coach</div>
                <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.5 }}>
                  Ce test est noté par ton coach. Envoie-lui ta vidéo (hors application). Tu peux marquer la séance comme réalisée une fois la vidéo envoyée.
                </div>
              </div>
            )}

            {/* Variable inputs */}
            {coachFilled ? null : hasVariables ? (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
                  {test.completed ? "Résultats" : "Saisir les résultats"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {definition!.test_variables.map((v) => (
                    <VariableInput
                      key={v.id}
                      variable={v}
                      value={values[v.key] ?? ""}
                      onChange={(val) => setValues(prev => ({ ...prev, [v.key]: val }))}
                      readOnly={test.completed}
                    />
                  ))}
                </div>
              </div>
            ) : (
              /* Free-text fallback when no variables defined */
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
                  {test.completed ? "Résultats saisis" : "Saisir les résultats"}
                </div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  readOnly={test.completed}
                  placeholder={`Ex : VMA = 17 km/h, 1RM Squat = 120 kg, temps = 4'32"...`}
                  rows={4}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 4,
                    border: "1px solid " + C.brdL, background: C.s2,
                    color: C.tx, fontSize: 13, fontFamily: "inherit",
                    resize: "none", outline: "none", boxSizing: "border-box" as const,
                    opacity: test.completed ? 0.7 : 1,
                  }}
                />
              </div>
            )}

            {/* Comment — editable when not completed, read-only when completed */}
            {!test.completed && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
                  Commentaire (optionnel)
                </div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Conditions, ressenti…"
                  rows={2}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 4,
                    border: "1px solid " + C.brdL, background: C.s2,
                    color: C.tx, fontSize: 13, fontFamily: "inherit",
                    resize: "none", outline: "none", boxSizing: "border-box" as const,
                  }}
                />
              </div>
            )}
            {test.completed && comment && (
              <div style={{ background: C.s2, borderRadius: 4, padding: "10px 14px" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>
                  Commentaire
                </div>
                <div style={{ fontSize: 13, color: C.tx2, fontStyle: "italic" }}>{comment}</div>
              </div>
            )}

            {/* Submit */}
            {!test.completed && (
              <button
                onClick={handleSubmit}
                disabled={saving}
                style={{
                  width: "100%", padding: "13px 0", borderRadius: 6,
                  border: "none", background: saving ? C.s2 : (coachFilled ? C.g : tc),
                  color: saving ? C.tx3 : "#fff",
                  fontSize: 14, fontWeight: 700,
                  cursor: saving ? "default" : "pointer",
                  fontFamily: "inherit", minHeight: 44,
                  transition: "all 150ms",
                }}
              >
                {saving ? "Enregistrement…" : coachFilled ? "VALIDÉ ✓ — envoyer au coach" : "Marquer comme réalisé ✓"}
              </button>
            )}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
