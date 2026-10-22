import type { JobStatus, SavedJob } from "@/lib/types";

export function isPinnedStatus(status: JobStatus) {
  return status === "saved" || status === "applied";
}

export function pruneJobs(jobs: SavedJob[], keep = 200): SavedJob[] {
  const pinned = jobs.filter((job) => isPinnedStatus(job.status));
  const rest = jobs
    .filter((job) => !isPinnedStatus(job.status))
    .sort((a, b) => new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime())
    .slice(0, keep);
  return [...pinned, ...rest];
}

export function retainsAfterWatchDelete(job: Pick<SavedJob, "status" | "watchIds">) {
  return isPinnedStatus(job.status) || job.watchIds.length > 0;
}
