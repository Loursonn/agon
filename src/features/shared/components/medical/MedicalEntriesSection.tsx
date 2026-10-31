import { useRef, useState } from "react";
import { FileText, Paperclip, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { formatFileSize } from "@/lib/compressImage";
import {
  MEDICAL_ACCEPT,
  useAddMedicalAttachment,
  useDeleteMedicalAttachment,
  useDeleteMedicalEntry,
  useMedicalEntries,
  useMedicalSignedUrls,
  useSaveMedicalEntry,
} from "@/features/shared/hooks/useMedicalEntries";
import { useMedicalHistory, useUpsertMedicalHistory } from "@/features/shared/hooks/useMedicalHistory";
import {
  DECLARED_BY_LABEL,
  MEDICAL_KIND_LABEL,
  MEDICAL_STATUS_LABEL,
  type MedicalAttachment,
  type MedicalEntry,
  type MedicalEntryInput,
  type MedicalEntryKind,
  type MedicalEntryStatus,
} from "@/features/shared/types/medical";
import {
  fmtInjuryDate,
  injuryDetailForSave,
  injuryDetailOf,
  injuryFacts,
  type InjuryDetail,
} from "@/lib/injuryDetails";
import { InjuryDetailFields, InjuryIntro } from "./InjuryDetailFields";
import { card, ghostBtn, inputStyle, labelStyle, primaryBtn } from "./medicalStyles";
import { Chip } from "./medicalUi";

// ── Section ─────────────────────────────────────────────────────────────────

/**
 * Antécédents médicaux détaillés (diagnostic, traitement, photos / PDF).
 * Utilisé côté athlète (Profil) et côté coach (Profil athlète) : les deux
 * peuvent ajouter / modifier.
 */
export function MedicalEntriesSection({
  athleteId, canEdit, canEditEntry, canEditHistory, asStaff = false,
}: {
  athleteId: string;
  /** Peut ajouter des antécédents (et, par défaut, tous les modifier). */
  canEdit: boolean;
  /** Restreint la modification par entrée (staff : les siennes, ou celles du coach si autorisé). */
  canEditEntry?: (e: MedicalEntry) => boolean;
  /** Allergies / traitements (medical_history). Par défaut = canEdit. */
  canEditHistory?: boolean;
  /** Saisie par un professionnel du staff. */
  asStaff?: boolean;
}) {
  const { data: entries = [], isLoading } = useMedicalEntries(athleteId);
  const [editing, setEditing] = useState<MedicalEntry | "new" | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {isLoading ? (
        <div style={{ ...card, color: C.tx3, fontSize: 12, textAlign: "center" }}>Chargement…</div>
      ) : entries.length === 0 && editing !== "new" ? (
        <div style={{ ...card, color: C.tx3, fontSize: 12, textAlign: "center" }}>
          Aucun antécédent renseigné
        </div>
      ) : null}

      {entries.map((e) =>
        editing !== "new" && editing?.id === e.id ? (
          <EntryForm key={e.id} athleteId={athleteId} existing={e} asStaff={asStaff} onDone={() => setEditing(null)} />
        ) : (
          <EntryCard key={e.id} entry={e} athleteId={athleteId} canEdit={canEdit && (canEditEntry ? canEditEntry(e) : true)} onEdit={() => setEditing(e)} />
        ),
      )}

      {editing === "new" && <EntryForm athleteId={athleteId} asStaff={asStaff} onDone={() => setEditing(null)} />}

      {canEdit && editing === null && (
        <button
          onClick={() => setEditing("new")}
          style={{ ...ghostBtn, justifyContent: "center", padding: "10px 0", border: "1px dashed " + C.brdL }}
        >
          <Plus size={13} /> Ajouter un antécédent
        </button>
      )}

      <AllergiesBlock athleteId={athleteId} canEdit={canEditHistory ?? canEdit} />
    </div>
  );
}

// ── Carte d'un antécédent ───────────────────────────────────────────────────

function EntryCard({ entry, athleteId, canEdit, onEdit }: {
  entry: MedicalEntry; athleteId: string; canEdit: boolean; onEdit: () => void;
}) {
  const del = useDeleteMedicalEntry(athleteId);
  const [confirmDel, setConfirmDel] = useState(false);
  const ongoing = entry.status === "en_cours";

  return (
    <div style={{ ...card, borderColor: ongoing ? C.r + "60" : C.brd }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px" }}>
              {MEDICAL_KIND_LABEL[entry.kind]}
            </span>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
              background: ongoing ? C.r + "20" : C.g + "20", color: ongoing ? C.r : C.g,
            }}>
              {MEDICAL_STATUS_LABEL[entry.status]}
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>{entry.title}</div>
          <div style={{ fontSize: 11, color: C.tx3, marginTop: 1 }}>
            {[
              entry.zone,
              fmtInjuryDate(entry.date),
              // Qui a déclaré change la lecture : une gêne remontée par l'athlète
              // n'a pas le même poids qu'une ligne saisie par le coach.
              entry.declared_by ? DECLARED_BY_LABEL[entry.declared_by] : null,
            ].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
        {canEdit && (
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <IconBtn title="Modifier" onClick={onEdit}><Pencil size={13} /></IconBtn>
            {confirmDel ? (
              <>
                <button onClick={() => del.mutate(entry)} style={{ ...ghostBtn, padding: "4px 8px", color: C.r, borderColor: C.r + "60" }}>Supprimer</button>
                <IconBtn title="Annuler" onClick={() => setConfirmDel(false)}><X size={13} /></IconBtn>
              </>
            ) : (
              <IconBtn title="Supprimer" onClick={() => setConfirmDel(true)}><Trash2 size={13} /></IconBtn>
            )}
          </div>
        )}
      </div>

      {injuryFacts(entry).length > 0 && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: 8, marginTop: 10,
        }}>
          {injuryFacts(entry).map(({ l, v }) => (
            <div key={l} style={{ background: C.s2, borderRadius: 4, padding: "6px 8px" }}>
              <div style={{ ...labelStyle, marginBottom: 2 }}>{l}</div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: C.tx2 }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {[
        { l: "Diagnostic du médecin", v: entry.diagnosis },
        { l: "Traitement / rééducation", v: entry.treatment },
        { l: "Notes", v: entry.notes },
      ].filter((x) => x.v).map(({ l, v }) => (
        <div key={l} style={{ marginTop: 10 }}>
          <div style={labelStyle}>{l}</div>
          <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{v}</div>
        </div>
      ))}

      <Attachments entry={entry} athleteId={athleteId} canEdit={canEdit} />
    </div>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title} aria-label={title} onClick={onClick}
      style={{
        width: 30, height: 30, borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent",
        color: C.tx3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}

// ── Pièces jointes ──────────────────────────────────────────────────────────

function Attachments({ entry, athleteId, canEdit }: { entry: MedicalEntry; athleteId: string; canEdit: boolean }) {
  const atts = entry.medical_attachments ?? [];
  const { data: urls = {} } = useMedicalSignedUrls(atts.map((a) => a.file_path));
  const add = useAddMedicalAttachment(athleteId);
  const del = useDeleteMedicalAttachment(athleteId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      await add.mutateAsync({ entryId: entry.id, file }).catch(() => {});
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  if (atts.length === 0 && !canEdit) return null;

  return (
    <div style={{ marginTop: 12 }}>
      {atts.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: canEdit ? 8 : 0 }}>
          {atts.map((a) => (
            <AttachmentThumb
              key={a.id} att={a} url={urls[a.file_path]} canEdit={canEdit}
              onOpen={(u) => (a.mime_type === "application/pdf" ? window.open(u, "_blank", "noopener") : setZoom(u))}
              onDelete={() => del.mutate(a)}
            />
          ))}
        </div>
      )}
      {canEdit && (
        <>
          <input
            ref={inputRef} type="file" accept={MEDICAL_ACCEPT} multiple hidden
            onChange={(e) => onFiles(e.target.files)}
          />
          <button onClick={() => inputRef.current?.click()} disabled={add.isPending} style={{ ...ghostBtn, opacity: add.isPending ? 0.6 : 1 }}>
            <Paperclip size={12} /> {add.isPending ? "Envoi…" : "Ajouter photo / PDF"}
          </button>
        </>
      )}

      {zoom && (
        <div
          onClick={() => setZoom(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.85)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16, cursor: "zoom-out",
          }}
        >
          <img src={zoom} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 4 }} />
        </div>
      )}
    </div>
  );
}

function AttachmentThumb({ att, url, canEdit, onOpen, onDelete }: {
  att: MedicalAttachment; url?: string; canEdit: boolean;
  onOpen: (url: string) => void; onDelete: () => void;
}) {
  const isPdf = att.mime_type === "application/pdf";
  return (
    <div style={{ position: "relative", width: 72 }}>
      <button
        onClick={() => url && onOpen(url)}
        title={att.file_name ?? undefined}
        style={{
          width: 72, height: 72, borderRadius: 4, border: "1px solid " + C.brd, background: C.s2,
          padding: 0, overflow: "hidden", cursor: url ? "pointer" : "default",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
        }}
      >
        {isPdf ? (
          <>
            <FileText size={22} color={C.tx3} />
            <span style={{ fontSize: 8, color: C.tx3 }}>PDF · {formatFileSize(att.file_size)}</span>
          </>
        ) : url ? (
          <img src={url} alt={att.file_name ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: 9, color: C.tx3 }}>…</span>
        )}
      </button>
      {canEdit && (
        <button
          onClick={onDelete} title="Retirer" aria-label="Retirer le fichier"
          style={{
            position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%",
            border: "1px solid " + C.brd, background: C.s1, color: C.tx3, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
          }}
        >
          <X size={11} />
        </button>
      )}
    </div>
  );
}

// ── Formulaire ──────────────────────────────────────────────────────────────

function EntryForm({ athleteId, existing, onDone, asStaff = false }: { athleteId: string; existing?: MedicalEntry; onDone: () => void; asStaff?: boolean }) {
  const save = useSaveMedicalEntry(athleteId, asStaff);
  const add = useAddMedicalAttachment(athleteId);
  const [kind, setKind] = useState<MedicalEntryKind>(existing?.kind ?? "blessure");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [zone, setZone] = useState(existing?.zone ?? "");
  const [date, setDate] = useState(existing?.date ?? "");
  const [status, setStatus] = useState<MedicalEntryStatus>(existing?.status ?? "gueri");
  const [diagnosis, setDiagnosis] = useState(existing?.diagnosis ?? "");
  const [treatment, setTreatment] = useState(existing?.treatment ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [detail, setDetail] = useState<InjuryDetail>(() => injuryDetailOf(existing));
  const [files, setFiles] = useState<File[]>([]);

  const isInjury = kind === "blessure";
  // En modification, on n'ouvre les précisions que si elles ont déjà servi.
  const detailStartOpen = !!existing && injuryFacts(existing).length > 0;

  const submit = async () => {
    if (!title.trim()) { toast.error("Donne un nom à l'antécédent"); return; }
    const input: MedicalEntryInput = {
      kind, status,
      title: title.trim(),
      zone: zone.trim() || null,
      date: date || null,
      diagnosis: diagnosis.trim() || null,
      treatment: treatment.trim() || null,
      notes: notes.trim() || null,
      ...injuryDetailForSave(kind, detail),
    };
    try {
      const entry = await save.mutateAsync({ id: existing?.id, input });
      for (const file of files) {
        await add.mutateAsync({ entryId: entry.id, file }).catch(() => {});
      }
      toast.success(existing ? "Antécédent modifié" : "Antécédent ajouté");
      onDone();
    } catch { /* toast déjà affiché par le hook */ }
  };

  const busy = save.isPending || add.isPending;

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>
        {existing ? "Modifier l'antécédent" : "Nouvel antécédent"}
      </div>

      {isInjury && <InjuryIntro />}

      <div>
        <span style={labelStyle}>Type</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(Object.keys(MEDICAL_KIND_LABEL) as MedicalEntryKind[]).map((k) => (
            <Chip key={k} active={kind === k} onClick={() => setKind(k)}>{MEDICAL_KIND_LABEL[k]}</Chip>
          ))}
        </div>
      </div>

      <div>
        <label style={labelStyle}>Nom *</label>
        <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex : Entorse, rupture LCA, asthme…" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={labelStyle}>Zone</label>
          <input style={inputStyle} value={zone} onChange={(e) => setZone(e.target.value)} placeholder="Cheville gauche" />
        </div>
        <div>
          <label style={labelStyle}>Date</label>
          <input style={inputStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div>
        <span style={labelStyle}>Statut</span>
        <div style={{ display: "flex", gap: 6 }}>
          {(Object.keys(MEDICAL_STATUS_LABEL) as MedicalEntryStatus[]).map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(s)}>{MEDICAL_STATUS_LABEL[s]}</Chip>
          ))}
        </div>
      </div>

      {isInjury && (
        <InjuryDetailFields value={detail} onChange={setDetail} startOpen={detailStartOpen} />
      )}

      <div>
        <label style={labelStyle}>Diagnostic du médecin</label>
        <textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Ce que le médecin a diagnostiqué (examens, conclusion…)" />
      </div>

      <div>
        <label style={labelStyle}>Traitement / rééducation</label>
        <textarea style={{ ...inputStyle, resize: "vertical" }} rows={2} value={treatment} onChange={(e) => setTreatment(e.target.value)} placeholder="Repos, kiné, attelle, opération…" />
      </div>

      <div>
        <label style={labelStyle}>Notes</label>
        <textarea style={{ ...inputStyle, resize: "vertical" }} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Gêne résiduelle, récidives, précautions…" />
      </div>

      {!existing && (
        <div>
          <span style={labelStyle}>Photos / PDF (radio, IRM, compte rendu)</span>
          <input
            type="file" accept={MEDICAL_ACCEPT} multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            style={{ fontSize: 12, color: C.tx3 }}
          />
          {files.length > 0 && (
            <div style={{ fontSize: 11, color: C.tx3, marginTop: 4 }}>
              {files.length} fichier{files.length > 1 ? "s" : ""} — les photos sont compressées automatiquement
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onDone} style={{ ...ghostBtn, padding: "9px 16px" }}>Annuler</button>
        <button onClick={submit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

// ── Allergies / traitements en cours (texte) ────────────────────────────────

function AllergiesBlock({ athleteId, canEdit }: { athleteId: string; canEdit: boolean }) {
  const { data: mh } = useMedicalHistory(athleteId);
  const upsert = useUpsertMedicalHistory(athleteId);
  const [editing, setEditing] = useState(false);
  const [allergies, setAllergies] = useState("");
  const [treatments, setTreatments] = useState("");

  const start = () => {
    setAllergies(mh?.allergies ?? "");
    setTreatments(mh?.current_treatments ?? "");
    setEditing(true);
  };

  const save = () => {
    upsert.mutate(
      {
        conditions: mh?.conditions ?? "",
        allergies: allergies.trim(),
        surgeries: mh?.surgeries ?? [],
        past_injuries: mh?.past_injuries ?? [],
        current_treatments: treatments.trim(),
        medical_notes: mh?.medical_notes ?? "",
      },
      { onSuccess: () => setEditing(false) },
    );
  };

  if (editing) {
    return (
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <label style={labelStyle}>Allergies</label>
          <textarea style={{ ...inputStyle, resize: "vertical" }} rows={2} value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="Médicaments, aliments…" />
        </div>
        <div>
          <label style={labelStyle}>Traitements en cours</label>
          <textarea style={{ ...inputStyle, resize: "vertical" }} rows={2} value={treatments} onChange={(e) => setTreatments(e.target.value)} placeholder="Médicaments, compléments…" />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setEditing(false)} style={{ ...ghostBtn, padding: "9px 16px" }}>Annuler</button>
          <button onClick={save} disabled={upsert.isPending} style={{ ...primaryBtn, opacity: upsert.isPending ? 0.6 : 1 }}>Enregistrer</button>
        </div>
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { l: "Allergies", v: mh?.allergies },
            { l: "Traitements en cours", v: mh?.current_treatments },
          ].map(({ l, v }) => (
            <div key={l}>
              <div style={labelStyle}>{l}</div>
              <div style={{ fontSize: 12, color: v ? C.tx2 : C.tx3, whiteSpace: "pre-wrap" }}>{v || "Aucun"}</div>
            </div>
          ))}
        </div>
        {canEdit && <IconBtn title="Modifier" onClick={start}><Pencil size={13} /></IconBtn>}
      </div>
    </div>
  );
}
