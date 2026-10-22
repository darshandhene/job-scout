"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Pause, Pencil, Play, Plus, Settings, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { JobCard } from "@/components/job-card";
import { NoticesSheet } from "@/components/notices-sheet";
import { SettingsSheet } from "@/components/settings-sheet";
import { WatchForm, type WatchDraft } from "@/components/watch-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SOURCES } from "@/lib/sources";
import { formatBoardsRead } from "@/lib/time";
import type { JobStatus, PublicSettings, PublicState, Watch } from "@/lib/types";
import { cn } from "@/lib/utils";

type StatusFilter = "new" | "saved" | "applied" | "all" | "dismissed";

type StateResponse = { state: PublicState; inserted?: number };

class ApiError extends Error {}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new ApiError(data.error || "Something went wrong.");
  return data;
}

export function Desk() {
  const [state, setState] = useState<PublicState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState("all");
  const [filter, setFilter] = useState<StatusFilter>("new");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Watch | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Watch | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const primed = useRef(false);
  const seenNotices = useRef(new Set<string>());
  const timezoneSent = useRef(false);
  const generation = useRef(0);

  const request = useCallback(async (url: string, init?: RequestInit, whenEmpty = false) => {
    const ticket = ++generation.current;
    const result = await api<StateResponse>(url, init);
    if (ticket !== generation.current) return result;
    setState(result.state);
    setLoadError(null);
    if (whenEmpty && !result.inserted && result.state.settings.lastRunError) {
      toast.error("Couldn’t read the boards", {
        description: result.state.settings.lastRunError,
      });
    } else if (whenEmpty && !result.inserted) {
      toast("No new matches", {
        description: "Brief keeps the newest postings and will look again on the daily pass.",
      });
    }
    return result;
  }, []);

  useEffect(() => {
    request("/api/state")
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : "Brief couldn’t open your desk.");
      })
      .finally(() => setLoading(false));
  }, [request]);

  useEffect(() => {
    if (!state || state.settings.timezoneChosen || timezoneSent.current) return;
    timezoneSent.current = true;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const ticket = ++generation.current;
    api<StateResponse>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify({ timezone }),
    })
      .then((result) => {
        setState((current) => {
          if (!current || ticket !== generation.current) return current;
          return {
            ...current,
            settings: result.state.settings,
            nextRunLabel: result.state.nextRunLabel,
          };
        });
      })
      .catch(() => {
        timezoneSent.current = false;
      });
  }, [state]);

  useEffect(() => {
    const pull = () => {
      if (document.visibilityState !== "visible") return;
      request("/api/state").catch(() => undefined);
    };
    const interval = window.setInterval(pull, 30000);
    document.addEventListener("visibilitychange", pull);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", pull);
    };
  }, [request]);

  useEffect(() => {
    if (!state) return;
    if (!primed.current) {
      for (const notice of state.notices) seenNotices.current.add(notice.id);
      primed.current = true;
      return;
    }
    for (const notice of state.notices) {
      if (seenNotices.current.has(notice.id)) continue;
      seenNotices.current.add(notice.id);
      toast(notice.title, { description: notice.body });
      if (
        state.settings.desktopNotifications &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        new Notification(notice.title, { body: notice.body, tag: notice.id });
      }
    }
  }, [state]);

  async function createWatch(draft: WatchDraft) {
    setBusy("save");
    try {
      await request("/api/watches", { method: "POST", body: JSON.stringify(draft) }, true);
      setCreateOpen(false);
      setFilter("new");
      setSelected("all");
    } finally {
      setBusy(null);
    }
  }

  async function saveWatch(draft: WatchDraft) {
    if (!editing) return;
    setBusy("save");
    try {
      await request(`/api/watches/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify(draft),
      });
      setEditing(null);
    } finally {
      setBusy(null);
    }
  }

  async function toggleWatch(watch: Watch) {
    setBusy(watch.id);
    try {
      await request(`/api/watches/${watch.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !watch.enabled }),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn’t update that watch.");
    } finally {
      setBusy(null);
    }
  }

  async function removeWatch() {
    if (!deleteTarget) return;
    setBusy("delete");
    try {
      await request(`/api/watches/${deleteTarget.id}`, { method: "DELETE" });
      setSelected("all");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn’t delete that watch.");
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(jobId: string, status: JobStatus) {
    setBusy(jobId);
    try {
      await request(`/api/jobs/${encodeURIComponent(jobId)}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn’t update that role.");
    } finally {
      setBusy(null);
    }
  }

  async function checkNow() {
    setBusy("check");
    try {
      await request("/api/check", { method: "POST" }, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The boards didn’t respond.");
    } finally {
      setBusy(null);
    }
  }

  async function saveSettings(patch: Partial<PublicSettings>) {
    await request("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }

  async function markAllRead() {
    try {
      await request("/api/notices", {
        method: "POST",
        body: JSON.stringify({}),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn’t mark those as read.");
    }
  }

  if (loading) return <DeskSkeleton />;

  if (!state) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-6">
        <p className="font-heading text-5xl">Brief</p>
        <p className="text-sm text-muted-foreground">{loadError ?? "Brief couldn’t open your desk."}</p>
        <Button
          type="button"
          className="h-10 self-start"
          onClick={() => {
            setLoading(true);
            request("/api/state")
              .catch((error: unknown) => {
                setLoadError(error instanceof Error ? error.message : "Brief couldn’t open your desk.");
              })
              .finally(() => setLoading(false));
          }}
        >
          Try again
        </Button>
      </main>
    );
  }

  const unread = state.notices.filter((notice) => !notice.read).length;
  const activeWatch = state.watches.find((watch) => watch.id === selected) ?? null;
  const problems = [...new Set(state.feeds.map((feed) => feed.error).filter(Boolean))];
  const newestRead = state.feeds
    .map((feed) => feed.fetchedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const visible = state.jobs.filter((job) => {
    if (selected !== "all" && !job.watchIds.includes(selected)) return false;
    if (filter === "all") return job.status !== "dismissed";
    return job.status === filter;
  });
  const counts = {
    new: countFor(state, selected, "new"),
    saved: countFor(state, selected, "saved"),
    applied: countFor(state, selected, "applied"),
    all: state.jobs.filter((job) => {
      if (job.status === "dismissed") return false;
      return selected === "all" || job.watchIds.includes(selected);
    }).length,
    dismissed: countFor(state, selected, "dismissed"),
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b-2 border-foreground bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-4 py-4 md:px-6 md:py-5">
          <div>
            <p className="text-[0.7rem] tracking-[0.22em] text-muted-foreground uppercase">Daily job watch</p>
            <h1 className="font-heading text-4xl leading-none md:text-5xl">Brief</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-1 hidden text-right sm:block">
              <p className="text-sm">{state.nextRunLabel}</p>
              <p className="text-xs text-muted-foreground">{formatBoardsRead(newestRead ?? null)}</p>
            </div>
            <Button type="button" size="lg" className="h-10" disabled={busy === "check"} onClick={() => void checkNow()}>
              {busy === "check" ? "Reading…" : "Check the boards"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              className="relative bg-card"
              aria-label={unread ? `${unread} unread notifications` : "Notifications"}
              onClick={() => setNoticesOpen(true)}
            >
              <Bell />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
                  {unread}
                </span>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              className="bg-card"
              aria-label="Delivery settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-6 md:grid-cols-[16rem_1fr] md:px-6 md:py-8">
        <aside className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs tracking-[0.18em] text-muted-foreground uppercase">Watches</h2>
            {state.watches.length > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus data-icon="inline-start" />
                New
              </Button>
            )}
          </div>
          {state.watches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No watches yet. Tell Brief what you’re looking for.</p>
          ) : (
            <>
              <div className="flex gap-2 overflow-x-auto pb-1 md:hidden">
                <WatchChip
                  label="All"
                  count={countFor(state, "all", "new")}
                  active={selected === "all"}
                  onClick={() => setSelected("all")}
                />
                {state.watches.map((watch) => (
                  <WatchChip
                    key={watch.id}
                    label={watch.name}
                    count={countFor(state, watch.id, "new")}
                    paused={!watch.enabled}
                    active={selected === watch.id}
                    onClick={() => setSelected(watch.id)}
                  />
                ))}
              </div>
              <div className="hidden flex-col gap-1 md:flex">
                <WatchRow
                  label="All roles"
                  count={countFor(state, "all", "new")}
                  active={selected === "all"}
                  onClick={() => setSelected("all")}
                />
                {state.watches.map((watch) => (
                  <WatchRow
                    key={watch.id}
                    label={watch.name}
                    detail={watchDetail(watch)}
                    count={countFor(state, watch.id, "new")}
                    paused={!watch.enabled}
                    active={selected === watch.id}
                    onClick={() => setSelected(watch.id)}
                  />
                ))}
              </div>
            </>
          )}
        </aside>

        <section className="min-w-0" aria-live="polite">
          {problems.length > 0 && (
            <p className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {problems.join(" ")} Showing whatever could be read.
            </p>
          )}

          {state.watches.length === 0 ? (
            <div className="mx-auto max-w-xl rounded-2xl border bg-card px-5 py-6 sm:px-7 sm:py-8">
              <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">Start a watch</p>
              <h2 className="mt-2 font-heading text-4xl leading-tight">What should Brief look for?</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Name the roles you want. Every day, Brief reads the newest postings and notifies you when one fits.
                You can limit a watch by location, visa sponsorship, and entry-level or class-of-2027 roles.
              </p>
              <div className="mt-6">
                <WatchForm
                  showSuggestions
                  submitLabel="Watch for these roles"
                  pending={busy === "save"}
                  onSubmit={createWatch}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="font-heading text-3xl leading-tight">
                    {activeWatch ? activeWatch.name : "New roles"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground sm:hidden">
                    {state.nextRunLabel}. {formatBoardsRead(newestRead ?? null)}
                  </p>
                  {activeWatch && (
                    <p className="mt-1 text-sm text-muted-foreground">{watchDetail(activeWatch)}</p>
                  )}
                </div>
                {activeWatch && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 bg-card"
                      disabled={busy === activeWatch.id}
                      onClick={() => void toggleWatch(activeWatch)}
                    >
                      {activeWatch.enabled ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
                      {activeWatch.enabled ? "Pause" : "Resume"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 bg-card"
                      onClick={() => setEditing(activeWatch)}
                    >
                      <Pencil data-icon="inline-start" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      className="h-8"
                      onClick={() => setDeleteTarget(activeWatch)}
                    >
                      <Trash2 data-icon="inline-start" />
                      Delete
                    </Button>
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {(
                  [
                    ["new", `New ${counts.new}`],
                    ["saved", `Saved ${counts.saved}`],
                    ["applied", `Applied ${counts.applied}`],
                    ["all", `All ${counts.all}`],
                    ["dismissed", `Dismissed ${counts.dismissed}`],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={filter === value ? "default" : "outline"}
                    className={cn("h-8", filter !== value && "bg-card")}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>

              {visible.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-dashed bg-card px-5 py-12 text-center">
                  <p className="font-heading text-2xl">Nothing in this pile</p>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    {filter === "new"
                      ? `No unseen matches. ${state.nextRunLabel}, Brief reads the boards again.`
                      : filter === "applied"
                        ? "Roles you mark applied will collect here."
                        : "Roles you save or dismiss will collect here."}
                  </p>
                </div>
              ) : (
                <div className="mt-5 flex flex-col gap-3">
                  {visible.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      watches={state.watches}
                      pending={busy === job.id}
                      onStatus={(status) => void setStatus(job.id, status)}
                      onSelectWatch={setSelected}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pt-4 pb-10 text-sm leading-6 text-muted-foreground md:px-6">
        <p>
          Listings come from{" "}
          {SOURCES.map((source, index) => (
            <span key={source.id}>
              {index > 0 && (index === SOURCES.length - 1 ? ", and " : ", ")}
              <a href={source.home} target="_blank" rel="noopener" className="underline underline-offset-4">
                {source.label}
              </a>
            </span>
          ))}
          . Open a role to view the original posting. LinkedIn is searched for the titles you save. Jobright comes from
          the daily new-grad and H-1B lists they publish. Brief reads each board a few times a day at most, and the
          daily notification runs while this app is open — if it was asleep, it catches up next time it starts.
        </p>
      </footer>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">New watch</DialogTitle>
            <DialogDescription>Brief compares fresh postings with this every day.</DialogDescription>
          </DialogHeader>
          <WatchForm
            showSuggestions
            submitLabel="Start watching"
            pending={busy === "save"}
            onSubmit={createWatch}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">Edit watch</DialogTitle>
            <DialogDescription>Changes apply to the next pass over the boards.</DialogDescription>
          </DialogHeader>
          {editing && (
            <WatchForm
              key={editing.id}
              initial={editing}
              submitLabel="Save watch"
              pending={busy === "save"}
              onSubmit={saveWatch}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>
              Brief will stop looking for these roles. Saved jobs stay on the desk.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              Keep it
            </Button>
            <Button type="button" variant="destructive" disabled={busy === "delete"} onClick={() => void removeWatch()}>
              Delete watch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={state.settings}
        nextRunLabel={state.nextRunLabel}
        onSave={saveSettings}
      />
      <NoticesSheet
        open={noticesOpen}
        onOpenChange={setNoticesOpen}
        notices={state.notices}
        onMarkAll={() => void markAllRead()}
      />
    </div>
  );
}

function countFor(state: PublicState, watchId: string, status: JobStatus) {
  return state.jobs.filter((job) => {
    if (job.status !== status) return false;
    return watchId === "all" || job.watchIds.includes(watchId);
  }).length;
}

function watchDetail(watch: Watch) {
  const bits = [watch.keywords];
  if (watch.location) bits.push(watch.location);
  if (watch.remoteOnly) bits.push("remote only");
  if (watch.sponsorship === "required") bits.push("visa sponsorship");
  if (watch.newGradOnly) bits.push("entry level / 2027");
  if (!watch.enabled) bits.push("paused");
  return bits.join(" · ");
}

function WatchChip({
  label,
  count,
  active,
  paused,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  paused?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-sm",
        active ? "border-foreground bg-foreground text-background" : "bg-card",
      )}
    >
      <span className="max-w-40 truncate">{label}</span>
      {paused && <span className="text-xs opacity-70">Paused</span>}
      {count > 0 && <Badge variant={active ? "secondary" : "default"}>{count}</Badge>}
    </button>
  );
}

function WatchRow({
  label,
  detail,
  count,
  active,
  paused,
  onClick,
}: {
  label: string;
  detail?: string;
  count: number;
  active: boolean;
  paused?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-2 text-left",
        active ? "bg-foreground text-background" : "hover:bg-card",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{label}</span>
        {count > 0 && <Badge variant={active ? "secondary" : "default"}>{count}</Badge>}
      </span>
      {(detail || paused) && (
        <span className={cn("mt-0.5 block truncate text-xs", active ? "text-background/75" : "text-muted-foreground")}>
          {paused ? "Paused · " : ""}
          {detail}
        </span>
      )}
    </button>
  );
}

function DeskSkeleton() {
  return (
    <div className="min-h-screen">
      <header className="border-b-2 border-foreground">
        <div className="mx-auto flex max-w-6xl items-end justify-between px-4 py-5 md:px-6">
          <div>
            <p className="text-[0.7rem] tracking-[0.22em] text-muted-foreground uppercase">Daily job watch</p>
            <h1 className="font-heading text-4xl md:text-5xl">Brief</h1>
          </div>
          <p className="text-sm text-muted-foreground">Opening your desk…</p>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-8 md:px-6">
        <div className="h-28 animate-pulse rounded-2xl bg-card" />
        <div className="h-40 animate-pulse rounded-2xl bg-card" />
      </div>
    </div>
  );
}
