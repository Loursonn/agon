import type { ClusterConfig } from "./types"

/** Cluster reps as "(5+4+3 + 15s)". Handles the legacy reps_per_cluster format. */
export function formatClusterReps(cluster: ClusterConfig): string {
  const repsArr: number[] = Array.isArray(cluster.reps)
    ? cluster.reps
    : Array(cluster.nb_clusters).fill((cluster as unknown as { reps_per_cluster?: number }).reps_per_cluster ?? 5)
  return `(${repsArr.join("+")} + ${cluster.recup_sec}s)`
}
