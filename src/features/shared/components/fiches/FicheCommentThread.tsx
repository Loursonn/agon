/**
 * FicheCommentThread — fil de commentaires d'une fiche pour un athlète.
 * Texte + une image optionnelle (compressée en WebP avant envoi).
 */
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  useAddDocComment, useDeleteDocComment, useDocComments,
} from "@/features/shared/hooks/fiches/useDocComments";
import { useDocSignedUrl } from "@/features/shared/hooks/fiches/useDocs";
import type { DocComment } from "@/features/shared/types/fiches";
import { personName, useAthleteStaff } from "@/features/staff/hooks/useAthleteStaff";
import { useAthleteCoaches } from "@/features/shared/hooks/useCoCoach";
import { professionLabel } from "@/features/staff/lib/staffPermissions";
import { BTN_GHOST, BTN_PRIMARY, INPUT, SECTION_TITLE } from "./ficheStyles";

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
  if (!url) return <div className="mt-1.5 h-20 rounded-[4px] bg-agon-s2" />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <img src={url} alt="Pièce jointe" className="mt-1.5 block max-h-[260px] max-w-full rounded-[4px]" />
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
  // Double coach : référent et co-coach s'affichent tous deux « Coach »
  const { data: coaches } = useAthleteCoaches(athleteId);
  const author = (c: DocComment) => {
    if (c.author_id === user?.id) return "Moi";
    if (c.author_id === athleteId) return athleteName ?? "Athlète";
    if (c.author_id === coachId || c.author_id === coaches?.referent?.id) return "Coach";
    if (c.author_id === coaches?.coCoach?.id) return `Coach · ${coaches.coCoach.full_name}`;
    const pro = staff.find((l) => l.staff_id === c.author_id);
    return pro ? `${personName(pro.staff)} · ${professionLabel(pro.profession)}` : "Staff";
  };

  return (
    <div>
      <h3 className={SECTION_TITLE}>Commentaires</h3>
      {isLoading ? (
        <div className="text-[12px] text-agon-tx3">Chargement…</div>
      ) : comments.length === 0 ? (
        <div className="mb-2.5 text-[12px] text-agon-tx3">Aucun commentaire pour l'instant.</div>
      ) : (
        <div className="mb-3 flex flex-col gap-2">
          {comments.map(c => {
            const mine = c.author_id === user?.id;
            return (
              <div key={c.id} className={cn(
                "max-w-[88%] rounded-[6px] border px-2.5 py-2",
                mine ? "self-end border-agon-accent/[0.19] bg-agon-accent-doux" : "self-start border-agon-brd bg-agon-s1",
              )}>
                <div className="mb-0.5 flex items-center gap-2 text-[10px] text-agon-tx3">
                  <span className={cn("font-bold", mine ? "text-agon-accent" : "text-agon-tx2")}>{author(c)}</span>
                  <span>{fmt(c.created_at)}</span>
                  {mine && (
                    <button
                      onClick={() => del.mutate(c)}
                      aria-label="Supprimer le commentaire"
                      className="ml-auto min-h-7 min-w-7 cursor-pointer border-none bg-transparent font-[inherit] text-[13px] text-agon-tx3"
                    >×</button>
                  )}
                </div>
                {c.body && <div className="whitespace-pre-wrap text-[13px] text-agon-tx">{c.body}</div>}
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
        className={cn(INPUT, "min-h-[60px] resize-y")}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} className={BTN_GHOST}>
          {image ? "Changer l'image" : "+ Image"}
        </button>
        {image && (
          <span className="max-w-[140px] truncate text-[11px] text-agon-tx3">
            {image.name}
            <button onClick={() => setImage(null)} aria-label="Retirer l'image" className="ml-1 cursor-pointer border-none bg-transparent font-[inherit] text-agon-tx3">×</button>
          </span>
        )}
        <div className="flex-1" />
        <button type="button" onClick={send} disabled={!canSend} className={cn(BTN_PRIMARY, canSend ? "opacity-100" : "opacity-50")}>
          {add.isPending ? "Envoi…" : "Envoyer"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={e => { setImage(e.target.files?.[0] ?? null); e.target.value = ""; }}
        />
      </div>
      </>}
    </div>
  );
}
