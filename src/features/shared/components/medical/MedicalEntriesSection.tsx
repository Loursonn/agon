import { useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { C, alpha } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import {
  useDeleteMedicalEntry,
  useMedicalEntries,
  useSaveMedicalEntry,
} from "@/features/shared/hooks/useMedicalEntries";
import {
  DECLARED_BY_LABEL,
  MEDICAL_STATUS_LABEL,
  type MedicalEntry,
  type MedicalEntryInput,
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
 * Blessures sportives d'un athlète : zone, date, statut, détail (douleur,
 * impact, type, mécanisme, contexte, arrêt, retour) et notes.
 * Utilisé côté athlète (Profil), coach (Profil athlète) et staff.
 *
 * Volontairement sans diagnostic, traitement, antécédents ni documents
 * médicaux : Agon n'héberge pas de données de soins (décision du 2026-11-13).
 */
export function MedicalEntriesSection({
  athleteId, canEdit, canEditEntry, asStaff = false,
}: {
  athleteId: string;
  /** Peut ajouter des blessures (et, par défaut, toutes les modifier). */
  canEdit: boolean;
  /** Restreint la modification par entrée (staff : les siennes, ou celles du coach si autorisé). */
  canEditEntry?: (e: MedicalEntry) => boolean;
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
          Aucune blessure renseignée
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
          style={{ ...ghostBtn, justifyContent: "center", padding: "12px 0", borderRadius: 14, border: "1px dashed " + C.brdL }}
        >
          <Plus size={13} /> Déclarer une blessure
        </button>
      )}
    </div>
  );
}

// ── Carte d'une blessure ───────────────────────────────────────────────────

function EntryCard({ entry, athleteId, canEdit, onEdit }: {
  entry: MedicalEntry; athleteId: string; canEdit: boolean; onEdit: () => void;
}) {
  const del = useDeleteMedicalEntry(athleteId);
  const [confirmDel, setConfirmDel] = useState(false);
  const ongoing = entry.status === "en_cours";

  return (
    // Peps (planche CoachOrdiBStaffFiche) : carte teintée et pastille pleine
    // quand la blessure est en cours, carte neutre et pastille verte une fois guérie.
    <div style={{
      ...card, borderRadius: 14, padding: "16px 18px",
      background: ongoing ? alpha(C.r, 0.08) : C.s1,
      border: "1px solid " + (ongoing ? alpha(C.r, 0.4) : C.brd),
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", height: 20, padding: "0 8px", borderRadius: 999,
              background: ongoing ? C.r : C.g, color: C.ink,
              ...MONO, fontSize: 10, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase",
            }}>
              {MEDICAL_STATUS_LABEL[entry.status]}
            </span>
            <span style={{ fontSize: 15.5, fontWeight: 600, color: C.tx }}>{entry.title}</span>
          </div>
          <div style={{ fontSize: 12.5, color: C.tx2, marginTop: 6 }}>
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
          gap: 8, marginTop: 12,
        }}>
          {injuryFacts(entry).map(({ l, v }) => (
            <div key={l} style={{ background: ongoing ? alpha(C.r, 0.06) : C.s2, borderRadius: 10, padding: "8px 10px" }}>
              <div style={{ ...labelStyle, marginBottom: 3 }}>{l}</div>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: C.tx }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {entry.notes && (
        <div style={{ marginTop: 10 }}>
          <div style={labelStyle}>Notes</div>
          <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{entry.notes}</div>
        </div>
      )}
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

// ── Formulaire ──────────────────────────────────────────────────────────────

function EntryForm({ athleteId, existing, onDone, asStaff = false }: { athleteId: string; existing?: MedicalEntry; onDone: () => void; asStaff?: boolean }) {
  const save = useSaveMedicalEntry(athleteId, asStaff);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [zone, setZone] = useState(existing?.zone ?? "");
  const [date, setDate] = useState(existing?.date ?? "");
  const [status, setStatus] = useState<MedicalEntryStatus>(existing?.status ?? "gueri");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [detail, setDetail] = useState<InjuryDetail>(() => injuryDetailOf(existing));
  // En modification, on n'ouvre les précisions que si elles ont déjà servi.
  const detailStartOpen = !!existing && injuryFacts(existing).length > 0;

  const submit = async () => {
    if (!title.trim()) { toast.error("Donne un nom à la blessure"); return; }
    const input: MedicalEntryInput = {
      status,
      title: title.trim(),
      zone: zone.trim() || null,
      date: date || null,
      notes: notes.trim() || null,
      ...injuryDetailForSave("blessure", detail),
    };
    try {
      await save.mutateAsync({ id: existing?.id, input });
      toast.success(existing ? "Blessure modifiée" : "Blessure ajoutée");
      onDone();
    } catch { /* toast déjà affiché par le hook */ }
  };

  const busy = save.isPending;

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>
        {existing ? "Modifier la blessure" : "Nouvelle blessure"}
      </div>

      <InjuryIntro />

      <div>
        <label style={labelStyle}>Nom *</label>
        <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex : Entorse, douleur au genou, contracture…" />
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

      <InjuryDetailFields value={detail} onChange={setDetail} startOpen={detailStartOpen} />

      <div>
        <label style={labelStyle}>Notes</label>
        <textarea style={{ ...inputStyle, resize: "vertical" }} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Gêne résiduelle, mouvements à éviter, ressenti…" />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onDone} style={{ ...ghostBtn, padding: "9px 16px" }}>Annuler</button>
        <button onClick={submit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
