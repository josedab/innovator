import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn().mockResolvedValue('{"category":"Tech","industry":"Software"}'),
  extractJson: vi.fn((raw: string) => raw),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import { extractJson, generateText } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import {
  anonymizeText,
  cancelTransaction,
  clearExchangeData,
  completeTransaction,
  createInquiry,
  createTransaction,
  generateOrgAlias,
  getListing,
  getListingInquiries,
  getMarketplaceStats,
  getOrgTransactions,
  publishListing,
  searchListings,
} from "../idea-exchange/index.js";

const sensitiveText =
  "John Smith from Acme Inc emailed jane@example.com on January 5, 2024 in New York about $5M at https://example.com with ref 12345, phone 555-123-4567, and IP 192.168.0.1.";

async function createListing(
  title: string,
  overrides: Parameters<typeof publishListing>[2] = {},
  orgName = `${title} Org`
) {
  return publishListing(
    { title, description: `${title} description`, tags: [title.toLowerCase(), "shared"] },
    orgName,
    {
      category: "Tech",
      industry: "Software",
      stage: "concept",
      licenseType: "single-use",
      priceUsd: 0,
      ...overrides,
    }
  );
}

describe("idea-exchange", () => {
  beforeEach(() => {
    clearExchangeData();
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.mocked(generateText).mockResolvedValue('{"category":"Tech","industry":"Software"}');
    vi.mocked(extractJson).mockImplementation((raw: string) => raw);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("anonymizeText", () => {
    it("leaves text unchanged for the none level", () => {
      expect(anonymizeText(sensitiveText, "none")).toBe(sensitiveText);
    });

    it("removes emails, urls, organizations, phones, and IPs at the light level", () => {
      const result = anonymizeText(sensitiveText, "light");

      expect(result).toContain("John Smith");
      expect(result).toContain("January 5, 2024");
      expect(result).toContain("$5M");
      expect(result).toContain("New York");
      expect(result).toContain("12345");
      expect(result).toContain("[Organization]");
      expect(result).toContain("[email]");
      expect(result).toContain("[url]");
      expect(result).toContain("[phone]");
      expect(result).toContain("[ip-address]");
    });

    it("also removes names and amounts at the moderate level", () => {
      const result = anonymizeText(sensitiveText, "moderate");

      expect(result).toContain("[Person]");
      expect(result).toContain("[amount]");
      expect(result).toContain("January 5, 2024");
      expect(result).not.toContain("John Smith");
      expect(result).not.toContain("New York");
      expect(result).toContain("12345");
    });

    it("also removes dates and cities at the heavy level", () => {
      const result = anonymizeText(sensitiveText, "heavy");

      expect(result).toContain("[date]");
      expect(result).toContain("[Person]");
      expect(result).not.toContain("New York");
      expect(result).toContain("12345");
    });

    it("also replaces long numeric identifiers at the full level", () => {
      const result = anonymizeText(sensitiveText, "full");

      expect(result).toContain("[number]");
      expect(result).not.toContain("12345");
    });
  });

  describe("generateOrgAlias", () => {
    it("generates a deterministic adjective-noun alias", () => {
      const first = generateOrgAlias("Acme Labs");
      const second = generateOrgAlias("Acme Labs");
      const other = generateOrgAlias("Different Org");

      expect(first).toBe(second);
      expect(first).toMatch(/^[A-Za-z]+ [A-Za-z]+$/);
      expect(other).not.toBe("");
    });
  });

  describe("publishListing", () => {
    it("requires a title and organization name", async () => {
      await expect(publishListing({ title: "", description: "desc" }, "Acme")).rejects.toThrow(
        "Idea title is required"
      );
      await expect(publishListing({ title: "Idea", description: "desc" }, "")).rejects.toThrow(
        "Organization name is required"
      );
    });

    it("auto-categorizes via the mocked LLM and applies anonymization", async () => {
      const controller = new AbortController();
      const listing = await publishListing(
        {
          title: "Acme Inc Expansion Plan",
          description: "Reach jane@example.com or visit https://example.com for more details.",
          tags: ["ai", "growth"],
        },
        "Acme Inc",
        { anonymizationLevel: "moderate", priceUsd: 99 },
        { model: "mock-model", signal: controller.signal }
      );

      expect(withRetry).toHaveBeenCalledTimes(1);
      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({ model: "mock-model", signal: controller.signal })
      );
      expect(extractJson).toHaveBeenCalledWith('{"category":"Tech","industry":"Software"}');
      expect(listing.category).toBe("Tech");
      expect(listing.industry).toBe("Software");
      expect(listing.title).toContain("[Organization]");
      expect(listing.description).toContain("[email]");
      expect(listing.description).toContain("[url]");
      expect(listing.publisherOrg).toBe(generateOrgAlias("Acme Inc"));
      expect(listing.publisherAlias).toBe(generateOrgAlias("Acme Inc"));
      expect(listing.priceUsd).toBe(99);
    });

    it("skips the LLM when category and industry are supplied and preserves the org for none anonymization", async () => {
      const listing = await publishListing(
        {
          title: "Internal Marketplace",
          description: "Share with partners",
          tags: ["marketplace"],
        },
        "Acme Inc",
        {
          anonymizationLevel: "none",
          category: "Operations",
          industry: "Retail",
          stage: "tested",
          licenseType: "exclusive",
        }
      );

      expect(generateText).not.toHaveBeenCalled();
      expect(listing.category).toBe("Operations");
      expect(listing.industry).toBe("Retail");
      expect(listing.publisherOrg).toBe("Acme Inc");
      expect(listing.publisherAlias).toBe(generateOrgAlias("Acme Inc"));
      expect(listing.stage).toBe("tested");
      expect(listing.licenseType).toBe("exclusive");
    });

    it("falls back to default category and industry when categorization fails", async () => {
      vi.mocked(generateText).mockRejectedValueOnce(new Error("upstream failure"));

      const listing = await publishListing(
        { title: "Fallback Listing", description: "No category" },
        "Fallback Org"
      );

      expect(listing.category).toBe("General");
      expect(listing.industry).toBe("Cross-industry");
    });
  });

  describe("searchListings / getListing", () => {
    it("filters by query, category, industry, stage, license type, score, price, and tags", async () => {
      const tech = await createListing("AI Assistant", {
        category: "Tech",
        industry: "Software",
        stage: "validated",
        licenseType: "multi-use",
        priceUsd: 200,
      });
      tech.validationScore = 0.92;
      tech.tags = ["automation", "support"];

      const healthcare = await createListing("Health Workflow", {
        category: "Health",
        industry: "Healthcare",
        stage: "concept",
        licenseType: "exclusive",
        priceUsd: 800,
      });
      healthcare.validationScore = 0.45;
      healthcare.tags = ["triage"];

      const result = searchListings({
        query: "assistant",
        category: "Tech",
        industry: "Software",
        stage: "validated",
        licenseType: "multi-use",
        minScore: 0.9,
        maxPrice: 250,
        tags: ["automation"],
      });

      expect(result.total).toBe(1);
      expect(result.results).toEqual([tech]);
    });

    it("supports all documented sorting modes and pagination", async () => {
      vi.useFakeTimers();

      vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
      const alpha = await createListing("Alpha", { priceUsd: 300 });
      alpha.validationScore = 0.5;

      vi.setSystemTime(new Date("2025-01-02T00:00:00Z"));
      const beta = await createListing("Beta", { priceUsd: 100 });
      beta.validationScore = 0.9;

      vi.setSystemTime(new Date("2025-01-03T00:00:00Z"));
      const gamma = await createListing("Gamma", { priceUsd: 200 });
      gamma.validationScore = 0.7;

      getListing(beta.id);
      getListing(beta.id);
      getListing(gamma.id);

      expect(searchListings({ sortBy: "price-asc" }).results.map((listing) => listing.id)).toEqual([
        beta.id,
        gamma.id,
        alpha.id,
      ]);
      expect(searchListings({ sortBy: "price-desc" }).results.map((listing) => listing.id)).toEqual(
        [alpha.id, gamma.id, beta.id]
      );
      expect(searchListings({ sortBy: "newest" }).results.map((listing) => listing.id)).toEqual([
        gamma.id,
        beta.id,
        alpha.id,
      ]);
      expect(searchListings({ sortBy: "score" }).results.map((listing) => listing.id)).toEqual([
        beta.id,
        gamma.id,
        alpha.id,
      ]);
      expect(searchListings({ sortBy: "relevance" }).results.map((listing) => listing.id)).toEqual([
        beta.id,
        gamma.id,
        alpha.id,
      ]);
      expect(
        searchListings({ sortBy: "price-asc", limit: 1, offset: 1 }).results.map(
          (listing) => listing.id
        )
      ).toEqual([gamma.id]);
    });

    it("increments views when a listing is retrieved and returns undefined for unknown ids", async () => {
      const listing = await createListing("Viewed Listing");

      expect(getListing(listing.id)?.views).toBe(1);
      expect(getListing(listing.id)?.views).toBe(2);
      expect(getListing("missing")).toBeUndefined();
    });
  });

  describe("transactions", () => {
    it("creates escrow transactions for paid listings and completed transactions for free listings", async () => {
      const paid = await createListing("Paid", { priceUsd: 250, licenseType: "exclusive" });
      const free = await createListing("Free", { priceUsd: 0, licenseType: "open" });

      const escrowTx = createTransaction(paid.id, "Buyer Org");
      const freeTx = createTransaction(free.id, "Open Buyer");

      expect(escrowTx).toEqual(
        expect.objectContaining({
          listingId: paid.id,
          buyerOrg: "Buyer Org",
          sellerOrg: paid.publisherOrg,
          licenseType: "exclusive",
          priceUsd: 250,
          status: "escrow",
          completedAt: undefined,
        })
      );
      expect(freeTx).toEqual(
        expect.objectContaining({
          listingId: free.id,
          status: "completed",
          completedAt: expect.any(String),
        })
      );
    });

    it("throws when creating a transaction for a missing listing", () => {
      expect(() => createTransaction("missing", "Buyer Org")).toThrow("Listing not found: missing");
    });

    it("completes escrow and pending transactions, and rejects invalid transitions", async () => {
      const listing = await createListing("Paid", { priceUsd: 250 });
      const escrowTx = createTransaction(listing.id, "Buyer Org");
      const pendingTx = createTransaction(listing.id, "Buyer Two");
      pendingTx.status = "pending";

      expect(completeTransaction(escrowTx.id)).toEqual(
        expect.objectContaining({ status: "completed", completedAt: expect.any(String) })
      );
      expect(completeTransaction(pendingTx.id).status).toBe("completed");
      expect(() => completeTransaction(escrowTx.id)).toThrow(
        "Cannot complete transaction in completed status"
      );
      expect(() => completeTransaction("missing")).toThrow("Transaction not found: missing");
    });

    it("cancels non-completed transactions and rejects cancelling completed ones", async () => {
      const listing = await createListing("Paid", { priceUsd: 250 });
      const tx = createTransaction(listing.id, "Buyer Org");

      expect(cancelTransaction(tx.id).status).toBe("cancelled");

      const freeListing = await createListing("Free", { priceUsd: 0 });
      const completed = createTransaction(freeListing.id, "Another Buyer");

      expect(() => cancelTransaction(completed.id)).toThrow(
        "Cannot cancel a completed transaction"
      );
      expect(() => cancelTransaction("missing")).toThrow("Transaction not found: missing");
    });
  });

  describe("inquiries / organization views / stats / clearExchangeData", () => {
    it("creates inquiries, truncates messages, and increments inquiry counts", async () => {
      const listing = await createListing("Inquiry Listing");
      const inquiry = createInquiry(listing.id, "Buyer Org", "x".repeat(2100));

      expect(inquiry).toEqual(
        expect.objectContaining({
          listingId: listing.id,
          fromOrg: generateOrgAlias("Buyer Org"),
          fromAlias: generateOrgAlias("Buyer Org"),
          status: "open",
        })
      );
      expect(inquiry.message).toHaveLength(2000);
      expect(listing.inquiries).toBe(1);
    });

    it("filters inquiries by listing id and transactions by buyer or seller organization", async () => {
      const listingOne = await createListing("Listing One", { priceUsd: 100 }, "Seller One");
      const listingTwo = await createListing(
        "Listing Two",
        { priceUsd: 0, anonymizationLevel: "none" },
        "Seller Two"
      );

      const inquiryOne = createInquiry(listingOne.id, "Buyer Org", "Interested");
      createInquiry(listingTwo.id, "Buyer Org", "Also interested");

      const txOne = createTransaction(listingOne.id, "Buyer Org");
      const txTwo = createTransaction(listingTwo.id, "Another Buyer");

      expect(getListingInquiries(listingOne.id)).toEqual([inquiryOne]);
      expect(getOrgTransactions("Buyer Org")).toEqual([txOne]);
      expect(getOrgTransactions("Seller Two")).toEqual([txTwo]);
    });

    it("aggregates marketplace statistics and resets all state", async () => {
      const techA = await createListing("Tech A", { category: "Tech", priceUsd: 100 }, "Seller A");
      await createListing("Tech B", { category: "Tech", priceUsd: 200 }, "Seller B");
      const ops = await createListing("Ops", { category: "Ops", priceUsd: 0 }, "Seller C");

      completeTransaction(createTransaction(techA.id, "Buyer A").id);
      createTransaction(ops.id, "Buyer B");

      const stats = getMarketplaceStats();

      expect(stats).toEqual({
        totalListings: 3,
        totalTransactions: 2,
        totalRevenue: 100,
        avgPrice: 100,
        topCategories: [
          { category: "Tech", count: 2 },
          { category: "Ops", count: 1 },
        ],
      });

      clearExchangeData();
      expect(searchListings().total).toBe(0);
      expect(getMarketplaceStats()).toEqual({
        totalListings: 0,
        totalTransactions: 0,
        totalRevenue: 0,
        avgPrice: 0,
        topCategories: [],
      });
    });

    it("throws when creating an inquiry for a missing listing", () => {
      expect(() => createInquiry("missing", "Buyer Org", "Interested")).toThrow(
        "Listing not found: missing"
      );
    });
  });
});
