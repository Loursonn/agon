/**
 * FicheCommentThread — fil de commentaires d'une fiche pour un athlète.
 * Texte + une image optionnelle (compressée en WebP avant envoi).
 */
import { useRef, useState } from "react";
import { C } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import {
  useAddDocComment, useDeleteDocComment, useDocComments,
} from "@/features/shared/hooks/fiches/useDocComments";
import { useDocSignedUrl } from "@/features/shared/hooks/fiches/useDocs";
import type { DocComment } from "@/features/shared/types/fiches";
import { personName, useAthleteStaff } from "@/features/staff/hooks/useAthleteStaff";
import { professionLabel } from "@/features/staff/lib/staffPermissions";
import { btnGhost, btnPrimary, input, sectionTitle } from "./ficheStyles";

interface Props {
  docId: string;
  athleteId: string;
  /** Coach propriétaire du dossier Storage de l'athlète */
  coachId: string;
  /** Nom affiché pour les messages de l'athlète (côté coach) */
  athleteName?: string;
  /** Lecture seule (pro du staff sans droit d'écriture sur les commentaires) */
  readOnly?: boolean;
}

function CommentImage({ path }: { path: string }) {
  const { data: url } = useDocSignedUrl(path);
  if (!url) return <div style={{ height: 80, background: C.s2, borderRadius: 4, marginTop: 6 }} />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <img src={url} alt="Pièce jointe" style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 4, marginTop: 6, display: "block" }} />
    </a>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function FicheCommentThread({ docId, athleteId, coachId, athleteName, readOnly = false }: Props) {
  const { user } = useAuth();
  const { data: comments = [], isLoading } = useDocComments(docId, athleteId);
  const add = useAddDocComment();
  const del = useDeleteDocComment();
  const [body, setBody] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canSend = (body.trim().length > 0 || !!image) && !add.isPending && !!user;

  const send = () => {
    if (!canSend || !user) return;
    add.mutate(
      { docId, athleteId, authorId: user.id, coachId, body, image },
      { onSuccess: () => { setBody(""); setImage(null); } },
    );
  };

  // Les pros du staff commentent aussi : nom + métier plutôt que « Coach ».
  const { data: staff = [] } = useAthleteStaff(athleteId);
  const author = (c: DocComment) => {
    if (c.author_id === user?.id) return "Moi";
    if (c.author_id === athleteId) return athleteName ?? "Athlète";
    if (c.author_id === coachId) return "Coach";
    const pro = staff.find((l) => l.staff_id === c.author_id);
    return pro ? `${personName(pro.staff)} · ${professionLabel(pro.profession)}` : "Staff";
  };

  return (
    <div>
      <h3 style={sectionTitle}>Commentaires</h3>
      {isLoading ? (
        <div style={{ fontSize: 12, color: C.tx3 }}>Chargement…</div>
      ) : comments.length === 0 ? (
        <div style={{ fontSize: 12, color: C.tx3, marginBottom: 10 }}>Aucun commentaire pour l'instant.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {comments.map(c => {
            const mine = c.author_id === user?.id;
            return (
              <div key={c.id} style={{
                alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "88%",
                background: mine ? C.acS : C.s1, border: "1px solid " + (mine ? C.ac + "30" : C.brd),
                borderRadius: 6, padding: "8px 10px",
              }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 10, color: C.tx3, marginBottom: 2 }}>
                  <span style={{ fontWeight: 700, color: mine ? C.ac : C.tx2 }}>{author(c)}</span>
                  <span>{fmt(c.created_at)}</span>
                  {mine && (
                    <button
                      onClick={() => del.mutate(c)}
                      aria-label="Supprimer le commentaire"
                      style={{ marginLeft: "auto", background: "none", border: "none", color: C.tx3, cursor: "pointer", fontSize: 13, minWidth: 28, minHeight: 28, fontFamily: "inherit" }}
                    >×</button>
                  )}
                </div>
                {c.body && <div style={{ fontSize: 13, color: C.tx, whiteSpace: "pre-wrap" }}>{c.body}</div>}
                {c.image_path && <CommentImage path={c.image_path} />}
              </div>
            );
          })}
        </div>
      )}

      {!readOnly && <>
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Une question, un retour sur la fiche…"
        rows={2}
        style={{ ...input, resize: "vertical", minHeight: 60 }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={() => fileRef.current?.click()} style={btnGhost}>
          {image ? "Changer l'image" : "+ Image"}
        </button>
        {image && (
          <span style={{ fontSize: 11, color: C.tx3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>
            {image.name}
            <button onClick={() => setImage(null)} aria-label="Retirer l'image" style={{ background: "none", border: "none", color: C.tx3, cursor: "pointer", marginLeft: 4, fontFamily: "inherit" }}>×</button>
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button type="button" onClick={send} disabled={!canSend} style={{ ...btnPrimary, opacity: canSend ? 1 : 0.5 }}>
          {add.isPending ? "Envoi…" : "Envoyer"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={e => { setImage(e.target.files?.[0] ?? null); e.target.value = ""; }}
        />
      </div>
      </>}
    </div>
  );
}
