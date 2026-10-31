/**
 * Module Fiches — types et helpers purs (aucun import React / réseau).
 * Voir docs/FICHES_FEATURE.md.
 */
import { attachmentDocIds, collectDocIds, collectProgDocIds, type FicheAttachment } from "@shared/fiches.ts";

export type FicheCategory =
  | 'mobilite'
  | 'pacing'
  | 'prevention'
  | 'recuperation'
  | 'nutrition'
  | 'education'
  | 'questionnaire'
  | 'autre';

export const FICHE_CATEGORY_LABEL: Record<FicheCategory, string> = {
  mobilite: 'Mobilité',
  pacing: 'Pacing',
  prevention: 'Prévention',
  recuperation: 'Récupération',
  nutrition: 'Nutrition',
  education: 'Éducatif',
  questionnaire: 'Questionnaire',
  autre: 'Autre',
};

/** Catégories utilisables en V1 (questionnaire réservé V2). */
export const FICHE_CATEGORIES: FicheCategory[] = [
  'mobilite', 'pacing', 'prevention', 'recuperation', 'nutrition', 'education', 'autre',
];

export type DocKind = 'pdf' | 'image' | 'questionnaire';

/** Miroir de la table public.docs */
export interface Doc {
  id: string;
  coach_id: string;
  athlete_id: string | null;
  uploaded_by: string | null;
  origin_id: string | null;
  variant_label: string | null;
  variant_order: number;
  title: string;
  description: string | null;
  category: FicheCategory;
  tags: string[];
  kind: DocKind;
  file_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  is_self_service: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type DocAssignmentSource = 'manuel' | 'programme' | 'energie';

export interface DocAssignment {
  id: string;
  doc_id: string;
  athlete_id: string;
  assigned_by: string | null;
  source: DocAssignmentSource;
  coach_note: string | null;
  seen_at: string | null;
  created_at: string;
}

export interface DocComment {
  id: string;
  doc_id: string;
  athlete_id: string;
  author_id: string;
  body: string;
  image_path: string | null;
  created_at: string;
}

/** Fiche d'origine + ses variantes (ordre d'affichage). */
export interface DocFamily {
  origin: Doc;
  variants: Doc[];
}

// Rattachements (JSON des séances) : partagés avec l'Edge Function coach-api,
// qui synchronise les attributions avec le même calcul.
export type { FicheAttachment };
export { attachmentDocIds, collectDocIds, collectProgDocIds };

/** Libellé d'une variante (« Originale » pour l'origine). */
export function variantLabel(doc: Pick<Doc, 'origin_id' | 'variant_label'>): string {
  if (doc.variant_label) return doc.variant_label;
  return doc.origin_id ? 'Variante' : 'Originale';
}

/** doc_id à afficher pour une semaine donnée (clés JSON : string ou number). */
export function resolveFicheForWeek(att: FicheAttachment, week: number | undefined): string {
  if (week == null || !att.weeks) return att.doc_id;
  const rec = att.weeks as Record<string, string>;
  return rec[String(week)] || att.doc_id;
}

interface WithFiches {
  fiches?: FicheAttachment[] | null;
}

interface SessionLike extends WithFiches {
  blocs?: WithFiches[] | unknown[];
}

/** Aplatit les rattachements sur une semaine (override d'une occurrence, banque mono-semaine). */
export function flattenFichesToWeek(
  atts: FicheAttachment[] | undefined,
  week: number,
): FicheAttachment[] | undefined {
  if (!atts) return atts;
  return atts.map(a => ({ id: a.id, doc_id: resolveFicheForWeek(a, week) }));
}

/**
 * Retire les rattachements qui pointent vers une fiche non transférable
 * (fiche personnelle d'un autre athlète). Retourne la séance nettoyée et le
 * nombre de rattachements retirés.
 */
export function stripFiches<T extends SessionLike>(
  session: T,
  isForeign: (docId: string) => boolean,
): { session: T; removed: number } {
  let removed = 0;
  const keep = (list: FicheAttachment[] | null | undefined) => {
    if (!list) return list;
    const next = list.filter(a => !attachmentDocIds(a).some(isForeign));
    removed += list.length - next.length;
    return next;
  };
  const blocs = (session.blocs as WithFiches[] | undefined)?.map(b =>
    b && b.fiches ? { ...b, fiches: keep(b.fiches) } : b,
  );
  const next = { ...session, fiches: keep(session.fiches) } as T;
  if (blocs) (next as SessionLike).blocs = blocs;
  if (session.fiches === undefined) delete (next as SessionLike).fiches;
  return { session: next, removed };
}

/** Regroupe des fiches (origines + variantes) par famille, triées. */
export function groupFamilies(docs: Doc[]): DocFamily[] {
  const origins = docs.filter(d => !d.origin_id);
  const byOrigin = new Map<string, Doc[]>();
  for (const d of docs) {
    if (!d.origin_id) continue;
    const arr = byOrigin.get(d.origin_id) ?? [];
    arr.push(d);
    byOrigin.set(d.origin_id, arr);
  }
  return origins.map(origin => ({
    origin,
    variants: (byOrigin.get(origin.id) ?? []).sort(
      (a, b) => a.variant_order - b.variant_order || a.created_at.localeCompare(b.created_at),
    ),
  }));
}

/** Extension de fichier à partir du mime (fallback : nom de fichier). */
export function extFor(mime: string, fileName = ''): string {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  const m = fileName.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : 'bin';
}

/** Titre pré-rempli depuis un nom de fichier. */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Fiche';
}

/** Chemin Storage d'une fiche (cf. migration 20261014100000_fiches.sql). */
export function docFilePath(p: { coachId: string; athleteId: string | null; docId: string; ext: string }): string {
  return p.athleteId
    ? `${p.coachId}/athletes/${p.athleteId}/${p.docId}.${p.ext}`
    : `${p.coachId}/banque/${p.docId}.${p.ext}`;
}

export function commentImagePath(p: { coachId: string; athleteId: string; commentId: string; ext?: string }): string {
  return `${p.coachId}/athletes/${p.athleteId}/comments/${p.commentId}.${p.ext ?? 'webp'}`;
}

export const DOC_MAX_BYTES = 10 * 1024 * 1024;
export const DOC_ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
