import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPinnedStatus, pruneJobs, retainsAfterWatchDelete } from "./status";
import type { SavedJob } from "./types";

function job(status: SavedJob["status"], extras: Partial<SavedJob> = {}): SavedJob {
  return {
    id: extras.id ?? status,
    source: "remotive",
    title: "Data Analyst",
    company: "Northwind",
    location: "Remote",
    url: `https://example.com/${extras.id ?? status}`,
    excerpt: "",
    tags: [],
    salary: null,
    remote: true,
    sponsorship: "unknown",
    newGrad: false,
    postedAt: "2026-10-20T00:00:00.000Z",
    watchIds: extras.watchIds ?? ["watch-1"],
    status,
    firstSeenAt: extras.firstSeenAt ?? "2026-10-20T00:00:00.000Z",
  };
}

describe("applied roles", () => {
  it("keeps applied roles on the desk like saved ones", () => {
    assert.equal(isPinnedStatus("applied"), true);
    assert.equal(isPinnedStatus("saved"), true);
    assert.equal(isPinnedStatus("new"), false);
    assert.equal(isPinnedStatus("dismissed"), false);
  });

  it("does not trim applied roles when the desk is pruned", () => {
    const jobs = [job("applied", { id: "applied-1" }), job("new", { id: "new-1" })];
    const pruned = pruneJobs(jobs, 1);
    assert.deepEqual(
      pruned.map((item) => item.id).sort(),
      ["applied-1", "new-1"],
    );
  });

  it("keeps applied roles after the watch that found them is deleted", () => {
    const applied = job("applied", { watchIds: [] });
    const leftover = job("new", { watchIds: [] });
    assert.equal(retainsAfterWatchDelete(applied), true);
    assert.equal(retainsAfterWatchDelete(leftover), false);
  });
});
