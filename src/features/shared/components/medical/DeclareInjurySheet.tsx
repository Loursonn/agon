/**
 * Déclaration rapide d'une gêne ou d'une blessure, depuis le profil de l'athlète.
 *
 * Le chemin complet reste le formulaire d'antécédent (`MedicalEntriesSection`),
 * qui demande un type, un statut, un diagnostic. Ici, un nom suffit : la gêne
 * part en « blessure en cours », datée du jour, et tout le détail est facultatif.
 * Une déclaration qui prend dix secondes est une déclaration qui a lieu — et une
 * blessure qu'on ne voit pas, on ne peut pas la gérer.
 */
import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { localISO } from "@/lib/date";
import { EMPTY_INJURY_DETAIL, injuryDetailForSave, type InjuryDetail } from "@/lib/injuryDetails";
import { useSaveMedicalEntry } from "@/features/shared/hooks/useMedicalEntries";
import type { MedicalEntryInput } from "@/features/shared/types/medical";
import { InjuryDetailFields, InjuryIntro } from "./InjuryDetailFields";
import { ghostBtn, inputStyle, labelStyle, primaryBtn } from "./medicalStyles";

export function DeclareInjurySheet({ athleteId, onClose }: { athleteId: string; onClose: () => void }) {
  const save = useSaveMedicalEntry(athleteId);
  const [title, setTitle] = useState("");
  const [zone, setZone] = useState("");
  const [notes, setNotes] = useState("");
  const [detail, setDetail] = useState<InjuryDetail>({ ...EMPTY_INJURY_DETAIL });

  const submit = async () => {
    if (!title.trim()) { toast.error("Dis en deux mots ce que tu ressens"); return; }
    const input: MedicalEntryInput = {
      kind: "blessure",
      // En cours : c'est tout l'intérêt de déclarer maintenant. Le passage en
      // « guéri » se fait depuis le profil, quand c'est vraiment passé.
      status: "en_cours",
      title: title.trim(),
      zone: zone.trim() || null,
      date: localISO(),
      diagnosis: null,
      treatment: null,
      notes: notes.trim() || null,
      ...injuryDetailForSave("blessure", detail),
    };
    try {
      await save.mutateAsync({ input });
      toast.success("Merci, c'est transmis à ton coach");
      onClose();
    } catch { /* toast déjà affiché par le hook */ }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 120, background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto",
          background: C.bg, borderTop: "1px solid " + C.brd,
          borderRadius: "10px 10px 0 0", padding: 16,
          display: "flex", flexDirection: "column", gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>Déclarer une gêne ou une blessure</div>
          <button
            type="button" onClick={onClose} aria-label="Fermer"
            style={{
              width: 30, height: 30, borderRadius: 4, border: "1px solid " + C.brdL,
              background: "transparent", color: C.tx3, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={14} />
          </button>
        </div>

        <InjuryIntro />

        <div>
          <label style={labelStyle}>Qu'est-ce que tu ressens ? *</label>
          <input
            style={inputStyle} value={title} autoFocus
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ex : tiraillement ischio, genou qui pique…"
          />
        </div>

        <div>
          <label style={labelStyle}>Où ?</label>
          <input
            style={inputStyle} value={zone}
            onChange={(e) => setZone(e.target.value)}
            placeholder="Cheville gauche"
          />
        </div>

        <InjuryDetailFields value={detail} onChange={setDetail} />

        <div>
          <label style={labelStyle}>À ajouter ?</label>
          <textarea
            style={{ ...inputStyle, resize: "vertical" }} rows={2} value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Depuis quand, ce qui déclenche, ce qui soulage…"
          />
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingBottom: 4 }}>
          <button type="button" onClick={onClose} style={{ ...ghostBtn, padding: "9px 16px" }}>Annuler</button>
          <button
            type="button" onClick={submit} disabled={save.isPending}
            style={{ ...primaryBtn, opacity: save.isPending ? 0.6 : 1 }}
          >
            {save.isPending ? "Envoi…" : "Déclarer"}
          </button>
        </div>
      </div>
    </div>
  );
}
