import { useState } from "react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import {
  useCoachApiKeys,
  useCreateCoachApiKey,
  useRevokeCoachApiKey,
} from "@/features/coach/hooks/useCoachApiKeys";

const API_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/coach-api`;

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "jamais";

const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10,
};

const btn = (active: boolean): React.CSSProperties => ({
  padding: "8px 14px", borderRadius: 4,
  border: "1px solid " + C.coach + "50",
  background: active ? C.coachS : "transparent",
  color: active ? C.coach : C.tx3,
  fontSize: 12, fontWeight: 600, fontFamily: "inherit",
  cursor: active ? "pointer" : "default", opacity: active ? 1 : 0.5, flexShrink: 0,
});

/**
 * Clés API pour l'assistant IA personnel du coach.
 *
 * La clé n'est affichée qu'une fois : seul son hash est en base, Agon ne peut
 * pas la redonner.
 */
export function CoachApiKeysSection() {
  const { data: keys = [] } = useCoachApiKeys();
  const create = useCreateCoachApiKey();
  const revoke = useRevokeCoachApiKey();
  const [name, setName] = useState("");
  const [freshKey, setFreshKey] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) return;
    try {
      const key = await create.mutateAsync(name);
      setFreshKey(key);
      setName("");
    } catch {
      toast.error("La clé n'a pas pu être créée");
    }
  }

  async function handleCopy(text: string, what: string) {
    await navigator.clipboard.writeText(text);
    toast.success(what + " copié");
  }

  async function handleRevoke(id: string, keyName: string) {
    if (!window.confirm(`Révoquer « ${keyName} » ? L'assistant qui l'utilise perdra l'accès immédiatement.`)) return;
    try {
      await revoke.mutateAsync(id);
      toast.success("Clé révoquée");
    } catch {
      toast.error("La révocation a échoué");
    }
  }

  const active = keys.filter((k) => !k.revoked_at);
  const revoked = keys.filter((k) => k.revoked_at);

  return (
    <div style={{ background: C.s1, borderRadius: 6, padding: 16, border: "1px solid " + C.brd, marginBottom: 16 }}>
      <div style={label}>Assistant IA (Claude)</div>
      <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.5, marginBottom: 12 }}>
        Une clé permet à ton assistant IA de lire les données de tes athlètes qui l'ont accepté,
        pour t'en faire des analyses, et de te proposer des axes de travail ou des modifications
        de programme. Il ne modifie jamais rien seul : ses propositions t'attendent dans la fiche
        de l'athlète, et rien ne change tant que tu ne les as pas appliquées.
      </div>

      {freshKey ? (
        <div style={{ border: "1px solid " + C.coach + "50", background: C.coachS, borderRadius: 4, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: C.tx, fontWeight: 600, marginBottom: 6 }}>
            Copie ta clé maintenant : elle ne sera plus affichée.
          </div>
          <code style={{ display: "block", fontSize: 12, color: C.coach, wordBreak: "break-all", marginBottom: 8 }}>
            {freshKey}
          </code>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => handleCopy(freshKey, "Clé")} style={btn(true)}>Copier la clé</button>
            <button onClick={() => setFreshKey(null)} style={btn(true)}>C'est fait</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
            maxLength={60}
            placeholder="Nom de la clé (ex. Claude sur mon Mac)"
            style={{
              flex: 1, minWidth: 0, boxSizing: "border-box", padding: "8px 12px", borderRadius: 4,
              border: "1px solid " + C.brdL, background: C.s2, color: C.tx,
              fontSize: 13, fontFamily: "inherit", outline: "none",
            }}
          />
          <button
            onClick={() => void handleCreate()}
            disabled={!name.trim() || create.isPending}
            style={btn(!!name.trim() && !create.isPending)}
          >
            {create.isPending ? "Création…" : "Générer une clé"}
          </button>
        </div>
      )}

      <div style={{ fontSize: 11, color: C.tx3, marginBottom: active.length || revoked.length ? 12 : 0, lineHeight: 1.5 }}>
        Adresse de l'API :{" "}
        <button
          onClick={() => handleCopy(API_BASE_URL, "Adresse")}
          title="Copier"
          style={{ background: "none", border: "none", padding: 0, color: C.tx2, fontSize: 11, fontFamily: "monospace", cursor: "pointer", wordBreak: "break-all", textAlign: "left" }}
        >
          {API_BASE_URL}
        </button>
      </div>

      {active.map((k) => (
        <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid " + C.brd }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: C.tx, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.name}</div>
            <div style={{ fontSize: 11, color: C.tx3 }}>
              <code>{k.key_prefix}…</code> · créée le {fmt(k.created_at)} · utilisée {k.last_used_at ? "le " + fmt(k.last_used_at) : "jamais"}
            </div>
          </div>
          <button
            onClick={() => void handleRevoke(k.id, k.name)}
            disabled={revoke.isPending}
            style={{
              padding: "6px 12px", borderRadius: 4, border: "1px solid rgba(239,75,75,0.3)",
              background: "rgba(239,75,75,0.08)", color: C.r, fontSize: 11, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
            }}
          >
            Révoquer
          </button>
        </div>
      ))}

      {revoked.length > 0 && (
        <div style={{ fontSize: 11, color: C.tx3, paddingTop: 8, borderTop: "1px solid " + C.brd }}>
          {revoked.length} clé{revoked.length > 1 ? "s" : ""} révoquée{revoked.length > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
