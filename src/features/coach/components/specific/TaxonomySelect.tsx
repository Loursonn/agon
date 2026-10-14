/**
 * TaxonomySelect — sélecteur de référentiel (Sport ou Qualité physique)
 * avec ajout d'une valeur custom à la volée (« + Ajouter »).
 */
import { useState } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { C } from "@/lib/theme";

interface Option {
  id: string;
  name: string;
  color?: string | null;
}

interface Props {
  placeholder: string;
  options: Option[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** Création d'une valeur custom ; doit résoudre avec la nouvelle option */
  onCreate: (name: string) => Promise<Option | undefined>;
  width?: number;
  accent?: string;
}

const NONE = "__none__";

export default function TaxonomySelect({ placeholder, options, value, onChange, onCreate, width = 150, accent = "#F5A623" }: Props) {
  const [adding, setAdding]   = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving]   = useState(false);

  async function handleCreate() {
    const name = newName.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      const created = await onCreate(name);
      if (created) onChange(created.id);
      setNewName("");
      setAdding(false);
    } finally {
      setSaving(false);
    }
  }

  if (adding) {
    return (
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
            if (e.key === "Escape") { setAdding(false); setNewName(""); }
          }}
          placeholder={placeholder + "…"}
          style={{
            width: width - 10, background: C.s2, border: `1px solid ${accent}60`,
            borderRadius: 6, color: C.tx, fontSize: 12,
            padding: "6px 10px", fontFamily: "inherit", outline: "none",
          }}
        />
        <button
          onClick={handleCreate}
          disabled={saving || !newName.trim()}
          style={{
            padding: "6px 10px", borderRadius: 6, border: "none",
            background: accent, color: "#1a1204", fontSize: 12, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit", opacity: saving || !newName.trim() ? 0.5 : 1,
          }}
        >
          {saving ? "…" : "OK"}
        </button>
        <button
          onClick={() => { setAdding(false); setNewName(""); }}
          style={{
            padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.brd}`,
            background: "transparent", color: C.tx3, fontSize: 12,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => {
        if (v === "__add__") { setAdding(true); return; }
        onChange(v === NONE ? null : v);
      }}
    >
      <SelectTrigger style={{ width, background: C.s2, border: `1px solid ${C.brd}`, color: C.tx, fontSize: 12, borderRadius: 4 }}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      {/* zIndex > modals (91/310) sinon le dropdown passe derrière les popups */}
      <SelectContent style={{ zIndex: 400 }}>
        <SelectItem value={NONE}>
          <span style={{ color: C.tx3 }}>{placeholder}</span>
        </SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {o.color && <span style={{ width: 7, height: 7, borderRadius: 999, background: o.color, display: "inline-block" }} />}
              {o.name}
            </span>
          </SelectItem>
        ))}
        <SelectItem value="__add__">
          <span style={{ color: accent, fontWeight: 600 }}>+ Ajouter…</span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
