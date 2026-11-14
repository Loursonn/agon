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
import { cn } from "@/lib/utils";
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
import { Avatar, CheckBox, SectionHead } from "@/features/shared/components/ordi/OrdiUi";
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

// ── Classes partagées ───────────────────────────────────────────────────────

/** Carte des planches « ordi » (ORDI_CARD en classes). */
const ORDI_CARD_CLS = "rounded-[14px] border border-agon-brd bg-agon-s1";
/** Titre Archivo étiré (DISPLAY en classes). */
const DISPLAY_CLS = "font-display [font-stretch:125%] uppercase font-light tracking-[0.05em]";
const ACCENT_BTN = "cursor-pointer rounded border border-agon-accent/25 bg-agon-accent/[0.071] px-3.5 py-[7px] text-[12px] font-semibold text-agon-accent";
const KICKER = "mb-2 text-[11px] font-bold uppercase tracking-[0.05em] text-agon-tx3";

// ── Import session modal ─────────────────────────────────────────────────────

type ImportTone = { hover: string; soft: string; text: string };
/** Teinte par type de séance (classes écrites en entier pour Tailwind). */
const IMPORT_TONES = {
  accent:    { hover: "hover:border-agon-accent/[0.376]",    soft: "bg-agon-accent/[0.125]",    text: "text-agon-accent" },
  info:      { hover: "hover:border-agon-info/[0.376]",      soft: "bg-agon-info/[0.125]",      text: "text-agon-info" },
  alerte:    { hover: "hover:border-agon-alerte/[0.376]",    soft: "bg-agon-alerte/[0.125]",    text: "text-agon-alerte" },
  succes:    { hover: "hover:border-agon-succes/[0.376]",    soft: "bg-agon-succes/[0.125]",    text: "text-agon-succes" },
  amethyste: { hover: "hover:border-agon-amethyste/[0.376]", soft: "bg-agon-amethyste/[0.125]", text: "text-agon-amethyste" },
  patine:    { hover: "hover:border-agon-patine/[0.376]",    soft: "bg-agon-patine/[0.125]",    text: "text-agon-patine" },
  tx3:       { hover: "hover:border-agon-tx3/[0.376]",       soft: "bg-agon-tx3/[0.125]",       text: "text-agon-tx3" },
} satisfies Record<string, ImportTone>;

const KIND_TONE: Record<string, ImportTone> = {
  vo2: IMPORT_TONES.accent, tempo: IMPORT_TONES.info, seuil: IMPORT_TONES.alerte,
  footing: IMPORT_TONES.succes, fartlek: IMPORT_TONES.amethyste, autre: IMPORT_TONES.tx3, custom: IMPORT_TONES.patine,
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
      <div onClick={onClose} className="fixed inset-0 z-[60] bg-black/60" />
      <div className="fixed left-1/2 top-1/2 z-[61] flex max-h-[80vh] w-[520px] max-w-[94vw] flex-col rounded-[6px] border border-agon-brd bg-agon-s1 [transform:translate(-50%,-50%)] animate-[fadeScaleIn_150ms_ease-out]">
        <style>{`@keyframes fadeScaleIn { from { opacity:0; transform:translate(-50%,-50%) scale(0.96) } to { opacity:1; transform:translate(-50%,-50%) scale(1) } }`}</style>

        <div className="shrink-0 border-b border-agon-brd px-5 py-4">
          <div className="text-[15px] font-extrabold text-agon-tx">Importer une séance existante</div>
          <div className="mt-0.5 text-[11px] text-agon-tx3">La structure sera copiée — l'original ne sera pas modifié</div>
        </div>

        <div className="shrink-0 border-b border-agon-brd px-5 py-2.5">
          <input
            autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="box-border w-full rounded border border-agon-brd-l bg-agon-s2 px-2.5 py-2 text-[12px] text-agon-tx outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 [scrollbar-width:none]">
          {isLoading ? (
            <div className="py-[30px] text-center text-[12px] text-agon-tx3">Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="py-[30px] text-center text-[13px] text-agon-tx3">
              {search ? "Aucun résultat" : "Aucune séance disponible"}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {filtered.map((s) => {
                const tone = KIND_TONE[s.session_kind] ?? IMPORT_TONES.tx3;
                return (
                  <div
                    key={s.id}
                    onClick={() => onImport(s)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded border border-agon-brd-l bg-agon-s2 px-3 py-2.5 [transition:border-color_120ms]",
                      tone.hover,
                    )}
                  >
                    <div className={cn("flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded", tone.soft)}>
                      <Zap size={14} className={tone.text} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-bold text-agon-tx">{s.name}</div>
                      <div className="mt-px text-[10px] text-agon-tx3">
                        {s.session_kind}{s.total_duration_s ? ` · ${Math.round(s.total_duration_s / 60)} min` : ""}
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] font-semibold text-agon-accent">Importer</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-agon-brd px-5 py-3">
          <button onClick={onClose} className="cursor-pointer rounded border border-agon-brd-l bg-transparent px-3.5 py-2 text-[12px] text-agon-tx2">
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
      <div className="p-8 text-[13px] text-agon-tx3">Chargement…</div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col gap-5 bg-agon-bg px-4 pb-10 pt-4 lg:px-10 lg:pb-12 lg:pt-6">
      {/* ── Fil d'Ariane (planche CoachOrdiAEditeurEnergie) ── */}
      <div className="flex items-center gap-2 text-[13px]">
        <button
          onClick={navigateBack}
          className="cursor-pointer bg-transparent p-0 text-[13px] text-agon-tx3"
        >
          ‹ {athleteId ? "Programmation" : "Banque"}
        </button>
        <span className="text-agon-tx3">›</span>
        <span className="text-agon-tx2">{isEdit ? "Modifier la séance" : isSpecifique ? "Nouvelle séance spécifique" : "Nouvelle séance d’énergie"}</span>
      </div>

      {/* ── Carte titre : type, nom, sport, actions ── */}
      <div className={cn(ORDI_CARD_CLS, "relative flex flex-wrap items-center gap-3.5 overflow-hidden py-[18px] pl-[26px] pr-[22px]")}>
        <span className={cn("absolute inset-y-0 left-0 w-[3px]", isSpecifique ? "bg-agon-alerte" : "bg-agon-info")} />
        {!isSpecifique && (
          <span className="rounded-[999px] bg-agon-info px-2.5 py-0.5 text-[11.5px] font-semibold text-agon-ink">Énergie</span>
        )}

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom de la séance…"
          aria-label="Nom de la séance"
          className={cn("min-w-[220px] flex-1 border-b border-agon-brd-l bg-transparent py-0.5 text-[24px] text-agon-tx outline-none", DISPLAY_CLS)}
        />

        <div className="flex flex-wrap items-center gap-2">
          {sessionKind === "specifique" ? (
            <>
              {/* Spécifique badge */}
              <span className="rounded-[6px] bg-agon-alerte/[0.125] px-2.5 py-[5px] text-[12px] font-semibold text-agon-alerte">
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
                accent={C.o}
              />
              {/* Qualité physique */}
              <TaxonomySelect
                placeholder="Qualité"
                options={qualities}
                value={qualityId}
                onChange={setQualityId}
                onCreate={async (n) => user?.id ? await createQuality.mutateAsync({ name: n, coachId: user.id }) : undefined}
                width={150}
                accent={C.ac}
              />
              {/* Legacy WOD pleine page : proposer la conversion en blocs */}
              {format === "wod" && (
                <button
                  onClick={convertLegacyToBlocks}
                  title="Encapsule les intervalles actuels dans un bloc WOD"
                  className="cursor-pointer rounded-[6px] border border-agon-alerte/25 bg-agon-alerte/[0.051] px-3 py-[5px] text-[11px] font-semibold text-agon-alerte"
                >
                  Convertir en blocs
                </button>
              )}
            </>
          ) : (
            <>
              {/* Energy session kind */}
              <Select value={sessionKind} onValueChange={(v) => setSessionKind(v as SessionKind)}>
                <SelectTrigger className="w-[170px] border-agon-brd bg-agon-s2 text-[12px] leading-5 text-agon-tx">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SESSION_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Sport : décide du mode de la montre (Garmin) */}
              <div role="radiogroup" aria-label="Sport" className="flex gap-0.5 rounded-[10px] border border-agon-brd-l bg-agon-bg p-[3px]">
                {ENERGY_SPORTS.map((s) => {
                  const on = sport === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setSport(s.value as EnergySport)}
                      className={cn(
                        "h-[30px] cursor-pointer whitespace-nowrap rounded-[8px] px-3 text-[12.5px]",
                        on ? "bg-agon-s2 font-semibold text-agon-tx" : "bg-transparent font-medium text-agon-tx3",
                      )}
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
                  className="w-[140px] rounded-[6px] border border-agon-brd bg-agon-s2 px-2.5 py-1.5 text-[12px] text-agon-tx outline-none"
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
              <ToggleGroupItem value="continu" className="text-[11px] leading-5">Continu</ToggleGroupItem>
              <ToggleGroupItem value="fractionne" className="text-[11px] leading-5">Fractionné</ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>

        {/* Action buttons */}
        <div className="ml-auto flex flex-wrap gap-2">
          {!isEdit && (
            <button
              onClick={() => setShowImport(true)}
              className={ACCENT_BTN}
            >
              Importer une séance
            </button>
          )}
          {(!isSpecifique || isClassique) && (
            <button
              onClick={() => setShowTextImport(true)}
              title="Coller une séance écrite au format YOXX"
              className={ACCENT_BTN}
            >
              Importer un texte
            </button>
          )}
          <button
            onClick={navigateBack}
            className="cursor-pointer rounded border border-agon-brd bg-transparent px-3.5 py-[7px] text-[12px] text-agon-tx2"
          >
            Annuler
          </button>
        </div>
      </div>

      {/* ── 01 Profil de la séance ── */}
      <section className="flex flex-col gap-3">
        <SectionHead n={1} title="Profil de la séance" />
        <div className={cn(ORDI_CARD_CLS, "flex flex-wrap items-stretch gap-7 px-5 py-4")}>
          <div className="flex min-w-[170px] flex-col gap-3.5">
            <div>
              <div className="text-[12px] text-agon-tx3">Durée estimée</div>
              <div className="mt-1 font-data text-[24px] tabular-nums text-agon-tx">{totals.durationS > 0 ? `≈ ${formatSLong(totals.durationS)}` : "—"}</div>
            </div>
            <div>
              <div className="text-[12px] text-agon-tx3">Distance estimée</div>
              <div className="mt-1 font-data text-[24px] tabular-nums text-agon-tx">
                {totals.distanceM > 0 ? <>≈ {(totals.distanceM / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}<span className="text-[12px] text-agon-tx3"> km</span></> : "—"}
              </div>
            </div>
          </div>
          <div className="min-w-[320px] flex-1">
            {isClassique ? (
              <ClassiquePreview blocks={classiqueBlocks} />
            ) : root.children.length === 0 ? (
              <div className="pt-6 text-[12.5px] text-agon-tx3">
                Ajoute des blocs pour voir le profil de la séance.
              </div>
            ) : (
              <SessionPreview intervals={root} />
            )}
          </div>
        </div>
      </section>

      {/* ── Main layout ── */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">

        {/* ── 02 Blocs ── */}
        <section className="flex min-w-0 flex-col gap-3">
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
        <aside className="static top-4 flex flex-col gap-3 lg:sticky">
          <SectionHead n={3} title="Enregistrer" />
          <div className={cn(ORDI_CARD_CLS, "flex flex-col gap-3.5 p-4")}>
            {athleteId && (
              <div className="flex flex-col gap-2.5">
                <span className="text-[12px] text-agon-tx3">Enregistrer pour</span>
                <SaveOption on={!bankOnly} onSelect={() => setBankOnly(false)}>
                  <Avatar name={athleteName} size={24} />
                  <span className="text-[13.5px] font-medium text-agon-tx">{athleteName}</span>
                </SaveOption>
                {!bankOnly && (
                  <div className="flex flex-col gap-2.5 pl-[26px]">
                    <label className="flex items-center gap-2">
                      <span className="w-[22px] text-[12.5px] text-agon-tx3">Le</span>
                      <input
                        type="date"
                        value={planDate}
                        onChange={(e) => setPlanDate(e.target.value)}
                        aria-label="Date de la séance"
                        className="box-border h-[34px] flex-1 rounded-[8px] border border-agon-brd-l bg-agon-s2 px-2.5 text-[13px] text-agon-tx"
                      />
                    </label>
                    {!planDate && <span className="text-[11.5px] text-agon-tx3">Sans date, la séance reste à programmer.</span>}
                    <CheckBox checked={keepCopy} onChange={setKeepCopy} label="Garder aussi une copie dans ma banque" />
                  </div>
                )}
                {!isEdit && (
                  <SaveOption on={bankOnly} onSelect={() => setBankOnly(true)}>
                    <span>
                      <span className="block text-[13.5px] font-medium text-agon-tx">Ma banque seulement</span>
                      <span className="block text-[12px] text-agon-tx3">À programmer plus tard, pour tout athlète</span>
                    </span>
                  </SaveOption>
                )}
              </div>
            )}
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] text-agon-tx3">{athleteId && !bankOnly ? `Consigne pour ${athleteFirst}` : "Consigne"}</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optionnel, affichée à l’athlète avec la séance…"
                rows={3}
                className="box-border w-full resize-y rounded-[10px] border border-agon-brd-l bg-agon-bg px-[11px] py-[9px] text-[13px] leading-[1.5] text-agon-tx outline-none"
              />
            </label>
            <button
              onClick={() => void handleSave()}
              disabled={isSaving}
              className={cn(
                "h-10 cursor-pointer rounded-[10px] bg-agon-accent text-[13.5px] font-semibold text-agon-ink",
                isSaving ? "opacity-70" : "opacity-100",
              )}
            >
              {isSaving ? "Enregistrement…" : athleteId && !bankOnly ? `Enregistrer pour ${athleteName}` : "Enregistrer dans ma banque"}
            </button>
            <button
              onClick={navigateBack}
              className="cursor-pointer self-center bg-transparent text-[12.5px] text-agon-tx3"
            >
              Annuler
            </button>
          </div>

          {/* Schema drawing */}
          <div className="mt-1">
            {fieldSchema && (
              <div className="mb-2 rounded border border-agon-brd bg-agon-s1 p-2.5">
                <SchemaViewerWithZoom schema={fieldSchema} />
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowSchemaEditor(true)}
                className="flex-1 cursor-pointer rounded border border-dashed border-agon-brd-l bg-transparent py-2.5 text-[12px] font-semibold text-agon-tx3"
              >
                {fieldSchema ? "Modifier le schéma" : "Ajouter un schéma terrain"}
              </button>
              {fieldSchema && (
                <button
                  onClick={() => setFieldSchema(null)}
                  className="cursor-pointer rounded border border-agon-erreur/30 bg-agon-erreur/[0.08] px-3 py-2.5 text-[12px] font-semibold text-agon-erreur"
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
          <div className="mt-4">
            <div className={KICKER}>
              Fiches
            </div>
            <FicheAttachmentsEditor value={fiches} onChange={setFiches} athleteId={athleteId} />
          </div>

          {/* ── Illustrations ── */}
          <div className="mt-4">
            <div className={KICKER}>
              Illustrations
            </div>

            {/* Existing images */}
            {images.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {images.map((img, i) => (
                  <div key={i} className="relative h-20 w-20 cursor-pointer overflow-hidden rounded border border-agon-brd"
                    onClick={() => setPreviewImage(img.url)}>
                    <img src={img.url} alt={img.caption || ""} className="h-full w-full object-cover" />
                    <button
                      onClick={(e) => { e.stopPropagation(); setImages(prev => prev.filter((_, j) => j !== i)); }}
                      className="absolute right-0.5 top-0.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-[50%] bg-black/60 text-[12px] leading-none text-agon-tx"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* URL input */}
            <div className="mb-1.5 flex gap-1.5">
              <input
                value={imageUrlInput}
                onChange={(e) => setImageUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddImageUrl(); } }}
                placeholder="Coller une URL d'image…"
                className="flex-1 rounded border border-agon-brd bg-agon-s2 px-2.5 py-[7px] text-[12px] text-agon-tx outline-none"
              />
              <button
                onClick={handleAddImageUrl}
                disabled={!imageUrlInput.trim()}
                className={cn(
                  "rounded border border-agon-accent/25 bg-agon-accent/[0.071] px-3 py-[7px] text-[12px] font-semibold text-agon-accent",
                  imageUrlInput.trim() ? "cursor-pointer opacity-100" : "cursor-default opacity-50",
                )}
              >
                +
              </button>
            </div>

            {/* File upload */}
            <label className={cn(
              "block rounded border border-dashed border-agon-brd-l bg-transparent py-2.5 text-center text-[12px] font-semibold",
              isUploading ? "cursor-wait text-agon-accent" : "cursor-pointer text-agon-tx3",
            )}>
              {isUploading ? "Upload en cours…" : "Glisser ou cliquer pour ajouter une photo"}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
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
          className="fixed inset-0 z-[9999] flex cursor-zoom-out items-center justify-center bg-black/[0.85]"
        >
          <img
            src={previewImage}
            alt=""
            className="max-h-[90vh] max-w-[90vw] rounded object-contain"
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
      className="flex cursor-pointer items-center gap-2.5 bg-transparent p-0 text-left"
    >
      <span aria-hidden className={cn("box-border flex h-4 w-4 flex-none items-center justify-center rounded-[999px] border", on ? "border-agon-accent" : "border-agon-brd-l")}>
        {on && <span className="h-2 w-2 rounded-[999px] bg-agon-accent" />}
      </span>
      {children}
    </button>
  );
}
