/**
 * Module Fiches — lectures (React Query).
 * RLS : la visibilité est entièrement portée par can_read_doc() côté base.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { groupFamilies } from "../../types/fiches";
import type { Doc, DocAssignment, DocFamily } from "../../types/fiches";

const asDocs = (rows: unknown) => (rows ?? []) as Doc[];

/** Fiches de banque du coach (origines + variantes), archivées comprises. */
export function useDocsBank(coachId: string | undefined) {
  return useQuery<DocFamily[]>({
    queryKey: QK.docsBank(coachId ?? ""),
    enabled: !!coachId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("docs")
        .select("*")
        .eq("coach_id", coachId!)
        .is("athlete_id", null)
        .order("title", { ascending: true });
      if (error) throw error;
      return groupFamilies(asDocs(data));
    },
  });
}

/** Banque libre-service du coach de l'athlète (origines + variantes lisibles). */
export function useSelfServiceDocs(coachId: string | null | undefined) {
  return useQuery<DocFamily[]>({
    queryKey: QK.docsSelfService(coachId ?? ""),
    enabled: !!coachId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("docs")
        .select("*")
        .eq("coach_id", coachId!)
        .is("athlete_id", null)
        .is("archived_at", null)
        .order("title", { ascending: true });
      if (error) throw error;
      // Les variantes d'une fiche libre-service n'ont pas le flag : on garde
      // les origines flaguées et leurs variantes.
      return groupFamilies(asDocs(data)).filter(f => f.origin.is_self_service);
    },
  });
}

export function useDoc(docId: string | undefined | null) {
  return useQuery<Doc | null>({
    queryKey: QK.doc(docId ?? ""),
    enabled: !!docId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("docs").select("*").eq("id", docId!).maybeSingle();
      if (error) throw error;
      return (data as Doc | null) ?? null;
    },
  });
}

/** Origine + variantes d'une famille (lisibles par l'utilisateur courant). */
export function useDocVariants(originId: string | undefined | null) {
  return useQuery<Doc[]>({
    queryKey: QK.docFamily(originId ?? ""),
    enabled: !!originId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("docs")
        .select("*")
        .or(`id.eq.${originId},origin_id.eq.${originId}`);
      if (error) throw error;
      const fam = groupFamilies(asDocs(data))[0];
      return fam ? [fam.origin, ...fam.variants] : asDocs(data);
    },
  });
}

/** Fiches par ids (chips d'un éditeur ou d'une séance). Les ids illisibles sont ignorés. */
export function useDocsByIds(ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  return useQuery<Record<string, Doc>>({
    queryKey: QK.docsByIds(sorted.join(",")),
    enabled: sorted.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("docs").select("*").in("id", sorted);
      if (error) throw error;
      return Object.fromEntries(asDocs(data).map(d => [d.id, d]));
    },
  });
}

export interface AssignedDoc {
  doc: Doc;
  /** Sources cumulées (une fiche peut être attribuée par la programmation ET manuellement) */
  sources: DocAssignment["source"][];
  assignments: DocAssignment[];
  coachNote: string | null;
  /** Vue si au moins une attribution est vue */
  seenAt: string | null;
}

export interface AthleteDocs {
  assigned: AssignedDoc[];
  /** Fiches personnelles importées par le coach pour cet athlète */
  personal: Doc[];
  /** Fichiers ajoutés par l'athlète */
  uploads: Doc[];
}

/** Fiches d'un athlète : attribuées (toutes sources) + personnelles + ajouts. */
export function useAthleteDocs(athleteId: string | undefined | null) {
  return useQuery<AthleteDocs>({
    queryKey: QK.athleteDocs(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 30_000,
    queryFn: async () => {
      const [{ data: asg, error: e1 }, { data: own, error: e2 }] = await Promise.all([
        supabase
          .from("doc_assignments")
          .select("*, docs(*)")
          .eq("athlete_id", athleteId!)
          .order("created_at", { ascending: false }),
        supabase
          .from("docs")
          .select("*")
          .eq("athlete_id", athleteId!)
          .order("created_at", { ascending: false }),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const byDoc = new Map<string, AssignedDoc>();
      for (const row of (asg ?? []) as (DocAssignment & { docs: Doc | null })[]) {
        if (!row.docs) continue;
        const { docs: doc, ...a } = row;
        const cur = byDoc.get(doc.id) ?? { doc, sources: [], assignments: [], coachNote: null, seenAt: null };
        cur.assignments.push(a);
        if (!cur.sources.includes(a.source)) cur.sources.push(a.source);
        if (a.coach_note && !cur.coachNote) cur.coachNote = a.coach_note;
        if (a.seen_at && (!cur.seenAt || a.seen_at > cur.seenAt)) cur.seenAt = a.seen_at;
        byDoc.set(doc.id, cur);
      }
      const ownDocs = asDocs(own);
      return {
        assigned: [...byDoc.values()],
        personal: ownDocs.filter(d => d.uploaded_by !== athleteId),
        uploads: ownDocs.filter(d => d.uploaded_by === athleteId),
      };
    },
  });
}

export interface DocAssignmentWithFamily extends DocAssignment {
  doc_title: string;
  variant_label: string | null;
}

/** Coach : attributions d'une famille de fiches (qui l'a, qui l'a vue). */
export function useDocFamilyAssignments(originId: string | undefined | null) {
  return useQuery<DocAssignmentWithFamily[]>({
    queryKey: QK.docAssignments(originId ?? ""),
    enabled: !!originId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: fam, error: e1 } = await supabase
        .from("docs")
        .select("id, title, variant_label")
        .or(`id.eq.${originId},origin_id.eq.${originId}`);
      if (e1) throw e1;
      const ids = (fam ?? []).map(d => d.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase.from("doc_assignments").select("*").in("doc_id", ids);
      if (error) throw error;
      const meta = new Map((fam ?? []).map(d => [d.id, d]));
      return ((data ?? []) as DocAssignment[]).map(a => ({
        ...a,
        doc_title: meta.get(a.doc_id)?.title ?? "",
        variant_label: meta.get(a.doc_id)?.variant_label ?? null,
      }));
    },
  });
}

/** URL signée (bucket privé). 1 h côté Storage, cache 50 min. */
export function useDocSignedUrl(filePath: string | null | undefined) {
  return useQuery<string | null>({
    queryKey: QK.docSignedUrl(filePath ?? ""),
    enabled: !!filePath,
    staleTime: 50 * 60_000,
    gcTime: 55 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("docs").createSignedUrl(filePath!, 3600);
      if (error) throw error;
      return data?.signedUrl ?? null;
    },
  });
}
