/**
 * EnergySessionEditorPage
 *
 * Routes :
 *   /coach/athletes/:athleteId/energy/new
 *   /coach/athletes/:athleteId/energy/:sessionId/edit
 *   /coach/energy-library/new
 *   /coach/energy-library/:sessionId/edit
 */
import { useState, useEffect, type ReactNode } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Zap } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { C } from "@/lib/theme";
import { useQueryClient } from "@tanstack/react-query";
import { FicheAttachmentsEditor } from "@/features/shared/components/fiches/FicheAttachmentsEditor";
import { syncEnergySessionAthletes } from "@/features/shared/hooks/fiches/syncDocAssignments";
import type { FicheAttachment } from "@/features/shared/types/fiches";
import { makeRootGroup, genId } from "@/lib/energy/treeUtils";
import { expandIntervals, computeTotals } from "@/lib/energy";
import { formatSLong } from "@/lib/energy/formatTarget";
import { ENERGY_SPORTS, energySportOf, type EnergySport } from "@/lib/energy/sports";
import type { EnergyGroup, EnergyStep, SessionKind, StructureType, FieldSchema, SessionImage } from "@/types/energy";
import { useAuth } from "@/hooks/useAuth";
import { uploadEnergySessionImage } from "@/api/energy";
import { compressImage } from "@/lib/compressImage";
import IntervalBuilder from "../components/energy/IntervalBuilder";
import { EnergyBlockCards } from "../components/energy/EnergyBlockCards";
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
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { Avatar, CheckBox, ORDI_CARD, SectionHead, MONO as ORDI_MONO, DISPLAY } from "@/features/shared/components/ordi/OrdiUi";
import ImportEnergyTextDialog from "../components/import/ImportEnergyTextDialog";
import { issueCounts } from "../components/import/importIssues";
import ImportReportPanel from "../components/import/ImportReportPanel";
import ImportSpecificTextDialog, { type SpecificImportApply } from "../components/import/ImportSpecificTextDialog";
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


// ── Import session modal ─────────────────────────────────────────────────────

const KIND_COLOR: Record<string, string> = {
  vo2: "#FFC933", tempo: "#33B5FF", seuil: "#F59E0B",
  footing: "#22C55E", fartlek: "#EC4899", autre: "#6B7280", custom: "#14B8A6",
};

function deepCloneIntervals(steps: EnergyStep[]): EnergyStep[] {
  return steps.map((s): EnergyStep => {
    if (s.type === "interval" || s.type === "exercise") return { ...s, id: genId() };
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EnergySessionEditorPage() {
  const { athleteId, sessionId } = useParams<{ athleteId?: string; sessionId?: string }>();
  const [searchParams] = useSearchParams();
  const { user, athletes } = useAuth();
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
  const [sport, setSport] = useState<EnergySport>("course");
  const [structureType, setStructureType] = useState<StructureType>("fractionne");
  const [root, setRoot] = useState<EnergyGroup>(makeRootGroup);
  const [fieldSchema, setFieldSchema] = useState<FieldSchema | null>(null);
  const [showSchemaEditor, setShowSchemaEditor] = useState(false);
  const [images, setImages] = useState<SessionImage[]>([]);
  const [fiches, setFiches] = useState<FicheAttachment[]>([]);
  const qc = useQueryClient();
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  // Enregistrer (planche CoachOrdiAEditeurEnergie) : pour l'athlète à une date, copie dans la banque, ou banque seule.
  const [planDate, setPlanDate] = useState(searchParams.get("date") ?? "");
  const [keepCopy, setKeepCopy] = useState(false);
  const [bankOnly, setBankOnly] = useState(false);
  const assign = useAssignEnergySession();
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
  const athleteName = athletes.find((a) => a.id === athleteId)?.full_name?.trim() || "l’athlète";
  const athleteFirst = athleteName.split(/\s+/)[0];

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
      setSport(energySportOf(existingSession.modality));
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
      setImages((existingSession.images ?? []).filter((img: SessionImage) => !img.url.startsWith("blob:")));
      setFiches(existingSession.fiches ?? []);
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
    setSport(energySportOf(session.modality));
    setStructureType(session.structure_type);
    setNotes(session.notes ?? "");
    const clonedChildren = deepCloneIntervals(session.intervals ?? []);
    setRoot({
      type: "group", id: "__root__", role: "open", repeat: 1,
      children: clonedChildren,
    });
    setSportId(session.sport_id ?? null);
    setQualityId(session.quality_id ?? null);
    setImages((session.images ?? []).filter((img: SessionImage) => !img.url.startsWith("blob:")));
    setFiches(session.fiches ?? []);
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

  function handleSpecificTextImport(data: SpecificImportApply, issues: ImportIssue[]) {
    setName(data.name);
    setSportId(data.sport_id);
    setQualityId(data.quality_id);
    setFormat("classique");
    setClassiqueBlocks(data.blocks);
    setNotes(data.notes ?? "");
    if (data.images.length > 0) setImages((prev) => [...prev, ...data.images]);
    setImportIssues(issues.filter((i) => i.level !== "info"));
    setShowTextImport(false);
    const { errors } = issueCounts(issues);
    if (errors > 0) toast.warning(`Séance importée — ${errors} point${errors > 1 ? "s" : ""} à compléter`);
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
  const isDesktop = useIsDesktop();

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
      const publicUrl = await uploadEnergySessionImage(user.id, compressed);
      // Replace local preview with remote URL
      setImages(prev => prev.map(img => img.caption === tempId ? { url: publicUrl } : img));
      URL.revokeObjectURL(localUrl);
    } catch (err) {
      console.error("[image upload]", err);
      // L'aperçu local (blob:) ne doit pas être enregistré dans la séance :
      // personne d'autre ne pourrait l'afficher.
      setImages(prev => prev.filter(img => img.caption !== tempId));
      URL.revokeObjectURL(localUrl);
      toast.error("Envoi de l'image impossible, réessaie");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSave() {
    const effectiveKind: SessionKind = sessionKind;
    const base = {
      name: name.trim() || "Séance sans titre",
      session_kind: effectiveKind,
      custom_kind: sessionKind === "specifique"
        ? (existingSession?.custom_kind ?? null)
        : (sessionKind === "custom" ? customKind : null),
      // Spécifique : séance « course sur tapis » côté montre, le sport n'est pas demandé.
      modality: isSpecifique ? (existingSession?.modality ?? null) : sport,
      notes: notes.trim() || null,
      structure_type: structureType,
      intervals: root.children,
      schema: fieldSchema ?? null,
      images: images.length > 0 ? images : null,
      fiches: fiches.length > 0 ? fiches : null,
      sport_id: isSpecifique ? sportId : null,
      quality_id: isSpecifique ? qualityId : null,
      format: isSpecifique ? format : "wod",
      classique_structure: isSpecifique && classiqueBlocks.length > 0
        ? { blocks: classiqueBlocks }
        : null,
      created_by: user?.id ?? null,
    };

    const forAthlete = !!athleteId && !bankOnly;
    const payload = { ...base, ...(forAthlete ? { athlete_id: athleteId } : {}) };
    type CreateInput = Parameters<typeof createMutation.mutateAsync>[0];

    let id: string | null = null;
    if (isEdit && sessionId) {
      await updateMutation.mutateAsync({ id: sessionId, ...payload });
      // Attributions 'energie' des athlètes qui ont cette séance au planning
      void syncEnergySessionAthletes(sessionId, qc);
      id = sessionId;
    } else {
      const created = await createMutation.mutateAsync(payload as CreateInput);
      id = created?.id ?? null;
    }
    // « Garder aussi une copie dans ma banque » : une 2e séance, sans athlète.
    if (forAthlete && keepCopy) await createMutation.mutateAsync(base as CreateInput);
    if (forAthlete && planDate && id) {
      await assign.mutateAsync({ energy_session_id: id, athlete_id: athleteId!, scheduled_date: planDate, status: "planned" });
    }
    if (athleteId && !forAthlete) toast.success("Séance ajoutée à ta banque");
    navigateBack();
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

  const isSaving = createMutation.isPending || updateMutation.isPending || assign.isPending;

  if (isLoading && isEdit) {
    return (
      <div style={{ padding: 32, color: C.tx3, fontSize: 13 }}>Chargement…</div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: isDesktop ? "24px 40px 48px" : "16px 16px 40px", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Fil d'Ariane (planche CoachOrdiAEditeurEnergie) ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <button
          onClick={navigateBack}
          style={{ background: "none", border: "none", padding: 0, color: C.tx3, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
        >
          ‹ {athleteId ? "Programmation" : "Banque"}
        </button>
        <span style={{ color: C.tx3 }}>›</span>
        <span style={{ color: C.tx2 }}>{isEdit ? "Modifier la séance" : isSpecifique ? "Nouvelle séance spécifique" : "Nouvelle séance d’énergie"}</span>
      </div>

      {/* ── Carte titre : type, nom, sport, actions ── */}
      <div style={{
        ...ORDI_CARD, position: "relative", overflow: "hidden",
        padding: "18px 22px 18px 26px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
      }}>
        <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: isSpecifique ? ORANGE : C.b }} />
        {!isSpecifique && (
          <span style={{ background: C.b, color: "#0E0C0A", borderRadius: 999, padding: "2px 10px", fontSize: 11.5, fontWeight: 600 }}>Énergie</span>
        )}

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom de la séance…"
          aria-label="Nom de la séance"
          style={{
            flex: 1, minWidth: 220,
            background: "transparent", border: "none",
            borderBottom: `1px solid ${C.brdL}`,
            color: C.tx, fontSize: 24, ...DISPLAY,
            outline: "none", padding: "2px 0",
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
              {/* Sport : décide du mode de la montre (Garmin) */}
              <div role="radiogroup" aria-label="Sport" style={{ display: "flex", background: C.bg, border: `1px solid ${C.brdL}`, borderRadius: 10, padding: 3, gap: 2 }}>
                {ENERGY_SPORTS.map((s) => {
                  const on = sport === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setSport(s.value as EnergySport)}
                      style={{ height: 30, padding: "0 12px", borderRadius: 8, border: "none", background: on ? C.s2 : "transparent", color: on ? C.tx : C.tx3, fontSize: 12.5, fontWeight: on ? 600 : 500, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginLeft: "auto" }}>
          {!isEdit && (
            <button
              onClick={() => setShowImport(true)}
              style={{ padding: "7px 14px", borderRadius: 4, border: `1px solid ${C.ac}40`, background: C.ac + "12", color: C.ac, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              Importer une séance
            </button>
          )}
          {(!isSpecifique || isClassique) && (
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
        </div>
      </div>

      {/* ── 01 Profil de la séance ── */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionHead n={1} title="Profil de la séance" />
        <div style={{ ...ORDI_CARD, padding: "16px 20px", display: "flex", gap: 28, alignItems: "stretch", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 170 }}>
            <div>
              <div style={{ fontSize: 12, color: C.tx3 }}>Durée estimée</div>
              <div style={{ ...ORDI_MONO, fontSize: 24, color: C.tx, marginTop: 4 }}>{totals.durationS > 0 ? `≈ ${formatSLong(totals.durationS)}` : "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.tx3 }}>Distance estimée</div>
              <div style={{ ...ORDI_MONO, fontSize: 24, color: C.tx, marginTop: 4 }}>
                {totals.distanceM > 0 ? <>≈ {(totals.distanceM / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}<span style={{ fontSize: 12, color: C.tx3 }}> km</span></> : "—"}
              </div>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 320 }}>
            {isClassique ? (
              <ClassiquePreview blocks={classiqueBlocks} />
            ) : root.children.length === 0 ? (
              <div style={{ color: C.tx3, fontSize: 12.5, paddingTop: 24 }}>
                Ajoute des blocs pour voir le profil de la séance.
              </div>
            ) : (
              <SessionPreview intervals={root} />
            )}
          </div>
        </div>
      </section>

      {/* ── Main layout ── */}
      <div style={{
        display: "grid", gap: 24, alignItems: "start",
        gridTemplateColumns: isDesktop ? "minmax(0, 1fr) 340px" : "1fr",
      }}>

        {/* ── 02 Blocs ── */}
        <section style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <SectionHead n={2} title="Blocs" />
          {importIssues.length > 0 && (
            <ImportReportPanel issues={importIssues} onClose={() => setImportIssues([])} />
          )}
          {isClassique ? (
            <ClassiqueBuilder
              blocks={classiqueBlocks}
              onChange={setClassiqueBlocks}
              onImportFromBank={() => setShowBlockBank(true)}
              onSaveBlockToBank={handleSaveBlockToBank}
            />
          ) : (
            isSpecifique
              ? <IntervalBuilder root={root} onChange={setRoot} athleteId={athleteId} sessionKind={sessionKind} />
              : <EnergyBlockCards root={root} onChange={setRoot} athleteId={athleteId} sessionKind={sessionKind} />
          )}
        </section>

        {/* ── 03 Enregistrer ── */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 12, position: isDesktop ? "sticky" : "static", top: 16 }}>
          <SectionHead n={3} title="Enregistrer" />
          <div style={{ ...ORDI_CARD, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            {athleteId && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ fontSize: 12, color: C.tx3 }}>Enregistrer pour</span>
                <SaveOption on={!bankOnly} onSelect={() => setBankOnly(false)}>
                  <Avatar name={athleteName} size={24} />
                  <span style={{ fontSize: 13.5, fontWeight: 500, color: C.tx }}>{athleteName}</span>
                </SaveOption>
                {!bankOnly && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 26 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12.5, color: C.tx3, width: 22 }}>Le</span>
                      <input
                        type="date"
                        value={planDate}
                        onChange={(e) => setPlanDate(e.target.value)}
                        aria-label="Date de la séance"
                        style={{ flex: 1, height: 34, boxSizing: "border-box", background: C.s2, border: `1px solid ${C.brdL}`, borderRadius: 8, color: C.tx, fontSize: 13, padding: "0 10px", fontFamily: "inherit" }}
                      />
                    </label>
                    {!planDate && <span style={{ fontSize: 11.5, color: C.tx3 }}>Sans date, la séance reste à programmer.</span>}
                    <CheckBox checked={keepCopy} onChange={setKeepCopy} label="Garder aussi une copie dans ma banque" />
                  </div>
                )}
                {!isEdit && (
                  <SaveOption on={bankOnly} onSelect={() => setBankOnly(true)}>
                    <span>
                      <span style={{ display: "block", fontSize: 13.5, fontWeight: 500, color: C.tx }}>Ma banque seulement</span>
                      <span style={{ display: "block", fontSize: 12, color: C.tx3 }}>À programmer plus tard, pour tout athlète</span>
                    </span>
                  </SaveOption>
                )}
              </div>
            )}
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, color: C.tx3 }}>{athleteId && !bankOnly ? `Consigne pour ${athleteFirst}` : "Consigne"}</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optionnel, affichée à l’athlète avec la séance…"
                rows={3}
                style={{
                  width: "100%", boxSizing: "border-box", resize: "vertical",
                  background: C.bg, border: `1px solid ${C.brdL}`, borderRadius: 10, color: C.tx,
                  fontSize: 13, padding: "9px 11px", fontFamily: "inherit", outline: "none", lineHeight: 1.5,
                }}
              />
            </label>
            <button
              onClick={() => void handleSave()}
              disabled={isSaving}
              style={{ height: 40, borderRadius: 10, border: "none", background: C.ac, color: "#0E0C0A", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: isSaving ? 0.7 : 1 }}
            >
              {isSaving ? "Enregistrement…" : athleteId && !bankOnly ? `Enregistrer pour ${athleteName}` : "Enregistrer dans ma banque"}
            </button>
            <button
              onClick={navigateBack}
              style={{ alignSelf: "center", background: "none", border: "none", color: C.tx3, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}
            >
              Annuler
            </button>
          </div>

          {/* Schema drawing */}
          <div style={{ marginTop: 4 }}>
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

          {/* ── Fiches ── */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              Fiches
            </div>
            <FicheAttachmentsEditor value={fiches} onChange={setFiches} athleteId={athleteId} />
          </div>

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

        </aside>
      </div>

      {/* ── Import modal ── */}
      {showTextImport && isSpecifique && (
        <ImportSpecificTextDialog
          onImport={handleSpecificTextImport}
          onClose={() => setShowTextImport(false)}
          replacesExisting={classiqueBlocks.length > 0}
        />
      )}

      {showTextImport && !isSpecifique && (
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

/** Choix rond de la planche (« Enregistrer pour Léa » / « Ma banque seulement »). */
function SaveOption({ on, onSelect, children }: { on: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onSelect}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: 0, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
    >
      <span aria-hidden style={{ width: 16, height: 16, flex: "none", boxSizing: "border-box", borderRadius: 999, border: `1px solid ${on ? C.ac : C.brdL}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {on && <span style={{ width: 8, height: 8, borderRadius: 999, background: C.ac }} />}
      </span>
      {children}
    </button>
  );
}
