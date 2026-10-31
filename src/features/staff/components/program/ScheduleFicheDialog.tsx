/**
 * Poser une fiche sur un ou plusieurs jours du planning d'un athlète.
 * Fiche choisie dans la banque du coach principal, ou déposée à l'instant
 * (elle rejoint alors la banque, au nom du pro) : un fichier, ou des photos
 * prises au téléphone (compressées, assemblées en PDF si plusieurs). Jours cochés sur 4 semaines,
 * avec raccourci « ce jour chaque semaine ».
 */
import { useMemo, useRef, useState } from "react";
import { addDays, addWeeks, format, isSameDay, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { formatFileSize } from "@/lib/compressImage";
import { errorMessage } from "@/lib/errors";
import { FICHE_CATEGORIES, FICHE_CATEGORY_LABEL } from "@/features/shared/types/fiches";
import type { FicheCategory } from "@/features/shared/types/fiches";
import { useDocsBank } from "@/features/shared/hooks/fiches/useDocs";
import { DocUploadError, uploadDoc } from "@/features/shared/hooks/fiches/useDocMutations";
import { useScheduleDoc } from "@/features/shared/hooks/fiches/useDocSchedule";
import { PhotoFicheCapture } from "@/features/shared/components/fiches/PhotoFicheCapture";
import { PhotoFicheError, photosToFicheFile } from "@/lib/photosToFiche";
import { CATEGORY_COLOR, btnGhost, btnPrimary } from "@/features/shared/components/fiches/ficheStyles";

const WEEKS = 4;
const DOW = ["L", "M", "M", "J", "V", "S", "D"];

export function ScheduleFicheDialog({ athleteId, athleteName, coachId, staffId, initialDate, onClose }: {
  athleteId: string;
  athleteName: string;
  coachId: string;
  staffId: string;
  initialDate: Date;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"bank" | "upload">("bank");
  const [docId, setDocId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  // Sur téléphone, les photos d'abord.
  const [source, setSource] = useState<"photos" | "file">(() =>
    window.matchMedia?.("(pointer: coarse)").matches ? "photos" : "file");
  const [photos, setPhotos] = useState<File[]>([]);
  const [step, setStep] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<FicheCategory>("prevention");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(initialDate, { weekStartsOn: 1 }));
  const [dates, setDates] = useState<Set<string>>(() => new Set([format(initialDate, "yyyy-MM-dd")]));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: families = [], isLoading } = useDocsBank(coachId);
  const schedule = useScheduleDoc(athleteId);

  const bank = useMemo(() => {
    const q = search.trim().toLowerCase();
    return families
      .map((f) => f.origin)
      .filter((d) => !d.archived_at && (!q || d.title.toLowerCase().includes(q)));
  }, [families, search]);

  const days = useMemo(
    () => Array.from({ length: WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(addWeeks(weekStart, w), d))),
    [weekStart],
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function toggle(iso: string) {
    setDates((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso); else next.add(iso);
      return next;
    });
  }
  function toggleWeekday(dow: number) {
    const col = days.map((w) => format(w[dow], "yyyy-MM-dd"));
    setDates((prev) => {
      const next = new Set(prev);
      const allOn = col.every((d) => next.has(d));
      for (const d of col) if (allOn) next.delete(d); else next.add(d);
      return next;
    });
  }

  const hasUpload = source === "photos" ? photos.length > 0 : !!file;
  const ready = dates.size > 0 && (mode === "bank" ? !!docId : hasUpload);

  async function submit() {
    if (!ready) return;
    setBusy(true);
    try {
      let id = docId;
      if (mode === "upload") {
        const name = title.trim()
          || (source === "file" && file ? file.name.replace(/\.[^.]+$/, "") : `Fiche du ${format(new Date(), "d MMM", { locale: fr })}`);
        let upload = file;
        if (source === "photos") {
          setStep(photos.length > 1 ? "Création du PDF…" : "Compression…");
          upload = await photosToFicheFile(photos, name);
        }
        if (!upload) return;
        setStep("Envoi…");
        const doc = await uploadDoc({ file: upload, coachId, athleteId: null, uploadedBy: staffId, title: name, category });
        id = doc.id;
      }
      setStep(null);
      const n = await schedule.mutateAsync({ docId: id!, dates: [...dates].sort(), note: note.trim() || undefined });
      toast.success(n === 0 ? "Déjà posée sur ces jours" : `Fiche posée sur ${n} jour${n > 1 ? "s" : ""}`);
      onClose();
    } catch (e) {
      toast.error(e instanceof DocUploadError || e instanceof PhotoFicheError ? e.message : errorMessage(e, "Impossible de poser la fiche"));
    } finally {
      setBusy(false);
      setStep(null);
    }
  }

  const field: React.CSSProperties = {
    width: "100%", padding: "9px 10px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2,
    color: C.tx, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box",
  };
  const tab = (on: boolean): React.CSSProperties => ({
    flex: 1, padding: "8px 0", borderRadius: 3, border: "none", fontFamily: "inherit", cursor: "pointer",
    background: on ? C.s1 : "transparent", color: on ? C.tx : C.tx3, fontSize: 12, fontWeight: on ? 700 : 500,
  });
  const label: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px" };

  return (
    <div role="dialog" aria-modal="true" aria-label="Poser une fiche"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", background: C.s1, border: "1px solid " + C.brdL, borderRadius: 6, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.tx }}>Poser une fiche</div>
            <div style={{ fontSize: 12, color: C.tx3 }}>{athleteName} la verra ces jours-là dans son programme, son coach dans son planning.</div>
          </div>
          <button onClick={onClose} aria-label="Fermer" style={{ background: "none", border: "none", color: C.tx3, fontSize: 18, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "flex", gap: 4, background: C.s2, borderRadius: 4, padding: 3 }}>
          <button type="button" style={tab(mode === "bank")} onClick={() => setMode("bank")}>Banque du coach</button>
          <button type="button" style={tab(mode === "upload")} onClick={() => setMode("upload")}>Nouvelle fiche</button>
        </div>

        {mode === "bank" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une fiche" style={field} />
            <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {isLoading ? (
                <div style={{ fontSize: 12, color: C.tx3 }}>Chargement…</div>
              ) : bank.length === 0 ? (
                <div style={{ fontSize: 12, color: C.tx3 }}>Aucune fiche. Dépose-en une dans « Nouvelle fiche ».</div>
              ) : bank.map((d) => {
                const on = d.id === docId;
                const cc = CATEGORY_COLOR[d.category] ?? C.b;
                return (
                  <button key={d.id} type="button" onClick={() => setDocId(d.id)}
                    style={{ textAlign: "left", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", border: "1px solid " + (on ? C.ac : C.brd), background: on ? C.acS : C.s2 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: cc, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.tx, fontWeight: on ? 700 : 500 }}>{d.title}</span>
                    <span style={{ fontSize: 10, color: C.tx3 }}>{FICHE_CATEGORY_LABEL[d.category]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 14 }}>
              {(["photos", "file"] as const).map((k) => (
                <label key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: source === k ? C.tx : C.tx3, cursor: "pointer" }}>
                  <input type="radio" name="fiche-source" checked={source === k} onChange={() => setSource(k)} disabled={busy} />
                  {k === "photos" ? "Photos" : "PDF ou image"}
                </label>
              ))}
            </div>
            {source === "photos" ? (
              <PhotoFicheCapture photos={photos} onChange={setPhotos} disabled={busy} />
            ) : (
              <button type="button" style={btnGhost} onClick={() => fileRef.current?.click()}>
                {file ? `${file.name} · ${formatFileSize(file.size)}` : "Choisir un PDF ou une image"}
              </button>
            )}
            <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, "")); e.target.value = ""; }} />
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre" style={field} />
            <select value={category} onChange={(e) => setCategory(e.target.value as FicheCategory)} style={field}>
              {FICHE_CATEGORIES.map((c) => <option key={c} value={c}>{FICHE_CATEGORY_LABEL[c]}</option>)}
            </select>
            <div style={{ fontSize: 11, color: C.tx3 }}>Elle rejoint la banque de fiches du coach principal, à ton nom.</div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ ...label, flex: 1 }}>Jours · {dates.size} sélectionné{dates.size > 1 ? "s" : ""}</span>
            <button type="button" onClick={() => setWeekStart((w) => addWeeks(w, -WEEKS))} aria-label="Semaines précédentes" style={{ ...btnGhost, padding: "3px 9px" }}>‹</button>
            <span style={{ fontSize: 11, color: C.tx2, minWidth: 130, textAlign: "center" }}>
              {format(weekStart, "d MMM", { locale: fr })} → {format(addDays(addWeeks(weekStart, WEEKS), -1), "d MMM", { locale: fr })}
            </span>
            <button type="button" onClick={() => setWeekStart((w) => addWeeks(w, WEEKS))} aria-label="Semaines suivantes" style={{ ...btnGhost, padding: "3px 9px" }}>›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
            {DOW.map((d, i) => (
              <button key={i} type="button" onClick={() => toggleWeekday(i)} title="Ce jour chaque semaine"
                style={{ padding: "4px 0", fontSize: 10, fontWeight: 700, color: C.tx3, background: "transparent", border: "1px dashed " + C.brd, borderRadius: 3, cursor: "pointer", fontFamily: "inherit" }}>
                {d}
              </button>
            ))}
            {days.flat().map((d) => {
              const iso = format(d, "yyyy-MM-dd");
              const on = dates.has(iso);
              const past = d < today;
              return (
                <button key={iso} type="button" onClick={() => toggle(iso)}
                  style={{
                    padding: "8px 0", borderRadius: 4, fontSize: 12, fontFamily: "inherit", cursor: "pointer",
                    border: "1px solid " + (on ? C.ac : isSameDay(d, today) ? C.brdL : C.brd),
                    background: on ? C.ac : "transparent", color: on ? "#0E0C0A" : past ? C.tx3 : C.tx, fontWeight: on ? 800 : 500,
                  }}>
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 10.5, color: C.tx3 }}>Astuce : clique sur une lettre pour cocher ce jour chaque semaine.</div>
        </div>

        <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} placeholder="Consigne (facultatif) : ex. 2 séries avant la séance" style={field} />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button style={btnGhost} onClick={onClose}>Annuler</button>
          <button style={{ ...btnPrimary, opacity: !ready || busy ? 0.5 : 1 }} disabled={!ready || busy} onClick={submit}>
            {busy ? step ?? "Enregistrement…" : `Poser sur ${dates.size} jour${dates.size > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
