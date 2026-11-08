/**
 * Module Fiches — lectures (React Query), adaptateurs de `src/api/docs.ts`.
 * RLS : la visibilité est entièrement portée par can_read_doc() côté base.
 */
import { useQuery } from "@tanstack/react-query";
import {
  docSignedUrl, docsKeys, getAthleteDocs, getDoc, getDocsByIds, listBankDocs, listFamilyAssignments,
  listFamilyDocs, listSelfServiceDocs,
  type AthleteDocs, type DocAssignmentWithFamily,
} from "@/api/docs";
import type { Doc, DocFamily } from "../../types/fiches";

export type { AssignedDoc, AthleteDocs, DocAssignmentWithFamily } from "@/api/docs";

/** Fiches de banque du coach (origines + variantes), archivées comprises. */
export function useDocsBank(coachId: string | undefined) {
  return useQuery<DocFamily[]>({
    queryKey: docsKeys.bank(coachId ?? ""),
    enabled: !!coachId,
    staleTime: 30_000,
    queryFn: () => listBankDocs(coachId!),
  });
}

/** Banque libre-service du coach de l'athlète (origines + variantes lisibles). */
export function useSelfServiceDocs(coachId: string | null | undefined) {
  return useQuery<DocFamily[]>({
    queryKey: docsKeys.selfService(coachId ?? ""),
    enabled: !!coachId,
    staleTime: 60_000,
    queryFn: () => listSelfServiceDocs(coachId!),
  });
}

export function useDoc(docId: string | undefined | null) {
  return useQuery<Doc | null>({
    queryKey: docsKeys.one(docId ?? ""),
    enabled: !!docId,
    staleTime: 60_000,
    queryFn: () => getDoc(docId!),
  });
}

/** Origine + variantes d'une famille (lisibles par l'utilisateur courant). */
export function useDocVariants(originId: string | undefined | null) {
  return useQuery<Doc[]>({
    queryKey: docsKeys.family(originId ?? ""),
    enabled: !!originId,
    staleTime: 60_000,
    queryFn: () => listFamilyDocs(originId!),
  });
}

/** Fiches par ids (chips d'un éditeur ou d'une séance). Les ids illisibles sont ignorés. */
export function useDocsByIds(ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  return useQuery<Record<string, Doc>>({
    queryKey: docsKeys.byIds(sorted.join(",")),
    enabled: sorted.length > 0,
    staleTime: 60_000,
    queryFn: () => getDocsByIds(sorted),
  });
}

/** Fiches d'un athlète : attribuées (toutes sources) + personnelles + ajouts. */
export function useAthleteDocs(athleteId: string | undefined | null) {
  return useQuery<AthleteDocs>({
    queryKey: docsKeys.athlete(athleteId ?? ""),
    enabled: !!athleteId,
    staleTime: 30_000,
    queryFn: () => getAthleteDocs(athleteId!),
  });
}

/** Coach : attributions d'une famille de fiches (qui l'a, qui l'a vue). */
export function useDocFamilyAssignments(originId: string | undefined | null) {
  return useQuery<DocAssignmentWithFamily[]>({
    queryKey: docsKeys.familyAssignments(originId ?? ""),
    enabled: !!originId,
    staleTime: 30_000,
    queryFn: () => listFamilyAssignments(originId!),
  });
}

/** URL signée (bucket privé). 1 h côté Storage, cache 50 min. */
export function useDocSignedUrl(filePath: string | null | undefined) {
  return useQuery<string | null>({
    queryKey: docsKeys.signedUrl(filePath ?? ""),
    enabled: !!filePath,
    staleTime: 50 * 60_000,
    gcTime: 55 * 60_000,
    queryFn: () => docSignedUrl(filePath!),
  });
}
