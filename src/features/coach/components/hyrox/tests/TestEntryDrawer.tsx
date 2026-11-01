import { useEffect, useMemo, useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { C } from "@/lib/theme";
import { RACE_LOADS, batterySlugOf, type AthleteTestProfile, type BatteryResult } from "@/lib/hyrox/tests";
import { useSaveBatteryEntry, type BatteryTest, type BatteryVariable } from "@/features/shared/hooks/hyrox/useHyroxTests";
import { Btn, Muted } from "./ui";
import { displayEntry, inputStyle, labelStyle, parseEntry, todayIso } from "./format";

interface Props {
  athleteId: string;
  test: BatteryTest | null;
  previous?: BatteryResult;
  profile: AthleteTestProfile | null;
  onClose: () => void;
}

const placeholderFor = (v: BatteryVariable) =>
  v.value_type === "duration" ? (/^time_\d+$|^r\d_t\d$/.test(v.key) ? "ex : 9,8" : "ex : 7:48") : v.unit === "bpm" ? "ex : 172" : "ex : 12";

/** Conseils de charge : sleds à 80 / 100 / 120 % de la charge de course, wall balls de la catégorie. */
function loadHint(test: BatteryTest, profile: AthleteTestProfile | null): string | null {
  if (!profile) return null;
  const L = RACE_LOADS[profile.category][profile.sex];
  const slug = batterySlugOf(test.id);
  const pct = (kg: number) => [0.8, 1, 1.2].map(f => Math.round(kg * f)).join(" / ");
  if (slug === "sled_push") return `Charges (sled compris) : ${pct(L.sled_push_kg)} kg. Saisis la charge réelle si elle diffère.`;
  if (slug === "sled_pull") return `Charges (sled compris) : ${pct(L.sled_pull_kg)} kg. Saisis la charge réelle si elle diffère.`;
  if (slug === "week1_sled_push") return `Charge de course : ${L.sled_push_kg} kg.`;
  if (slug === "week1_sled_pull") return `Charge de course : ${L.sled_pull_kg} kg.`;
  if (slug === "wall_balls_5min") return `Wall ball ${L.wall_ball}.`;
  return null;
}

export default function TestEntryDrawer({ athleteId, test, previous, profile, onClose }: Props) {
  const save = useSaveBatteryEntry(athleteId);
  const [date, setDate] = useState(todayIso());
  const [values, setValues] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!test) return;
    setDate(todayIso());
    setComment("");
    // Pré-remplit les charges des sleds (80 / 100 / 120 %) ; le reste reste vide.
    const init: Record<string, string> = {};
    if (profile) {
      const L = RACE_LOADS[profile.category][profile.sex];
      const slug = batterySlugOf(test.id);
      const race = slug === "sled_push" ? L.sled_push_kg : slug === "sled_pull" ? L.sled_pull_kg : null;
      if (race) for (const [k, f] of [["load_80", 0.8], ["load_100", 1], ["load_120", 1.2]] as const) init[k] = String(Math.round(race * f));
    }
    setValues(init);
  }, [test, profile]);

  const grid = useMemo(() => test?.test_variables.filter(v => /^r\d_t\d$/.test(v.key)) ?? [], [test]);
  const plain = useMemo(() => test?.test_variables.filter(v => !/^r\d_t\d$/.test(v.key)) ?? [], [test]);
  const parsed = useMemo(() => {
    const out: Record<string, number | null> = {};
    const bad: string[] = [];
    for (const v of test?.test_variables ?? []) {
      const raw = values[v.key] ?? "";
      const x = parseEntry(raw, v.value_type);
      if (raw.trim() && x == null) bad.push(v.label);
      out[v.key] = x;
    }
    return { out, bad };
  }, [test, values]);
  const filled = Object.values(parsed.out).some(x => x != null);

  if (!test) return null;
  const hint = loadHint(test, profile);
  const set = (k: string, x: string) => setValues(p => ({ ...p, [k]: x }));

  const field = (v: BatteryVariable, compact = false) => (
    <div key={v.key} style={{ minWidth: 0 }}>
      {!compact && <label style={labelStyle}>{v.label} <span style={{ color: C.tx3, fontWeight: 400 }}>({v.unit})</span></label>}
      <input
        aria-label={v.label}
        inputMode="decimal"
        value={values[v.key] ?? ""}
        onChange={e => set(v.key, e.target.value)}
        placeholder={compact ? "s" : placeholderFor(v)}
        style={{ ...inputStyle, ...(compact ? { padding: "6px 6px", textAlign: "center" as const } : {}) }}
      />
      {!compact && previous?.values[v.key] != null && (
        <Muted style={{ marginTop: 3 }}>Dernier : {displayEntry(previous.values[v.key], v.value_type)} {v.unit} ({previous.performed_at.split("-").reverse().join("/")})</Muted>
      )}
    </div>
  );

  return (
    <Drawer open={!!test} onOpenChange={o => !o && onClose()}>
      <DrawerContent style={{ background: C.s1, borderTop: "1px solid " + C.brd, maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <DrawerHeader style={{ padding: "16px 20px 8px", flexShrink: 0 }}>
          <DrawerTitle style={{ color: C.tx, fontSize: 16 }}>{test.name}</DrawerTitle>
          {test.description && <Muted>{test.description}</Muted>}
        </DrawerHeader>
        <div style={{ overflowY: "auto", padding: "4px 20px 28px", maxWidth: 560, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
          {test.protocol?.text && (
            <div style={{ background: C.s2, borderRadius: 4, padding: "10px 12px", marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", marginBottom: 4 }}>Protocole</div>
              <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.55 }}>{test.protocol.text}</div>
              {test.protocol.video && <Muted style={{ marginTop: 6 }}>Vidéo : {test.protocol.video}</Muted>}
              {test.media_url && (
                <a href={test.media_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: C.ac, display: "inline-block", marginTop: 6 }}>
                  Voir la démonstration
                </a>
              )}
            </div>
          )}
          {hint && <Muted style={{ marginBottom: 12, color: C.tx2 }}>{hint}</Muted>}

          <label style={labelStyle}>Date du test</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }} />

          {grid.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Temps de chaque tronçon de 12,5 m (s)</label>
              <div style={{ display: "grid", gridTemplateColumns: "52px repeat(4, 1fr)", gap: 6, alignItems: "center" }}>
                <span />
                {[1, 2, 3, 4].map(t => <Muted key={t} style={{ textAlign: "center" }}>{t}</Muted>)}
                {[1, 2, 3].map(r => (
                  <div key={r} style={{ display: "contents" }}>
                    <Muted>Rép. {r}</Muted>
                    {[1, 2, 3, 4].map(t => {
                      const v = grid.find(x => x.key === `r${r}_t${t}`);
                      return v ? field(v, true) : <span key={t} />;
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
            {plain.map(v => field(v))}
          </div>

          <label style={{ ...labelStyle, marginTop: 14 }}>Commentaire (gêne, conditions, matériel)</label>
          <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} />

          {parsed.bad.length > 0 && (
            <div style={{ fontSize: 11, color: C.r, marginTop: 10 }}>Valeur illisible : {parsed.bad.join(", ")}. Temps en « m:ss » ou en secondes.</div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <Btn onClick={onClose}>Annuler</Btn>
            <Btn
              primary
              disabled={!filled || parsed.bad.length > 0 || !date || save.isPending}
              onClick={() => save.mutate({ test, date, values: parsed.out, comment }, { onSuccess: onClose })}
            >
              {save.isPending ? "Enregistrement…" : "Enregistrer"}
            </Btn>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
