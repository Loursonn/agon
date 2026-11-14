import { useMemo, useState } from "react";
import { toast } from "sonner";
import { C, alpha } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import { formatFileSize } from "@/lib/compressImage";
import { FICHE_CATEGORIES, FICHE_CATEGORY_LABEL, type DocFamily, type FicheCategory } from "@/features/shared/types/fiches";
import { useDocFamilyAssignments, useDocsBank } from "@/features/shared/hooks/fiches/useDocs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { assignDoc, invalidateDocs } from "@/api/docs";
import { FichePreview } from "@/features/shared/components/fiches/FichePreview";
import { CATEGORY_COLOR } from "@/features/shared/components/fiches/ficheStyles";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Avatar, CARD, Chevron, Chip, GroupHead, KICKER, MONO, PhoneButton, PhonePage, SearchField, Section, ToolHead, rowLine } from "./phoneUi";

const KIND_LABEL = { pdf: "PDF", image: "Image", questionnaire: "Questionnaire" } as const;
const SOURCE_LABEL = { manuel: "Envoyée par toi", programme: "Avec une séance", energie: "Avec une séance énergie" } as const;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const metaOf = (f: DocFamily) => [
  KIND_LABEL[f.origin.kind] ?? f.origin.kind,
  f.origin.file_size ? formatFileSize(f.origin.file_size) : null,
  f.variants.length ? `${f.variants.length + 1} versions` : null,
].filter(Boolean).join(" · ");
type AthleteLite = { id: string; full_name?: string | null; first_name?: string | null; last_name?: string | null };
const nameOf = (a: AthleteLite | undefined) =>
  a?.full_name?.trim() || [a?.first_name, a?.last_name].filter(Boolean).join(" ").trim() || "Athlète";

/**
 * Fiches du coach sur téléphone (planche CoachTelFiches) : liste rangée par
 * catégorie, recherche, filtres ; lire une fiche (aperçu, à qui elle est
 * partagée, lue ou non) ; la partager à un ou plusieurs athlètes avec un mot.
 * Import et modification restent sur ordinateur.
 */
export default function CoachPhoneFiches() {
  const { user } = useAuth();
  const { data: bank = [], isLoading, isError } = useDocsBank(user?.id);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<FicheCategory | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const active = useMemo(() => bank.filter((f) => !f.origin.archived_at), [bank]);
  const cats = useMemo(() => FICHE_CATEGORIES.filter((c) => active.some((f) => f.origin.category === c)), [active]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return active.filter((f) => (cat === "all" || f.origin.category === cat)
      && (!needle || f.origin.title.toLowerCase().includes(needle) || f.origin.tags.some((t) => t.toLowerCase().includes(needle))));
  }, [active, q, cat]);
  const open = openId ? active.find((f) => f.origin.id === openId) ?? null : null;

  if (open) return <FicheDetail family={open} onBack={() => setOpenId(null)} />;

  return (
    <PhonePage gap={12} style={{ paddingTop: 18 }}>
      <ToolHead kicker={`${active.length} fiche${active.length > 1 ? "s" : ""}`} title="Fiches" />
      <SearchField value={q} onChange={setQ} placeholder="Rechercher une fiche" />
      {cats.length > 1 && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
          <Chip active={cat === "all"} onClick={() => setCat("all")}>Toutes</Chip>
          {cats.map((c) => <Chip key={c} active={cat === c} color={CATEGORY_COLOR[c]} onClick={() => setCat(c)}>{FICHE_CATEGORY_LABEL[c]}</Chip>)}
        </div>
      )}
      {isError && <div style={{ fontSize: 12.5, color: C.o }}>Fiches : lecture impossible.</div>}
      {!isLoading && !isError && shown.length === 0 && (
        <div style={{ ...CARD, padding: 14, fontSize: 13, color: C.tx3 }}>{active.length ? "Aucune fiche ne correspond." : "Aucune fiche pour l’instant. Importe-les depuis un ordinateur."}</div>
      )}
      {FICHE_CATEGORIES.map((c) => {
        const list = shown.filter((f) => f.origin.category === c);
        if (!list.length) return null;
        return (
          <div key={c} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <GroupHead color={CATEGORY_COLOR[c]} label={FICHE_CATEGORY_LABEL[c]} count={list.length} />
            <div style={{ ...CARD, padding: "2px 14px" }}>
              {list.map((f, i) => (
                <button key={f.origin.id} type="button" onClick={() => setOpenId(f.origin.id)} style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 0", background: "none", border: "none",
                  boxShadow: rowLine(i), color: C.tx, fontFamily: "inherit", textAlign: "left", cursor: "pointer",
                }}>
                  <FileTile color={CATEGORY_COLOR[c]} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.origin.title}</div>
                    <div style={{ fontSize: 12, color: C.tx3, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {metaOf(f)}
                      {f.origin.is_self_service && <span style={{ ...MONO, fontSize: 10.5, letterSpacing: "0.06em", color: C.g }}> · LIBRE-SERVICE</span>}
                    </div>
                  </div>
                  <Chevron />
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 11.5, color: C.tx3, textAlign: "center" }}>Importer ou modifier une fiche : sur ordinateur.</div>
    </PhonePage>
  );
}

/** Vignette document aux couleurs de la catégorie (planche CoachTelFiches). */
function FileTile({ color }: { color: string }) {
  return (
    <span aria-hidden style={{
      width: 38, height: 38, flex: "none", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
      background: alpha(color, 0.12), border: `1px solid ${alpha(color, 0.35)}`, color,
    }}>
      <svg width="16" height="18" viewBox="0 0 16 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
        <path d="M3 1.5h6.5L13 5v11.5H3z" /><path d="M9.5 1.5V5H13M5.5 9h5M5.5 12h5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function FicheDetail({ family, onBack }: { family: DocFamily; onBack: () => void }) {
  const { origin } = family;
  const { athletes } = useAuth();
  const { data: assignments = [], isLoading } = useDocFamilyAssignments(origin.id);
  const [sharing, setSharing] = useState(false);
  const byAthlete = useMemo(() => {
    const m = new Map<string, typeof assignments>();
    for (const a of assignments) m.set(a.athlete_id, [...(m.get(a.athlete_id) ?? []), a]);
    return [...m.entries()];
  }, [assignments]);

  return (
    <PhonePage gap={12} style={{ paddingTop: 14 }}>
      <button type="button" onClick={onBack} style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: C.tx2, fontSize: 13, fontFamily: "inherit", cursor: "pointer", padding: 0 }}>
        <Chevron dir="left" color={C.tx2} /> Fiches
      </button>
      <div>
        <div style={{ ...KICKER, color: CATEGORY_COLOR[origin.category] }}>{FICHE_CATEGORY_LABEL[origin.category]}</div>
        <div style={{ fontSize: 19, fontWeight: 500, marginTop: 2 }}>{origin.title}</div>
        {origin.description && <div style={{ fontSize: 13, color: C.tx2, marginTop: 2 }}>{origin.description}</div>}
        <div style={{ ...MONO, fontSize: 11, color: C.tx3, marginTop: 4 }}>{metaOf(family)}</div>
      </div>
      <div style={{ ...CARD, padding: 8, overflow: "hidden" }}>
        <FichePreview doc={origin} maxHeight={420} />
      </div>

      <Section n={1} title={origin.is_self_service ? "En libre-service, et partagée à" : "Partagée à"} count={byAthlete.length}>
        {isLoading ? null : byAthlete.length === 0 ? (
          <div style={{ ...CARD, padding: 14, fontSize: 13, color: C.tx3 }}>{origin.is_self_service ? "Tous tes athlètes la voient dans leurs fiches." : "Personne pour l’instant."}</div>
        ) : (
          <div style={{ ...CARD, padding: "2px 14px" }}>
            {byAthlete.map(([id, rows], i) => {
              const a = athletes.find((x) => x.id === id);
              const seen = rows.map((r) => r.seen_at).filter(Boolean).sort().pop();
              const first = [...rows].sort((x, y) => x.created_at.localeCompare(y.created_at))[0];
              return (
                <div key={id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", boxShadow: rowLine(i) }}>
                  <Avatar name={nameOf(a)} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5 }}>{nameOf(a)}</div>
                    <div style={{ fontSize: 11.5, color: C.tx3 }}>
                      {SOURCE_LABEL[first.source] ?? "Partagée"}{first.source === "manuel" ? ` · ${fmtDate(first.created_at)}` : ""}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: seen ? C.g : C.tx3, whiteSpace: "nowrap" }}>{seen ? "Lue" : "Pas encore lue"}</span>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <PhoneButton primary onClick={() => setSharing(true)}>Partager</PhoneButton>
      <div style={{ fontSize: 11.5, color: C.tx3, textAlign: "center" }}>Modifier la fiche ou ses versions : sur ordinateur.</div>
      {sharing && <ShareSheet family={family} already={new Set(byAthlete.map(([id]) => id))} onClose={() => setSharing(false)} />}
    </PhonePage>
  );
}

function ShareSheet({ family, already, onClose }: { family: DocFamily; already: Set<string>; onClose: () => void }) {
  const { user, athletes } = useAuth();
  const qc = useQueryClient();
  // Une attribution par athlète, un seul message à la fin.
  const assign = useMutation({
    mutationFn: async (p: { ids: string[]; note: string | null }) => {
      for (const id of p.ids) await assignDoc({ docId: family.origin.id, athleteId: id, assignedBy: user!.id, coachNote: p.note });
    },
    onSettled: (_d, _e, p) => { for (const id of p.ids) void invalidateDocs(qc, id); },
  });
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...athletes]
      .filter((a) => !needle || nameOf(a).toLowerCase().includes(needle))
      .sort((a, b) => Number(already.has(a.id)) - Number(already.has(b.id)) || nameOf(a).localeCompare(nameOf(b), "fr"));
  }, [athletes, q, already]);
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  function share() {
    if (!user || picked.size === 0) return;
    const n = picked.size;
    assign.mutate({ ids: [...picked], note: note.trim() || null }, {
      onSuccess: () => { toast.success(`Fiche partagée à ${n} athlète${n > 1 ? "s" : ""}`); onClose(); },
      onError: () => toast.error("Partage interrompu : réessaie (les athlètes déjà servis la gardent)."),
    });
  }

  return (
    <Drawer open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DrawerContent style={{ background: C.s1, borderColor: C.brdL, color: C.tx }}>
        <div style={{ padding: "6px 16px calc(18px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 10, maxHeight: "80vh", overflowY: "auto" }}>
          <div style={{ ...KICKER, color: C.tx3 }}>Partager la fiche</div>
          <DrawerTitle style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>{family.origin.title}</DrawerTitle>
          <DrawerDescription className="sr-only">Choisis un ou plusieurs athlètes</DrawerDescription>
          <input
            type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un athlète" aria-label="Rechercher un athlète"
            style={{ height: 40, padding: "0 12px", borderRadius: 10, border: `1px solid ${C.brdL}`, background: C.bg, color: C.tx, fontSize: 16, fontFamily: "inherit" }}
          />
          <div style={{ ...CARD, padding: "2px 12px", background: C.bg }}>
            {list.map((a, i) => {
              const has = already.has(a.id);
              const on = picked.has(a.id);
              return (
                <button key={a.id} type="button" disabled={has} aria-pressed={on} onClick={() => toggle(a.id)} style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 0", background: "none", border: "none",
                  boxShadow: rowLine(i), color: C.tx, fontFamily: "inherit", textAlign: "left", cursor: has ? "default" : "pointer", opacity: has ? 0.45 : 1,
                }}>
                  <Avatar name={nameOf(a)} size={30} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5 }}>{nameOf(a)}</div>
                    {has && <div style={{ fontSize: 11.5, color: C.tx3 }}>Déjà partagée</div>}
                  </div>
                  {!has && (
                    <span aria-hidden style={{
                      width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                      border: on ? "none" : `1px solid ${C.brdL}`, background: on ? C.ac : "transparent", color: C.bg, fontSize: 13,
                    }}>{on ? "✓" : ""}</span>
                  )}
                </button>
              );
            })}
          </div>
          <label style={{ fontSize: 12, color: C.tx2, display: "flex", flexDirection: "column", gap: 4 }}>
            Un mot pour eux · facultatif
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{
              padding: 10, borderRadius: 10, border: `1px solid ${C.brdL}`, background: alpha(C.bg, 1), color: C.tx, fontSize: 16, fontFamily: "inherit", resize: "vertical",
            }} />
          </label>
          <PhoneButton primary disabled={picked.size === 0 || assign.isPending} onClick={share}>
            {picked.size === 0 ? "Choisis un athlète" : `Partager à ${picked.size} athlète${picked.size > 1 ? "s" : ""}`}
          </PhoneButton>
          <div style={{ fontSize: 11.5, color: C.tx3, textAlign: "center" }}>Ils la retrouvent dans « Mes fiches ».</div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
