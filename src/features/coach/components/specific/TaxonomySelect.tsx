/**
 * TaxonomySelect — sélecteur de référentiel (Sport ou Qualité physique)
 * avec ajout d'une valeur custom à la volée (« + Ajouter »).
 */
import { useState } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";

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

export default function TaxonomySelect({ placeholder, options, value, onChange, onCreate, width = 150, accent = C.o }: Props) {
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
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
            if (e.key === "Escape") { setAdding(false); setNewName(""); }
          }}
          placeholder={placeholder + "…"}
          // Largeur et teinte = props : restent en style.
          className="rounded-[6px] border bg-agon-s2 px-2.5 py-1.5 text-[12px] text-agon-tx outline-none"
          style={{ width: width - 10, borderColor: accent + "60" }}
        />
        <button
          onClick={handleCreate}
          disabled={saving || !newName.trim()}
          className={cn("cursor-pointer rounded-[6px] px-2.5 py-1.5 text-[12px] font-bold text-agon-ink", saving || !newName.trim() ? "opacity-50" : "opacity-100")}
          style={{ background: accent }}
        >
          {saving ? "…" : "OK"}
        </button>
        <button
          onClick={() => { setAdding(false); setNewName(""); }}
          className="cursor-pointer rounded-[6px] border border-agon-brd bg-transparent px-2 py-1.5 text-[12px] text-agon-tx3"
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
      <SelectTrigger className="rounded border-agon-brd bg-agon-s2 text-[12px] leading-5 text-agon-tx" style={{ width }}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      {/* zIndex > modals (91/310) sinon le dropdown passe derrière les popups */}
      <SelectContent className="z-[400]">
        <SelectItem value={NONE}>
          <span className="text-agon-tx3">{placeholder}</span>
        </SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            <span className="inline-flex items-center gap-1.5">
              {o.color && <span className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: o.color }} />}
              {o.name}
            </span>
          </SelectItem>
        ))}
        <SelectItem value="__add__">
          <span className="font-semibold" style={{ color: accent }}>+ Ajouter…</span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
