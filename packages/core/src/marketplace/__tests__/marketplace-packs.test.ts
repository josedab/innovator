import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({ CopilotClient: vi.fn() }));
import {
  DOMAIN_PACKS,
  clearCommunityData,
  clearInstalledPacks,
  getDomainPack,
  getDomainPacksByTag,
  getInstalledPacks,
  getPackAverageRating,
  getPackReviews,
  getPopularPacks,
  installDomainPack,
  listDomainPacks,
  searchPacks,
  submitReview,
  uninstallDomainPack,
} from "../index.js";

describe("marketplace domain packs", () => {
  beforeEach(() => {
    clearInstalledPacks();
    clearCommunityData();
  });

  it("lists all first-party domain packs", () => {
    const packs = listDomainPacks();

    expect(packs).toHaveLength(5);
    expect(DOMAIN_PACKS).toHaveLength(5);
    expect(packs.map((pack) => pack.id)).toEqual([
      "healthcare",
      "fintech",
      "saas",
      "climate",
      "education",
    ]);
  });

  it("gets a pack by id and filters by tag", () => {
    const healthcare = getDomainPack("healthcare");
    const telehealthPacks = getDomainPacksByTag("Telehealth");

    expect(healthcare).toBeDefined();
    expect(healthcare?.angles.map((angle) => angle.id)).toEqual([
      "patient-outcome",
      "clinical-workflow",
      "regulatory-compliance",
      "telehealth-innovation",
      "health-equity",
    ]);
    expect(telehealthPacks.map((pack) => pack.id)).toEqual(["healthcare"]);
  });

  it("installs and uninstalls domain packs without duplicates", () => {
    expect(installDomainPack("healthcare")).toEqual(["healthcare"]);
    expect(installDomainPack("fintech")).toEqual(["healthcare", "fintech"]);
    expect(installDomainPack("healthcare")).toEqual(["healthcare", "fintech"]);
    expect(getInstalledPacks()).toEqual(["healthcare", "fintech"]);

    expect(uninstallDomainPack("healthcare")).toBe(true);
    expect(getInstalledPacks()).toEqual(["fintech"]);
    expect(uninstallDomainPack("healthcare")).toBe(false);
  });
});

describe("marketplace community packs", () => {
  beforeEach(() => {
    clearInstalledPacks();
    clearCommunityData();
  });

  it("submits reviews and calculates average ratings", () => {
    submitReview({
      packId: "healthcare",
      userId: "user-1",
      rating: 4,
      title: "Practical pack",
      comment: "Helpful for patient-centered idea generation.",
    });
    submitReview({
      packId: "healthcare",
      userId: "user-2",
      rating: 5,
      title: "Excellent",
      comment: "Strong prompts and useful scoring guidance.",
    });

    const reviews = getPackReviews("healthcare");

    expect(reviews).toHaveLength(2);
    expect(reviews[0].packId).toBe("healthcare");
    expect(getPackAverageRating("healthcare")).toBe(4.5);
  });

  it("searches domain packs using full text", () => {
    const results = searchPacks("telehealth remote care");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].packId).toBe("healthcare");
    expect(results[0].domain).toBe("healthcare");
  });

  it("returns popular packs sorted by install count", () => {
    installDomainPack("healthcare");
    installDomainPack("fintech");
    uninstallDomainPack("healthcare");
    installDomainPack("healthcare");

    submitReview({
      packId: "healthcare",
      userId: "user-1",
      rating: 5,
      title: "Top pack",
      comment: "The healthcare angles are especially well structured.",
    });

    const popular = getPopularPacks(2);

    expect(popular).toHaveLength(2);
    expect(popular[0].packId).toBe("healthcare");
    expect(popular[0].installCount).toBe(2);
    expect(popular[0].avgRating).toBe(5);
    expect(popular[1].packId).toBe("fintech");
    expect(popular[1].installCount).toBe(1);
  });
});
