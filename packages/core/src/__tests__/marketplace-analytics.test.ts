import { beforeEach, describe, expect, it } from "vitest";
import {
  addPackVersion,
  clearCreatorData,
  getCreatorStats,
  getPackVersions,
  listSubmissions,
  reviewSubmission,
  submitPack,
  updateCreatorStats,
} from "../marketplace/creator-analytics.js";

describe("marketplace/creator-analytics", () => {
  beforeEach(() => {
    clearCreatorData();
  });

  it("tracks pack submissions and review state", () => {
    const submission = submitPack("pack-1", "creator-1");
    expect(submission.status).toBe("pending");

    const reviewed = reviewSubmission(submission.id, "approved", "Looks good");
    expect(reviewed).toMatchObject({ status: "approved", reviewNotes: "Looks good" });
    expect(listSubmissions({ status: "approved" })).toHaveLength(1);
  });

  it("maintains creator stats across submissions and usage updates", () => {
    submitPack("pack-1", "creator-1");
    submitPack("pack-2", "creator-1");

    const stats = updateCreatorStats("creator-1", 150, 299.5);
    expect(stats.totalPacks).toBe(2);
    expect(stats.totalDownloads).toBe(150);
    expect(stats.totalRevenue).toBe(299.5);
    expect(getCreatorStats("creator-1")?.topPack).toBeDefined();
  });

  it("stores version history per pack", () => {
    addPackVersion("pack-1", "1.0.0", "Initial release");
    addPackVersion("pack-1", "1.1.0", "Added new workflows");

    const versions = getPackVersions("pack-1");
    expect(versions).toHaveLength(2);
    expect(versions.map((version) => version.version)).toContain("1.0.0");
    expect(versions.map((version) => version.version)).toContain("1.1.0");
  });

  it("filters submissions by creator", () => {
    submitPack("pack-1", "creator-1");
    submitPack("pack-2", "creator-2");

    expect(listSubmissions({ creatorId: "creator-1" })).toHaveLength(1);
    expect(listSubmissions({ creatorId: "creator-2" })).toHaveLength(1);
  });
});
