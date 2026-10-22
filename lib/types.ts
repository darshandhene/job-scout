export type SourceId =
  | "linkedin"
  | "jobright"
  | "himalayas"
  | "remoteok"
  | "jobicy"
  | "arbeitnow"
  | "remotive";

export type Sponsorship = "explicit" | "likely" | "none" | "unknown";

export type SponsorshipFilter = "any" | "required";

export type JobStatus = "new" | "saved" | "applied" | "dismissed";

export type Watch = {
  id: string;
  name: string;
  keywords: string;
  location: string;
  exclude: string;
  remoteOnly: boolean;
  sponsorship: SponsorshipFilter;
  newGradOnly: boolean;
  enabled: boolean;
  createdAt: string;
};

export type FeedJob = {
  id: string;
  source: SourceId;
  title: string;
  company: string;
  location: string;
  url: string;
  excerpt: string;
  tags: string[];
  salary: string | null;
  remote: boolean;
  sponsorship: Sponsorship;
  newGrad: boolean;
  postedAt: string;
};

export type SavedJob = FeedJob & {
  watchIds: string[];
  status: JobStatus;
  firstSeenAt: string;
};

export type Notice = {
  id: string;
  createdAt: string;
  read: boolean;
  title: string;
  body: string;
  jobIds: string[];
  webhook: "skipped" | "sent" | "failed";
  webhookError?: string;
};

export type Settings = {
  hour: number;
  minute: number;
  timezone: string;
  timezoneChosen: boolean;
  desktopNotifications: boolean;
  webhookUrl: string;
  lastRunAt: string | null;
  lastRunNewCount: number;
  lastRunError: string | null;
  lastScheduledOn: string | null;
  lastManualAt: string | null;
};

export type FeedSnapshot = {
  fetchedAt: string;
  jobs: FeedJob[];
  queryKey?: string;
};

export type FeedStatus = {
  fetchedAt: string | null;
  count: number;
  error: string | null;
};

export type Database = {
  version: 1;
  watches: Watch[];
  jobs: SavedJob[];
  notices: Notice[];
  settings: Settings;
  feedCache: Partial<Record<SourceId, FeedSnapshot>>;
  feedStatus: Partial<Record<SourceId, FeedStatus>>;
};

export type PublicSettings = {
  hour: number;
  minute: number;
  timezone: string;
  timezoneChosen: boolean;
  desktopNotifications: boolean;
  webhookUrl: string;
  lastRunAt: string | null;
  lastRunNewCount: number;
  lastRunError: string | null;
};

export type PublicFeed = FeedStatus & {
  source: SourceId;
  label: string;
  home: string;
};

export type PublicState = {
  watches: Watch[];
  jobs: SavedJob[];
  notices: Notice[];
  settings: PublicSettings;
  feeds: PublicFeed[];
  nextRunLabel: string;
};

export type WatchInput = {
  name?: string;
  keywords: string;
  location?: string;
  exclude?: string;
  remoteOnly?: boolean;
  sponsorship?: SponsorshipFilter;
  newGradOnly?: boolean;
  enabled?: boolean;
};
