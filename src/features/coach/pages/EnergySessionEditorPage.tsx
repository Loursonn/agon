/**
 * EnergySessionEditorPage
 *
 * Routes :
 *   /coach/athletes/:athleteId/energy/new
 *   /coach/athletes/:athleteId/energy/:sessionId/edit
 *   /coach/energy-library/new
 *   /coach/energy-library/:sessionId/edit
 */
import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Zap } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { C } from "@/lib/theme";
import { makeRootGroup, genId } from "@/lib/energy/treeUtils";
import { expandIntervals, computeTotals } from "@/lib/energy";
import { formatSLong } from "@/lib/energy/formatTarget";
import type { EnergyGroup, EnergyStep, SessionKind, StructureType, FieldSchema, SessionImage } from "@/types/energy";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/compressImage";
import IntervalBuilder from "../components/energy/IntervalBuilder";
import SessionPreview from "../components/energy/SessionPreview";
import SchemaEditor from "../components/energy/SchemaEditor";
import { SchemaViewerWithZoom } from "../components/energy/SchemaViewer";
import {
  useEnergySession,
  useEnergySessions,
  useCreateEnergySession,
  useUpdateEnergySession,
} from "@/features/shared/hooks/useEnergySessions";
import { useAssignEnergySession } from "@/features/shared/hooks/useEnergyAssignments";
import type { EnergySessionRow } from "@/types/energy";
import type { SessionBlock, SessionFormat, WodBlock } from "@/types/specific";
import { isWodBlock } from "@/types/specific";
import TaxonomySelect from "../components/specific/TaxonomySelect";
import ClassiqueBuilder from "../components/specific/ClassiqueBuilder";
import ClassiquePreview from "../components/specific/ClassiquePreview";
import BlockBankDrawer from "../components/specific/BlockBankDrawer";
import { useSpecificSports, usePhysicalQualities, useCreateSport, useCreateQuality } from "@/features/shared/hooks/useSpecificTaxonomy";
import { useCreateSpecificBlock } from "@/features/shared/hooks/useSpecificBlocks";
import { toast } from "sonner";
import ImportEnergyTextDialog from "../components/import/ImportEnergyTextDialog";
import ImportIssueList, { issueCounts, scrollToStep } from "../components/import/ImportIssueList";
import type { EnergyImportResult } from "@/lib/import/yoxx/parseEnergySession";
import type { ImportIssue } from "@/lib/import/yoxx/common";

// ── Constants ─────────────────────────────────────────────────────────────────

const SESSION_KINDS: { value: SessionKind; label: string }[] = [
  { value: "vo2",        label: "VO₂max / VMA" },
  { value: "tempo",      label: "Tempo" },
  { value: "seuil",      label: "Seuil lactique" },
  { value: "footing",    label: "Footing / Endurance" },
  { value: "fartlek",    label: "Fartlek" },
  { value: "autre",      label: "Autres" },
  { value: "custom",     label: "Type personnalisé…" },
];

const ORANGE = "#F5A623";


// ── Assign modal (simple) ─────────────────────────────────────────────────────

function AssignModal({
  sessionId, athleteId, onClose,
}: { sessionId: string; athleteId: string; onClose: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const assign = useAssignEnergySession();

  async function handleAssign() {
    await assign.mutateAsync({ energy_session_id: sessionId, athlete_id: athleteId, scheduled_date: date, status: "planned" });
    onClose();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ background: C.s1, borderRadius: 6, padding: 24, width: 320, border: `1px solid ${C.brd}` }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 16 }}>Planifier la séance</div>
        <div style={{ fontSize: 11, color: C.tx3, marginBottom: 6 }}>Date</div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{
            width: "100%", background: C.s2, border: `1px solid ${C.brd}`,
            borderRadius: 6, color: C.tx, fontSize: 13, padding: "6px 10px", fontFamily: "inherit",
          }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ padding: "7px 14px", borderRadius: 4, border: `1px solid ${C.brd}`, background: "transparent", color: C.tx2, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
          >
            Annuler
          </button>
          <button
            onClick={handleAssign}
            disabled={assign.isPending}
            style={{ padding: "7px 14px", borderRadius: 4, border: "none", background: C.gV, color: "#0E0C0A", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
          >
            {assign.isPending ? "…" : "Planifier"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Import session modal ─────────────────────────────────────────────────────

const KIND_COLOR: Record<string, string> = {
  vo2: "#FFC933", tempo: "#33B5FF", seuil: "#F59E0B",
  footing: "#22C55E", fartlek: "#EC4899", autre: "#6B7280", custom: "#14B8A6",
};

function deepCloneIntervals(steps: EnergyStep[]): EnergyStep[] {
  return steps.map((s): EnergyStep => {
    if (s.type === "interval" || s.type === "exercise") return { ...s, id: genId() };
    if (s.type === "interval") return { ...s, id: genId() };
    return {
      ...s,
      id: genId(),
      children: deepCloneIntervals(s.children),
      rest_between: s.rest_between ? { ...s.rest_between, id: genId() } : undefined,
    };
  });
}

function ImportSessionModal({ onImport, onClose }: {
  onImport: (session: EnergySessionRow) => void;
  onClose: () => void;
}) {
  const { data: sessions = [], isLoading } = useEnergySessions();
  const [search, setSearch] = useState("");

  const filtered = sessions.filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.6)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", zIndex: 61,
        transform: "translate(-50%, -50%)",
        width: 520, maxWidth: "94vw", maxHeight: "80vh",
        background: C.s1, borderRadius: 6, border: `1px solid ${C.brd}`,
        display: "flex", flexDirection: "column",
        animation: "fadeScaleIn 150ms ease-out",
      }}>
        <style>{`@keyframes fadeScaleIn { from { opacity:0; transform:translate(-50%,-50%) scale(0.96) } to { opacity:1; transform:translate(-50%,-50%) scale(1) } }`}</style>

        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.brd}`, flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>Importer une séance existante</div>
          <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>La structure sera copiée — l'original ne sera pas modifié</div>
        </div>

        <div style={{ padding: "10px 20px", borderBottom: `1px solid ${C.brd}`, flexShrink: 0 }}>
          <input
            autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            style={{ width: "100%", padding: "8px 10px", borderRadius: 4, border: `1px solid ${C.brdL}`, background: C.s2, color: C.tx, fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
          />
        </div>

        <div style={{ overflowY: "auto", padding: "12px 20px", flex: 1, scrollbarWidth: "none" }}>
          {isLoading ? (
            <div style={{ textAlign: "center", padding: "30px 0", color: C.tx3, fontSize: 12 }}>Chargement…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 0", color: C.tx3, fontSize: 13 }}>
              {search ? "Aucun résultat" : "Aucune séance disponible"}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {filtered.map((s) => {
                const kc = KIND_COLOR[s.session_kind] ?? "#6B7280";
                return (
                  <div
                    key={s.id}
                    onClick={() => onImport(s)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 12px", borderRadius: 4,
                      border: `1px solid ${C.brdL}`, background: C.s2,
                      cursor: "pointer", transition: "border-color 120ms",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = kc + "60")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.brdL)}
                  >
                    <div style={{ width: 30, height: 30, borderRadius: 4, background: kc + "20", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Zap size={14} style={{ color: kc }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                      <div style={{ fontSize: 10, color: C.tx3, marginTop: 1 }}>
                        {s.session_kind}{s.total_duration_s ? ` · ${Math.round(s.total_duration_s / 60)} min` : ""}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: C.ac, fontWeight: 600, flexShrink: 0 }}>Importer</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.brd}`, flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: "8px 14px", borderRadius: 4, border: `1px solid ${C.brdL}`, background: "transparent", color: C.tx2, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            Annuler
          </button>
        </div>
      </div>
    </>
  );
}

// ── Rapport d'import texte (liens cliquables vers les étapes) ────────────────

function ImportReportPanel({ issues, onClose }: { issues: ImportIssue[]; onClose: () => void }) {
  const { errors, warnings } = issueCounts(issues);
  return (
    <div style={{ border: `1px solid ${C.r}40`, background: C.r + "08", borderRadius: 4, padding: 12, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: C.tx }}>
          Rapport d'import · {errors} erreur{errors > 1 ? "s" : ""} · {warnings} à vérifier
        </div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: C.tx3, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
        >
          Masquer
        </button>
      </div>
      <div style={{ maxHeight: 220, overflowY: "auto" }}>
        <ImportIssueList
          issues={issues}
          onSelect={(id) => { if (!scrollToStep(id)) toast.info("Étape introuvable (déjà modifiée ou supprimée)"); }}
        />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EnergySessionEditorPage() {
  const { athleteId, sessionId } = useParams<{ athleteId?: string; sessionId?: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isEdit = !!sessionId;
  const kindFromUrl = searchParams.get("kind") as SessionKind | null;

  // Load existing session when editing
  const { data: existingSession, isLoading } = useEnergySession(sessionId);

  const createMutation = useCreateEnergySession();
  const updateMutation = useUpdateEnergySession();

  // Form state
  const [name, setName] = useState("");
  const [sessionKind, setSessionKind] = useState<SessionKind>(kindFromUrl ?? "vo2");
  const [customKind, setCustomKind] = useState("vo2");
  const [structureType, setStructureType] = useState<StructureType>("fractionne");
  const [root, setRoot] = useState<EnergyGroup>(makeRootGroup);
  const [fieldSchema, setFieldSchema] = useState<FieldSchema | null>(null);
  const [showSchemaEditor, setShowSchemaEditor] = useState(false);
  const [images, setImages] = useState<SessionImage[]>([]);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  // Import texte YOXX (?import=texte ouvre directement la fenêtre)
  const [showTextImport, setShowTextImport] = useState(searchParams.get("import") === "texte");
  const [importIssues, setImportIssues] = useState<ImportIssue[]>([]);
  const [notes, setNotes] = useState("");

  // Spécifique : sport / qualité / format
  // Nouvelle séance spécifique = toujours par blocs (mix Classique/WOD).
  // 'wod' ne subsiste que pour les séances legacy (intervalles pleine page).
  const [sportId, setSportId]     = useState<string | null>(null);
  const [qualityId, setQualityId] = useState<string | null>(null);
  const [format, setFormat]       = useState<SessionFormat>(kindFromUrl === "specifique" ? "classique" : "wod");
  const [classiqueBlocks, setClassiqueBlocks] = useState<SessionBlock[]>([]);
  const [showBlockBank, setShowBlockBank]     = useState(false);

  const isSpecifique = sessionKind === "specifique";
  const isClassique  = isSpecifique && format === "classique";

  const { data: sports = [] }    = useSpecificSports();
  const { data: qualities = [] } = usePhysicalQualities();
  const createSport   = useCreateSport();
  const createQuality = useCreateQuality();
  const createBlock   = useCreateSpecificBlock();

  // Hydrate from existing session
  useEffect(() => {
    if (existingSession) {
      setName(existingSession.name);
      setSessionKind(existingSession.session_kind);
      setCustomKind(existingSession.custom_kind || "vo2");
      setStructureType(existingSession.structure_type);
      // Wrap intervals in a root group
      const rootG: EnergyGroup = {
        type: "group",
        id: "__root__",
        role: "open",
        repeat: 1,
        children: existingSession.intervals ?? [],
      };
      setRoot(rootG);
      setFieldSchema(existingSession.schema ?? null);
      setNotes(existingSession.notes ?? "");
      setImages(((existingSession as any).images ?? []).filter((img: SessionImage) => !img.url.startsWith("blob:")));
      setSportId(existingSession.sport_id ?? null);
      setQualityId(existingSession.quality_id ?? null);
      setFormat(existingSession.format ?? "wod");
      setClassiqueBlocks(existingSession.classique_structure?.blocks ?? []);
    }
  }, [existingSession]);

  function handleImportSession(session: EnergySessionRow) {
    setName(session.name + " (copie)");
    setSessionKind(session.session_kind);
    setCustomKind(session.custom_kind || "vo2");
    setCustomKind(session.custom_kind ?? "");
    setStructureType(session.structure_type);
    setNotes(session.notes ?? "");
    const clonedChildren = deepCloneIntervals(session.intervals ?? []);
    setRoot({
      type: "group", id: "__root__", role: "open", repeat: 1,
      children: clonedChildren,
    });
    setSportId(session.sport_id ?? null);
    setQualityId(session.quality_id ?? null);
    setImages(((session as any).images ?? []).filter((img: SessionImage) => !img.url.startsWith("blob:")));
    setFormat(session.format ?? "wod");
    setClassiqueBlocks(
      (session.classique_structure?.blocks ?? []).map((b): SessionBlock =>
        isWodBlock(b)
          ? { ...b, id: genId(), steps: deepCloneIntervals(b.steps) }
          : { ...b, id: genId(), items: b.items.map((i) => ({ ...i, id: genId() })) }
      )
    );
    setShowImport(false);
  }

  function handleTextImport({ session, issues }: EnergyImportResult) {
    setName(session.name);
    setSessionKind(session.session_kind);
    if (session.session_kind === "custom") setCustomKind(session.custom_kind ?? "");
    setStructureType(session.structure_type);
    setRoot({ type: "group", id: "__root__", role: "open", repeat: 1, children: session.intervals });
    setNotes(session.notes ?? "");
    if (session.images.length > 0) setImages((prev) => [...prev, ...session.images]);
    setImportIssues(issues.filter((i) => i.level !== "info"));
    setShowTextImport(false);
    const { errors } = issueCounts(issues);
    if (errors > 0) toast.warning(`Séance importée — ${errors} zone${errors > 1 ? "s" : ""} « À SAISIR » à compléter`);
    else toast.success("Séance importée — vérifie puis enregistre");
  }

  function handleSaveBlockToBank(block: SessionBlock) {
    if (!user?.id) return;
    createBlock.mutate({
      coach_id: user.id,
      name: block.title.trim() || "Bloc sans titre",
      sport_id: sportId,
      quality_id: qualityId,
      content: isWodBlock(block)
        ? { title: block.title, instructions: block.instructions, kind: "wod", steps: block.steps }
        : { title: block.title, instructions: block.instructions, items: block.items.filter((i) => i.name.trim()) },
    });
  }

  /** Legacy WOD pleine page → séance par blocs (intervalles encapsulés dans un bloc WOD). */
  function convertLegacyToBlocks() {
    const wodBlock: WodBlock = {
      id: genId(),
      title: name.trim() || "WOD",
      kind: "wod",
      steps: root.children,
    };
    setClassiqueBlocks((prev) => [...prev, ...(root.children.length > 0 ? [wodBlock] : [])]);
    setRoot(makeRootGroup());
    setFormat("classique");
  }

  // Computed preview totals
  const flat = expandIntervals(root);
  const totals = computeTotals(flat);

  async function handleAddImageUrl() {
    const url = imageUrlInput.trim();
    if (!url) return;
    setImages(prev => [...prev, { url }]);
    setImageUrlInput("");
  }

  async function handleUploadImage(file: File) {
    if (!user?.id) return;
    // Show local preview immediately
    const localUrl = URL.createObjectURL(file);
    const tempId = `__uploading_${Date.now()}`;
    setImages(prev => [...prev, { url: localUrl, caption: tempId }]);

    setIsUploading(true);
    try {
      const compressed = await compressImage(file);
      const ext = (compressed.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${user.id}/sessions/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from("test-media")
        .upload(path, compressed, { contentType: compressed.type });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("test-media").getPublicUrl(path);
      // Replace local preview with remote URL
      setImages(prev => prev.map(img => img.caption === tempId ? { url: urlData.publicUrl } : img));
      URL.revokeObjectURL(localUrl);
    } catch (err) {
      console.error("[image upload]", err);
      // Keep local preview even if upload fails — user can still see what they picked
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSave(andPlan = false) {
    const effectiveKind = sessionKind === "custom" ? "custom" : sessionKind;
    const payload = {
      name: name.trim() || "Séance sans titre",
      session_kind: effectiveKind,
      custom_kind: sessionKind === "specifique"
        ? (existingSession?.custom_kind ?? null)
        : (sessionKind === "custom" ? customKind : null),
      modality: null,
      notes: notes.trim() || null,
      structure_type: structureType,
      intervals: root.children,
      schema: fieldSchema ?? null,
      images: images.length > 0 ? images : null,
      sport_id: isSpecifique ? sportId : null,
      quality_id: isSpecifique ? qualityId : null,
      format: isSpecifique ? format : "wod",
      classique_structure: isSpecifique && classiqueBlocks.length > 0
        ? { blocks: classiqueBlocks }
        : null,
      created_by: user?.id ?? null,
      ...(athleteId ? { athlete_id: athleteId } : {}),
    };

    if (isEdit && sessionId) {
      await updateMutation.mutateAsync({ id: sessionId, ...payload });
      if (andPlan && athleteId) {
        setSavedSessionId(sessionId);
        setShowAssignModal(true);
      } else {
        navigateBack();
      }
    } else {
      const created = await createMutation.mutateAsync(payload as Parameters<typeof createMutation.mutateAsync>[0]);
      if (andPlan && athleteId && created?.id) {
        setSavedSessionId(created.id);
        setShowAssignModal(true);
      } else {
        navigateBack();
      }
    }
  }

  function navigateBack() {
    if (athleteId) {
      navigate(`/coach/athletes/${athleteId}/programmation`);
    } else if (sessionKind === "specifique") {
      navigate("/coach/library");
    } else {
      navigate("/coach/energy-library");
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isLoading && isEdit) {
    return (
      <div style={{ padding: 32, color: C.tx3, fontSize: 13 }}>Chargement…</div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      {/* ── Header ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20,
        background: C.s1, borderBottom: `1px solid ${C.brd}`,
        padding: "10px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        <button
          onClick={navigateBack}
          style={{ background: "none", border: "none", color: C.tx3, fontSize: 18, cursor: "pointer", lineHeight: 1 }}
        >
          ←
        </button>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom de la séance…"
          style={{
            flex: 1, minWidth: 180,
            background: "transparent", border: "none",
            borderBottom: `1px solid ${C.brdL}`,
            color: C.tx, fontSize: 18, fontWeight: 700,
            fontFamily: "inherit", outline: "none", padding: "2px 0",
          }}
        />

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {sessionKind === "specifique" ? (
            <>
              {/* Spécifique badge */}
              <span style={{
                padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: ORANGE + "20", color: ORANGE,
              }}>
                Spécifique
              </span>
              {/* Sport */}
              <TaxonomySelect
                placeholder="Sport"
                options={sports}
                value={sportId}
                onChange={setSportId}
                onCreate={async (n) => user?.id ? await createSport.mutateAsync({ name: n, coachId: user.id }) : undefined}
                width={140}
                accent={ORANGE}
              />
              {/* Qualité physique */}
              <TaxonomySelect
                placeholder="Qualité"
                options={qualities}
                value={qualityId}
                onChange={setQualityId}
                onCreate={async (n) => user?.id ? await createQuality.mutateAsync({ name: n, coachId: user.id }) : undefined}
                width={150}
                accent="#FFC933"
              />
              {/* Legacy WOD pleine page : proposer la conversion en blocs */}
              {format === "wod" && (
                <button
                  onClick={convertLegacyToBlocks}
                  title="Encapsule les intervalles actuels dans un bloc WOD"
                  style={{
                    padding: "5px 12px", borderRadius: 6,
                    border: `1px solid ${ORANGE}40`, background: ORANGE + "0D",
                    color: ORANGE, fontSize: 11, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Convertir en blocs
                </button>
              )}
            </>
          ) : (
            <>
              {/* Energy session kind */}
              <Select value={sessionKind} onValueChange={(v) => setSessionKind(v as SessionKind)}>
                <SelectTrigger style={{ width: 170, background: C.s2, border: `1px solid ${C.brd}`, color: C.tx, fontSize: 12 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SESSION_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Custom kind input */}
              {sessionKind === "custom" && (
                <input
                  value={customKind}
                  onChange={(e) => setCustomKind(e.target.value)}
                  placeholder="Nom du type…"
                  style={{
                    width: 140, background: C.s2, border: `1px solid ${C.brd}`,
                    borderRadius: 6, color: C.tx, fontSize: 12,
                    padding: "6px 10px", fontFamily: "inherit", outline: "none",
                  }}
                />
              )}
            </>
          )}

          {/* Structure type (intervalles uniquement) */}
          {!isClassique && (
            <ToggleGroup
              type="single"
              value={structureType}
              onValueChange={(v) => { if (v) setStructureType(v as StructureType); }}
              variant="outline"
              size="sm"
            >
              <ToggleGroupItem value="continu" style={{ fontSize: 11 }}>Continu</ToggleGroupItem>
              <ToggleGroupItem value="fractionne" style={{ fontSize: 11 }}>Fractionné</ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          {!isEdit && (
            <button
              onClick={() => setShowImport(true)}
              style={{ padding: "7px 14px", borderRadius: 4, border: `1px solid ${C.ac}40`, background: C.ac + "12", color: C.ac, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              Importer une séance
            </button>
          )}
          {!isSpecifique && (
            <button
              onClick={() => setShowTextImport(true)}
              title="Coller une séance écrite au format YOXX"
              style={{ padding: "7px 14px", borderRadius: 4, border: `1px solid ${C.ac}40`, background: C.ac + "12", color: C.ac, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              Importer un texte
            </button>
          )}
          <button
            onClick={navigateBack}
            style={{ padding: "7px 14px", borderRadius: 4, border: `1px solid ${C.brd}`, background: "transparent", color: C.tx2, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
          >
            Annuler
          </button>
          <button
            onClick={() => handleSave(false)}
            disabled={isSaving}
            style={{ padding: "7px 16px", borderRadius: 4, border: "none", background: C.acV, color: "#0E0C0A", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: isSaving ? 0.7 : 1 }}
          >
            {isSaving ? "Enregistrement…" : "Enregistrer"}
          </button>
          {athleteId && (
            <button
              onClick={() => handleSave(true)}
              disabled={isSaving}
              style={{ padding: "7px 16px", borderRadius: 4, border: `1px solid ${C.g}50`, background: C.g + "15", color: C.g, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              Enregistrer & planifier
            </button>
          )}
        </div>
      </div>

      {/* ── Main layout ── */}
      <div style={{
        display: "flex", gap: 0,
        // Desktop: side by side; mobile: stacked (via media query not available inline — use flex-wrap)
        flexWrap: "wrap",
        minHeight: "calc(100vh - 61px)",
      }}>

        {/* ── Builder col (2/3) ── */}
        <div style={{
          flex: "2 1 420px", padding: "20px 20px 40px",
          borderRight: `1px solid ${C.brd}`,
          minWidth: 0,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
            Structure
          </div>
          {isClassique ? (
            <ClassiqueBuilder
              blocks={classiqueBlocks}
              onChange={setClassiqueBlocks}
              onImportFromBank={() => setShowBlockBank(true)}
              onSaveBlockToBank={handleSaveBlockToBank}
            />
          ) : (
            <>
              {importIssues.length > 0 && (
                <ImportReportPanel issues={importIssues} onClose={() => setImportIssues([])} />
              )}
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Consigne de la séance (optionnel, affichée à l'athlète)…"
                rows={notes ? 2 : 1}
                style={{
                  width: "100%", boxSizing: "border-box", resize: "vertical", marginBottom: 12,
                  background: C.s2, border: `1px solid ${C.brd}`, borderRadius: 4, color: C.tx,
                  fontSize: 12, padding: "8px 10px", fontFamily: "inherit", outline: "none",
                }}
              />
              <IntervalBuilder root={root} onChange={setRoot} athleteId={athleteId} sessionKind={sessionKind} />
            </>
          )}
        </div>

        {/* ── Preview col (1/3) ── */}
        <div style={{
          flex: "1 1 280px",
          position: "sticky",
          top: 61,
          alignSelf: "flex-start",
          padding: "20px 16px",
          maxHeight: "calc(100vh - 61px)",
          overflowY: "auto",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
            Aperçu
          </div>

          {isClassique ? (
            <ClassiquePreview blocks={classiqueBlocks} />
          ) : root.children.length === 0 ? (
            <div style={{ color: C.tx3, fontSize: 12, textAlign: "center", paddingTop: 40 }}>
              Ajoute des intervalles pour voir l'aperçu
            </div>
          ) : (
            <div style={{ background: C.s1, borderRadius: 4, padding: "14px 14px 10px", border: `1px solid ${C.brd}` }}>
              <SessionPreview intervals={root} />
            </div>
          )}

          {/* Schema drawing */}
          <div style={{ marginTop: 16 }}>
            {fieldSchema && (
              <div style={{ background: C.s1, borderRadius: 4, padding: 10, border: `1px solid ${C.brd}`, marginBottom: 8 }}>
                <SchemaViewerWithZoom schema={fieldSchema} />
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setShowSchemaEditor(true)}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: 4,
                  border: `1px dashed ${C.brdL}`, background: "transparent",
                  color: C.tx3, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {fieldSchema ? "Modifier le schéma" : "Ajouter un schéma terrain"}
              </button>
              {fieldSchema && (
                <button
                  onClick={() => setFieldSchema(null)}
                  style={{
                    padding: "10px 12px", borderRadius: 4,
                    border: `1px solid rgba(239,68,68,0.3)`, background: "rgba(239,68,68,0.08)",
                    color: "#EF4444", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <SchemaEditor
            open={showSchemaEditor}
            onOpenChange={setShowSchemaEditor}
            value={fieldSchema}
            onSave={(s) => { setFieldSchema(s); setShowSchemaEditor(false); }}
          />

          {/* ── Illustrations ── */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              Illustrations
            </div>

            {/* Existing images */}
            {images.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                {images.map((img, i) => (
                  <div key={i} style={{ position: "relative", width: 80, height: 80, borderRadius: 4, overflow: "hidden", border: `1px solid ${C.brd}`, cursor: "pointer" }}
                    onClick={() => setPreviewImage(img.url)}>
                    <img src={img.url} alt={img.caption || ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button
                      onClick={(e) => { e.stopPropagation(); setImages(prev => prev.filter((_, j) => j !== i)); }}
                      style={{
                        position: "absolute", top: 2, right: 2,
                        width: 20, height: 20, borderRadius: "50%",
                        background: "rgba(0,0,0,0.6)", border: "none",
                        color: "#fff", fontSize: 12, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        lineHeight: 1,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* URL input */}
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input
                value={imageUrlInput}
                onChange={(e) => setImageUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddImageUrl(); } }}
                placeholder="Coller une URL d'image…"
                style={{
                  flex: 1, padding: "7px 10px", borderRadius: 4,
                  border: `1px solid ${C.brd}`, background: C.s2,
                  color: C.tx, fontSize: 12, fontFamily: "inherit", outline: "none",
                }}
              />
              <button
                onClick={handleAddImageUrl}
                disabled={!imageUrlInput.trim()}
                style={{
                  padding: "7px 12px", borderRadius: 4,
                  border: `1px solid ${C.ac}40`, background: C.ac + "12",
                  color: C.ac, fontSize: 12, fontWeight: 600,
                  cursor: imageUrlInput.trim() ? "pointer" : "default",
                  fontFamily: "inherit", opacity: imageUrlInput.trim() ? 1 : 0.5,
                }}
              >
                +
              </button>
            </div>

            {/* File upload */}
            <label style={{
              display: "block", padding: "10px 0", borderRadius: 4,
              border: `1px dashed ${C.brdL}`, background: "transparent",
              color: isUploading ? C.ac : C.tx3, fontSize: 12, fontWeight: 600,
              cursor: isUploading ? "wait" : "pointer", fontFamily: "inherit",
              textAlign: "center",
            }}>
              {isUploading ? "Upload en cours…" : "Glisser ou cliquer pour ajouter une photo"}
              <input
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                disabled={isUploading}
                onChange={(e) => {
                  const files = e.target.files;
                  if (files) Array.from(files).forEach(handleUploadImage);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          {/* Mini totals recap */}
          {totals.durationS > 0 && (
            <div style={{ marginTop: 16, fontSize: 12, color: C.tx2, display: "flex", flexDirection: "column", gap: 4 }}>
              <div>
                <span style={{ color: C.tx3 }}>Durée estimée</span>{" "}
                <strong style={{ color: C.tx }}>{formatSLong(totals.durationS)}</strong>
              </div>
              {totals.distanceM > 0 && (
                <div>
                  <span style={{ color: C.tx3 }}>Distance</span>{" "}
                  <strong style={{ color: C.tx }}>{(totals.distanceM / 1000).toFixed(1)} km</strong>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Import modal ── */}
      {showTextImport && (
        <ImportEnergyTextDialog
          onImport={handleTextImport}
          onClose={() => setShowTextImport(false)}
          replacesExisting={root.children.length > 0}
        />
      )}

      {showImport && (
        <ImportSessionModal
          onImport={handleImportSession}
          onClose={() => setShowImport(false)}
        />
      )}

      {/* ── Banque de blocs (format Classique) ── */}
      {showBlockBank && (
        <BlockBankDrawer
          onInsert={(imported) => setClassiqueBlocks((prev) => [...prev, ...imported])}
          onClose={() => setShowBlockBank(false)}
        />
      )}

      {/* ── Assign modal ── */}
      {showAssignModal && savedSessionId && athleteId && (
        <AssignModal
          sessionId={savedSessionId}
          athleteId={athleteId}
          onClose={() => { setShowAssignModal(false); navigateBack(); }}
        />
      )}

      {/* ── Image lightbox ── */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.85)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "zoom-out",
          }}
        >
          <img
            src={previewImage}
            alt=""
            style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 4 }}
          />
        </div>
      )}
    </div>
  );
}
