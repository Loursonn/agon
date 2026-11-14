import { useEffect, useState } from "react";
import { C, alpha } from "@/lib/theme";
import { useExerciseBankPage } from "@/features/shared/hooks/useExerciseLibrary";
import type { ExerciseRow } from "@/api/exercises";
import { EX_TYPES, exTypeColor, exTypeLabel } from "@/lib/exerciseTypes";
import { MTREE, mL } from "@/lib/muscles";
import { CARD, Chevron, Chip, KICKER, MONO, PhonePage, SearchField, Section, Tag, ToolHead, rowLine } from "./phoneUi";

const EQUIPS = ["Barre", "Haltères", "Cable", "Machine", "Poids de corps", "Élastique", "Kettlebell", "Smith"];
const LEVELS = ["Débutant", "Intermédiaire", "Avancé"];
const PAGE = 30;

function Select({ label, value, options, onChange }: { label: string; value: string; options: Array<{ v: string; l: string }>; onChange: (v: string) => void }) {
  return (
    <label style={{ position: "relative", flex: "none" }}>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{
        appearance: "none", height: 30, padding: "0 26px 0 12px", borderRadius: 999, fontSize: 12.5, fontFamily: "inherit",
        background: value ? C.s2 : "transparent", color: value ? C.tx : C.tx2, border: `1px solid ${value ? "transparent" : C.brdL}`,
      }}>
        <option value="">{label}</option>
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
      <span aria-hidden style={{ position: "absolute", right: 9, top: 7, pointerEvents: "none" }}><Chevron dir="down" size={14} /></span>
    </label>
  );
}

/**
 * Banque d'exercices sur téléphone, en lecture seule (planche CoachTelBanque) :
 * recherche, type, filtres muscle / équipement / niveau ; fiche exercice avec
 * vidéo, consignes et muscles. Créer ou modifier : sur ordinateur.
 */
export default function CoachPhoneBanque() {
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const [level, setLevel] = useState("");
  const [count, setCount] = useState(PAGE);
  const [open, setOpen] = useState<ExerciseRow | null>(null);

  useEffect(() => { const t = setTimeout(() => setSearch(text.trim()), 300); return () => clearTimeout(t); }, [text]);
  useEffect(() => { setCount(PAGE); }, [search, type, muscle, equipment, level]);

  const { data, isLoading, isError, isFetching } = useExerciseBankPage({
    search: search || undefined, type: type || undefined, muscles: muscle ? [muscle] : undefined,
    equipment: equipment || undefined, difficulty: level || undefined, page: 0, pageSize: count,
  });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const filtered = !!(search || type || muscle || equipment || level);

  if (open) return <ExerciseSheet ex={open} onBack={() => setOpen(null)} />;

  return (
    <PhonePage gap={12} style={{ paddingTop: 18 }}>
      <ToolHead kicker={!filtered && total > 0 ? `${total} exercices` : undefined} title="Banque" />
      <SearchField value={text} onChange={setText} placeholder="Rechercher un exercice" />
      <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
        <Chip active={!type} onClick={() => setType("")}>Tous</Chip>
        {EX_TYPES.map((t) => <Chip key={t.value} active={type === t.value} color={exTypeColor(t.value)} onClick={() => setType(t.value)}>{t.label}</Chip>)}
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        <Select label="Muscle" value={muscle} onChange={setMuscle} options={MTREE.map((m) => ({ v: m.id, l: mL(m.id) }))} />
        <Select label="Équipement" value={equipment} onChange={setEquipment} options={EQUIPS.map((e) => ({ v: e, l: e }))} />
        <Select label="Niveau" value={level} onChange={setLevel} options={LEVELS.map((l) => ({ v: l, l }))} />
      </div>
      {filtered && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.tx3 }}>
          <span style={MONO}>{total} résultat{total > 1 ? "s" : ""}</span>
          <button type="button" onClick={() => { setText(""); setType(""); setMuscle(""); setEquipment(""); setLevel(""); }} style={{ background: "none", border: "none", color: C.ac, fontSize: 12, fontFamily: "inherit", cursor: "pointer", padding: 0 }}>Effacer les filtres</button>
        </div>
      )}
      {isError && <div style={{ fontSize: 12.5, color: C.o }}>Banque : lecture impossible.</div>}
      {!isLoading && !isError && rows.length === 0 && <div style={{ ...CARD, padding: 14, fontSize: 13, color: C.tx3 }}>Aucun exercice ne correspond.</div>}
      {rows.length > 0 && (
        <div style={{ ...CARD, padding: "2px 14px" }}>
          {rows.map((ex, i) => {
            const col = exTypeColor(ex.ex_type);
            const meta = [ex.target ? mL(ex.target) : null, ex.equipment, ex.is_verified ? null : "communauté"].filter(Boolean).join(" · ");
            return (
              <button key={ex.id} type="button" onClick={() => setOpen(ex)} style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 0", background: "none", border: "none",
                boxShadow: rowLine(i), color: C.tx, fontFamily: "inherit", textAlign: "left", cursor: "pointer",
              }}>
                <ExTile color={col} video={!!(ex.youtube_id || ex.gif_url)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ex.name}</div>
                  {ex.ex_type && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.tx2, marginTop: 1 }}>
                      <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: col }} />{exTypeLabel(ex.ex_type)}
                    </div>
                  )}
                  {meta && <div style={{ ...MONO, fontSize: 11, color: C.tx3, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta}</div>}
                </div>
                <Chevron />
              </button>
            );
          })}
        </div>
      )}
      {rows.length < total && (
        <button type="button" disabled={isFetching} onClick={() => setCount((c) => c + PAGE)} style={{
          height: 42, borderRadius: 11, border: `1px solid ${C.brdL}`, background: "transparent", color: C.tx2, fontSize: 13, fontFamily: "inherit", cursor: "pointer",
        }}>{isFetching ? "Chargement…" : `Voir plus (${total - rows.length})`}</button>
      )}
      <div style={{ fontSize: 11.5, color: C.tx3, textAlign: "center" }}>Lecture seule. Créer ou modifier un exercice : sur ordinateur.</div>
    </PhonePage>
  );
}

/** Vignette d'exercice : lecture si une vidéo existe, sinon haltère. */
function ExTile({ color, video }: { color: string; video: boolean }) {
  return (
    <span aria-hidden style={{
      width: 46, height: 46, flex: "none", borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center",
      background: alpha(color, 0.12), border: `1px solid ${alpha(color, 0.35)}`, color,
    }}>
      {video ? (
        <span style={{ width: 22, height: 22, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="8" height="10" viewBox="0 0 8 10"><path d="M0 0l8 5-8 5z" fill={C.bg} /></svg>
        </span>
      ) : (
        <svg width="20" height="12" viewBox="0 0 20 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M1 6h18M4 2v8M7 3.5v5M13 3.5v5M16 2v8" />
        </svg>
      )}
    </span>
  );
}

function ExerciseSheet({ ex, onBack }: { ex: ExerciseRow; onBack: () => void }) {
  const steps = (ex.instructions ?? "").split(/\n+/).map((s) => s.replace(/^\s*(\d+[.)]|[-•])\s*/, "").trim()).filter(Boolean);
  const primary = [ex.target, ex.target_2].filter((m): m is string => !!m);
  const secondary = ex.secondary ?? [];
  const col = exTypeColor(ex.ex_type);
  return (
    <PhonePage gap={12} style={{ paddingTop: 14 }}>
      <button type="button" onClick={onBack} style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: C.tx2, fontSize: 13, fontFamily: "inherit", cursor: "pointer", padding: 0 }}>
        <Chevron dir="left" color={C.tx2} /> Banque
      </button>
      {ex.youtube_id ? (
        <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: 14, overflow: "hidden", background: C.s1 }}>
          <iframe
            title={`Vidéo : ${ex.name}`}
            src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(ex.youtube_id)}?rel=0&playsinline=1`}
            allow="encrypted-media; picture-in-picture; fullscreen"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
          />
        </div>
      ) : ex.image_url || ex.gif_url ? (
        <img src={(ex.gif_url || ex.image_url)!} alt="" style={{ width: "100%", borderRadius: 14, background: C.s1 }} />
      ) : null}
      <div>
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          {ex.ex_type && <Tag color={col}>{exTypeLabel(ex.ex_type)}</Tag>}
          {ex.is_verified && <Tag color={C.g}>Officiel</Tag>}
        </div>
        <div style={{ fontSize: 19, fontWeight: 500 }}>{ex.name}</div>
        <div style={{ fontSize: 12.5, color: C.tx3 }}>{[ex.equipment, ex.difficulty ? `niveau ${ex.difficulty.toLowerCase()}` : null].filter(Boolean).join(" · ") || " "}</div>
      </div>
      {(steps.length > 0 || ex.tips) && (
        <Section n={1} title="Consignes">
          <div style={{ ...CARD, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {steps.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 10, fontSize: 13.5, lineHeight: 1.45 }}>
                <span style={{ ...MONO, color: col, width: 14, flex: "none" }}>{i + 1}</span><span>{s}</span>
              </div>
            ))}
            {ex.tips && <div style={{ fontSize: 12.5, color: C.tx2, lineHeight: 1.45 }}>{ex.tips}</div>}
          </div>
        </Section>
      )}
      {(primary.length > 0 || secondary.length > 0) && (
        <Section n={steps.length > 0 || ex.tips ? 2 : 1} title="Muscles">
          <div style={{ ...CARD, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {primary.length > 0 && (
              <div>
                <div style={{ ...KICKER, color: C.tx3, marginBottom: 6 }}>Principaux</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{primary.map((m) => <Tag key={m} color={C.ac} filled>{mL(m)}</Tag>)}</div>
              </div>
            )}
            {secondary.length > 0 && (
              <div>
                <div style={{ ...KICKER, color: C.tx3, marginBottom: 6 }}>Secondaires</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{secondary.map((m) => <Tag key={m} color={C.tx2}>{mL(m)}</Tag>)}</div>
              </div>
            )}
          </div>
        </Section>
      )}
      <div style={{ fontSize: 11.5, color: C.tx3, textAlign: "center", padding: 8, borderRadius: 10, background: alpha(C.tx, 0.03) }}>Modifier l’exercice : sur ordinateur.</div>
    </PhonePage>
  );
}
