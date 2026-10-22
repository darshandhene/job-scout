"use client";

import { ExternalLink, Bookmark, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { sourceLabel } from "@/lib/sources";
import { relativeTime } from "@/lib/time";
import type { SavedJob, Watch } from "@/lib/types";
import { cn } from "@/lib/utils";

export function JobCard({
  job,
  watches,
  pending,
  onStatus,
  onSelectWatch,
}: {
  job: SavedJob;
  watches: Watch[];
  pending: boolean;
  onStatus: (status: SavedJob["status"]) => void;
  onSelectWatch: (watchId: string) => void;
}) {
  const matched = watches.filter((watch) => job.watchIds.includes(watch.id));
  const posted = relativeTime(job.postedAt);

  return (
    <article
      className={cn(
        "rounded-xl border bg-card p-4 sm:p-5",
        job.status === "new" && "border-l-4 border-l-primary",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {job.status === "new" && <Badge>New</Badge>}
        {job.status === "saved" && <Badge variant="secondary">Saved</Badge>}
        {job.status === "applied" && <Badge variant="secondary">Applied</Badge>}
        {job.status === "dismissed" && <Badge variant="outline">Dismissed</Badge>}
        {job.remote && <Badge variant="outline">Remote</Badge>}
        {job.newGrad && <Badge variant="outline">New grad</Badge>}
        {job.sponsorship === "explicit" && <Badge variant="outline">Sponsors</Badge>}
        {job.sponsorship === "likely" && <Badge variant="outline">Sponsorship likely</Badge>}
        <span>via {sourceLabel(job.source)}</span>
        {posted && <span>· {posted}</span>}
      </div>
      <h3 className="mt-2 font-heading text-2xl leading-tight text-foreground">{job.title}</h3>
      <p className="mt-1 text-sm">
        <span className="font-medium">{job.company || "Company not listed"}</span>
        <span className="text-muted-foreground"> · {job.location || "Location not listed"}</span>
      </p>
      {job.salary && <p className="mt-2 text-sm text-foreground">{job.salary}</p>}
      {job.excerpt && (
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{job.excerpt}</p>
      )}
      {matched.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Matches{" "}
          {matched.map((watch, index) => (
            <span key={watch.id}>
              {index > 0 && ", "}
              <button
                type="button"
                className="underline decoration-border underline-offset-4 hover:text-foreground"
                onClick={() => onSelectWatch(watch.id)}
              >
                {watch.name}
              </button>
            </span>
          ))}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={job.url}
          target="_blank"
          rel="noopener"
          className={cn(buttonVariants({ size: "lg" }), "h-9")}
        >
          Open role
          <ExternalLink data-icon="inline-end" />
        </a>
        {job.status !== "saved" ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-9 bg-card"
            disabled={pending}
            onClick={() => onStatus("saved")}
          >
            <Bookmark data-icon="inline-start" />
            Save
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-9 bg-card"
            disabled={pending}
            onClick={() => onStatus("new")}
          >
            <Bookmark data-icon="inline-start" />
            Saved
          </Button>
        )}
        {job.status !== "applied" ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-9 bg-card"
            disabled={pending}
            onClick={() => onStatus("applied")}
          >
            <Check data-icon="inline-start" />
            Applied
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-9 bg-card"
            disabled={pending}
            onClick={() => onStatus("new")}
          >
            <Check data-icon="inline-start" />
            Applied
          </Button>
        )}
        {job.status !== "dismissed" ? (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="h-9"
            disabled={pending}
            onClick={() => onStatus("dismissed")}
          >
            <X data-icon="inline-start" />
            Dismiss
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="h-9"
            disabled={pending}
            onClick={() => onStatus("new")}
          >
            Restore
          </Button>
        )}
      </div>
    </article>
  );
}
