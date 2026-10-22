import { randomUUID } from "node:crypto";
import { cachedJobs, refreshFeeds } from "@/lib/feeds";
import { matchingWatchIds } from "@/lib/match";
import { SOURCES } from "@/lib/sources";
import { withDb } from "@/lib/store";
import { cleanText, splitList } from "@/lib/text";
import { pruneJobs, retainsAfterWatchDelete } from "@/lib/status";
import { formatNextRun, isScheduleDue, localDateKey, nextRunDate } from "@/lib/time";
import type {
  Database,
  FeedJob,
  JobStatus,
  Notice,
  PublicState,
  SavedJob,
  Settings,
  Watch,
  WatchInput,
} from "@/lib/types";
import { assertPublicWebhook, deliverWebhook, webhookMessage } from "@/lib/webhook";

const PER_WATCH = 15;
const GLOBAL_CAP = 40;

export class ServiceError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function deriveName(keywords: string, name: string): string {
  if (name) return name;
  const phrases = splitList(keywords);
  if (phrases.length === 1) return phrases[0];
  return keywords.slice(0, 48);
}

function parseWatch(input: WatchInput, current?: Watch): Watch {
  const keywords = cleanText(input.keywords ?? current?.keywords, 240);
  if (keywords.length < 2) {
    throw new ServiceError(400, "Add at least one role, like “product designer”.");
  }
  const name = deriveName(keywords, cleanText(input.name ?? current?.name ?? "", 80));
  return {
    id: current?.id ?? randomUUID(),
    name,
    keywords,
    location: cleanText(input.location ?? current?.location ?? "", 160),
    exclude: cleanText(input.exclude ?? current?.exclude ?? "", 160),
    remoteOnly: input.remoteOnly ?? current?.remoteOnly ?? false,
    sponsorship: input.sponsorship ?? current?.sponsorship ?? "any",
    newGradOnly: input.newGradOnly ?? current?.newGradOnly ?? false,
    enabled: input.enabled ?? current?.enabled ?? true,
    createdAt: current?.createdAt ?? new Date().toISOString(),
  };
}

export function toPublicState(db: Database, now = new Date()): PublicState {
  const next = nextRunDate(db.settings, now);
  return {
    watches: db.watches,
    jobs: [...db.jobs].sort(
      (a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime(),
    ),
    notices: db.notices,
    settings: {
      hour: db.settings.hour,
      minute: db.settings.minute,
      timezone: db.settings.timezone,
      timezoneChosen: db.settings.timezoneChosen,
      desktopNotifications: db.settings.desktopNotifications,
      webhookUrl: db.settings.webhookUrl,
      lastRunAt: db.settings.lastRunAt,
      lastRunNewCount: db.settings.lastRunNewCount,
      lastRunError: db.settings.lastRunError,
    },
    feeds: SOURCES.map((source) => ({
      source: source.id,
      label: source.label,
      home: source.home,
      fetchedAt: db.feedStatus[source.id]?.fetchedAt ?? null,
      count: db.feedStatus[source.id]?.count ?? 0,
      error: db.feedStatus[source.id]?.error ?? null,
    })),
    nextRunLabel: formatNextRun(next, db.settings.timezone, now),
  };
}

function relink(db: Database, feeds: FeedJob[]) {
  const byId = new Map(feeds.map((job) => [job.id, job]));
  const byUrl = new Map(feeds.map((job) => [job.url.toLowerCase(), job]));
  const enabled = db.watches.filter((watch) => watch.enabled);
  const known = new Set(db.watches.map((watch) => watch.id));
  db.jobs = db.jobs.filter((job) => {
    job.watchIds = job.watchIds.filter((id) => known.has(id));
    const feed = byId.get(job.id) ?? byUrl.get(job.url.toLowerCase());
    if (feed) job.watchIds = matchingWatchIds(feed, enabled);
    if (job.status === "new" && job.watchIds.length === 0) return false;
    return true;
  });
}

function collectInserts(db: Database, feeds: FeedJob[]): FeedJob[] {
  const enabled = db.watches.filter((watch) => watch.enabled);
  if (enabled.length === 0) return [];
  const existingIds = new Set(db.jobs.map((job) => job.id));
  const existingUrls = new Set(db.jobs.map((job) => job.url.toLowerCase()));
  const perWatch = new Map<string, number>();
  const sorted = [...feeds].sort(
    (a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime(),
  );
  const picked: FeedJob[] = [];
  for (const job of sorted) {
    if (existingIds.has(job.id) || existingUrls.has(job.url.toLowerCase())) continue;
    const watchIds = matchingWatchIds(job, enabled);
    if (watchIds.length === 0) continue;
    if (watchIds.every((id) => (perWatch.get(id) ?? 0) >= PER_WATCH)) continue;
    if (picked.length >= GLOBAL_CAP) break;
    picked.push(job);
    for (const id of watchIds) perWatch.set(id, (perWatch.get(id) ?? 0) + 1);
  }
  return picked;
}

function prune(db: Database) {
  db.jobs = pruneJobs(db.jobs);
  db.notices = db.notices.slice(0, 60);
}

async function notify(db: Database, jobs: SavedJob[]) {
  if (jobs.length === 0) return;
  const title =
    jobs.length === 1 ? "1 new role matches your watches" : `${jobs.length} new roles match your watches`;
  const lines = jobs.slice(0, 6).map((job) => `${job.title} at ${job.company}`);
  const extra = jobs.length > 6 ? `\n+${jobs.length - 6} more` : "";
  const notice: Notice = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    read: false,
    title,
    body: `${lines.join("\n")}${extra}`,
    jobIds: jobs.map((job) => job.id),
    webhook: "skipped",
  };
  if (db.settings.webhookUrl) {
    const delivery = await deliverWebhook(db.settings.webhookUrl, webhookMessage(jobs), jobs);
    notice.webhook = delivery.ok ? "sent" : "failed";
    if (!delivery.ok) notice.webhookError = delivery.error;
  }
  db.notices.unshift(notice);
}

async function scan(
  db: Database,
  reason: "schedule" | "manual" | "watch",
): Promise<{ inserted: number }> {
  await refreshFeeds(db);
  const feeds = cachedJobs(db);
  const failures = SOURCES.map((source) => db.feedStatus[source.id]?.error).filter(Boolean);
  if (feeds.length === 0 && failures.length === SOURCES.length) {
    db.settings.lastRunError = "None of the job boards responded.";
    throw new ServiceError(502, "The job boards didn’t respond. Try again in a minute.");
  }
  relink(db, feeds);
  const fresh = collectInserts(db, feeds);
  const now = new Date().toISOString();
  const inserted: SavedJob[] = fresh.map((job) => ({
    ...job,
    watchIds: matchingWatchIds(
      job,
      db.watches.filter((watch) => watch.enabled),
    ),
    status: "new" as const,
    firstSeenAt: now,
  }));
  db.jobs.unshift(...inserted);
  await notify(db, inserted);
  db.settings.lastRunAt = now;
  db.settings.lastRunNewCount = inserted.length;
  db.settings.lastRunError = failures.length ? failures.join(" ") : null;
  if (reason === "schedule") {
    db.settings.lastScheduledOn = localDateKey(new Date(), db.settings.timezone || "UTC");
  }
  prune(db);
  return { inserted: inserted.length };
}

export async function getState(): Promise<PublicState> {
  return withDb(async (db) => toPublicState(db));
}

async function scanQuietly(db: Database): Promise<number> {
  try {
    return (await scan(db, "watch")).inserted;
  } catch (error) {
    if (!(error instanceof ServiceError)) throw error;
    db.settings.lastRunAt = new Date().toISOString();
    db.settings.lastRunError = error.message;
    return 0;
  }
}

export async function createWatch(input: WatchInput): Promise<{ state: PublicState; inserted: number }> {
  return withDb(async (db) => {
    db.watches.unshift(parseWatch(input));
    const inserted = await scanQuietly(db);
    return { state: toPublicState(db), inserted };
  });
}

export async function updateWatch(
  id: string,
  input: WatchInput,
): Promise<{ state: PublicState; inserted: number }> {
  return withDb(async (db) => {
    const current = db.watches.find((watch) => watch.id === id);
    if (!current) throw new ServiceError(404, "That watch is gone.");
    const next = parseWatch(
      { ...current, ...input, keywords: input.keywords ?? current.keywords },
      current,
    );
    Object.assign(current, next);
    const inserted = await scanQuietly(db);
    return { state: toPublicState(db), inserted };
  });
}

export async function deleteWatch(id: string): Promise<PublicState> {
  return withDb(async (db) => {
    const before = db.watches.length;
    db.watches = db.watches.filter((watch) => watch.id !== id);
    if (db.watches.length === before) throw new ServiceError(404, "That watch is gone.");
    db.jobs = db.jobs.filter((job) => {
      job.watchIds = job.watchIds.filter((watchId) => watchId !== id);
      return retainsAfterWatchDelete(job);
    });
    return toPublicState(db);
  });
}

export async function setJobStatus(id: string, status: JobStatus): Promise<PublicState> {
  return withDb(async (db) => {
    const job = db.jobs.find((item) => item.id === id);
    if (!job) throw new ServiceError(404, "That role is no longer on the desk.");
    job.status = status;
    return toPublicState(db);
  });
}

export async function markNoticesRead(ids?: string[]): Promise<PublicState> {
  return withDb(async (db) => {
    const wanted = ids ? new Set(ids) : null;
    for (const notice of db.notices) {
      if (!wanted || wanted.has(notice.id)) notice.read = true;
    }
    return toPublicState(db);
  });
}

export async function updateSettings(patch: Partial<Settings>): Promise<PublicState> {
  return withDb(async (db) => {
    if (patch.hour !== undefined) {
      if (!Number.isInteger(patch.hour) || patch.hour < 0 || patch.hour > 23) {
        throw new ServiceError(400, "Pick an hour from 12 AM to 11 PM.");
      }
      db.settings.hour = patch.hour;
    }
    if (patch.minute !== undefined) {
      if (![0, 15, 30, 45].includes(patch.minute)) {
        throw new ServiceError(400, "Pick :00, :15, :30, or :45.");
      }
      db.settings.minute = patch.minute;
    }
    if (patch.timezone !== undefined) {
      const timezone = cleanText(patch.timezone, 80);
      try {
        Intl.DateTimeFormat("en-US", { timeZone: timezone });
      } catch {
        throw new ServiceError(400, "That timezone isn’t recognized.");
      }
      db.settings.timezone = timezone;
      db.settings.timezoneChosen = true;
    }
    if (patch.desktopNotifications !== undefined) {
      db.settings.desktopNotifications = Boolean(patch.desktopNotifications);
    }
    if (patch.webhookUrl !== undefined) {
      const webhookUrl = cleanText(patch.webhookUrl, 400);
      if (webhookUrl) {
        try {
          assertPublicWebhook(webhookUrl);
        } catch (error) {
          throw new ServiceError(400, error instanceof Error ? error.message : "Invalid webhook.");
        }
      }
      db.settings.webhookUrl = webhookUrl;
    }
    return toPublicState(db);
  });
}

export async function runManualCheck(): Promise<{ state: PublicState; inserted: number }> {
  return withDb(async (db) => {
    const last = db.settings.lastManualAt ? new Date(db.settings.lastManualAt).getTime() : 0;
    if (Date.now() - last < 10_000) {
      throw new ServiceError(429, "Brief just checked. Give it a few seconds.");
    }
    db.settings.lastManualAt = new Date().toISOString();
    const { inserted } = await scan(db, "manual");
    return { state: toPublicState(db), inserted };
  });
}

export async function runScheduledCheck(): Promise<void> {
  await withDb(async (db) => {
    const now = new Date();
    if (!isScheduleDue(db.settings, now)) return;
    const today = localDateKey(now, db.settings.timezone || "UTC");
    if (!db.watches.some((watch) => watch.enabled)) {
      db.settings.lastScheduledOn = today;
      return;
    }
    try {
      await scan(db, "schedule");
    } catch (error) {
      db.settings.lastScheduledOn = today;
      db.settings.lastRunAt = now.toISOString();
      db.settings.lastRunError =
        error instanceof Error ? error.message : "The daily check failed.";
    }
  });
}

export async function testWebhook(url: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const target = cleanText(url, 400);
  if (!target) return { ok: false, error: "Paste a webhook URL first." };
  return deliverWebhook(
    target,
    "Brief is connected. You’ll get a note here when a new role matches.",
  );
}
