import { useEffect, useState } from "react";
import { C, alpha } from "@/lib/theme";
import { useExerciseBankPage } from "@/features/shared/hooks/useExerciseLibrary";
import type { ExerciseRow } from "@/api/exercises";
import { EX_TYPES, exTypeColor, exTypeLabel } from "@/lib/exerciseTypes";
import { MTREE, mL } from "@/lib/muscles";
import { CARD, Chevron, Chip, KICKER, MONO, PhonePage, Section, Tag, rowLine } from "./phoneUi";

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
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>Banque</h1>
        {!filtered && total > 0 && <span style={{ ...MONO, fontSize: 11.5, color: C.tx3 }}>{total} exercices</span>}
      </div>
      <input
        type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Rechercher un exercice" aria-label="Rechercher un exercice"
        style={{ height: 42, padding: "0 12px", borderRadius: 11, border: `1px solid ${C.brdL}`, background: C.s1, color: C.tx, fontSize: 16, fontFamily: "inherit" }}
      />
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
          {rows.map((ex, i) => (
            <button key={ex.id} type="button" onClick={() => setOpen(ex)} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 0", background: "none", border: "none",
              boxShadow: rowLine(i), color: C.tx, fontFamily: "inherit", textAlign: "left", cursor: "pointer",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ex.name}</div>
                {(ex.target || ex.equipment) && (
                  <div style={{ fontSize: 11.5, color: C.tx3 }}>{[ex.target ? mL(ex.target) : null, ex.equipment].filter(Boolean).join(" · ")}</div>
                )}
              </div>
              {(ex.ex_type || !ex.is_verified) && (
                <span style={{ fontSize: 11, whiteSpace: "nowrap", textAlign: "right" }}>
                  {ex.ex_type && <span style={{ color: exTypeColor(ex.ex_type) }}>{exTypeLabel(ex.ex_type)}</span>}
                  {!ex.is_verified && <span style={{ color: C.tx3 }}>{ex.ex_type ? " · " : ""}communauté</span>}
                </span>
              )}
              <Chevron />
            </button>
          ))}
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
