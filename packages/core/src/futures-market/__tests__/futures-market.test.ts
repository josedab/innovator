import { describe, it, expect, beforeEach } from "vitest";

import {
  createMarket,
  placeLimitOrder,
  placeMarketOrder,
  getMarketPrice,
  getOrderBook,
  getTraderPortfolio,
  getMarketAnalytics,
} from "../index.js";

describe("futures-market", () => {
  let marketId: string;

  beforeEach(() => {
    const market = createMarket("idea-1", "Test Idea", "Will this idea succeed?");
    marketId = market.id;
  });

  describe("createMarket", () => {
    it("creates a market with initial price of 0.5", () => {
      const market = createMarket("idea-2", "Another Idea", "Test");
      expect(market.status).toBe("open");
      expect(market.currentPrice).toBe(0.5);
      expect(market.totalVolume).toBe(0);
      expect(market.traderCount).toBe(0);
    });
  });

  describe("placeLimitOrder", () => {
    it("fills a YES order when price is favorable", () => {
      const order = placeLimitOrder(marketId, "trader-1", "yes", 10, 0.6);
      expect(order.status).toBe("filled");
      expect(order.filledQuantity).toBe(10);
    });

    it("rejects orders on non-existent markets", () => {
      expect(() => placeLimitOrder("fake-id", "trader-1", "yes", 10, 0.6)).toThrow();
    });

    it("rejects invalid quantities", () => {
      expect(() => placeLimitOrder(marketId, "trader-1", "yes", 0, 0.5)).toThrow();
    });

    it("rejects invalid prices", () => {
      expect(() => placeLimitOrder(marketId, "trader-1", "yes", 10, 1.5)).toThrow();
    });
  });

  describe("placeMarketOrder", () => {
    it("fills a market order immediately", () => {
      const order = placeMarketOrder(marketId, "trader-1", "yes", 5);
      expect(order.filledQuantity).toBe(5);
    });
  });

  describe("getMarketPrice", () => {
    it("returns initial price of 0.5", () => {
      expect(getMarketPrice(marketId)).toBe(0.5);
    });

    it("price moves up after YES buys", () => {
      placeMarketOrder(marketId, "trader-1", "yes", 50);
      expect(getMarketPrice(marketId)).toBeGreaterThan(0.5);
    });

    it("throws for non-existent market", () => {
      expect(() => getMarketPrice("fake")).toThrow();
    });
  });

  describe("getOrderBook", () => {
    it("returns market info and trades", () => {
      placeMarketOrder(marketId, "trader-1", "yes", 10);
      const book = getOrderBook(marketId);
      expect(book.market.id).toBe(marketId);
      expect(book.recentTrades.length).toBeGreaterThan(0);
    });
  });

  describe("getTraderPortfolio", () => {
    it("creates portfolio on first trade", () => {
      placeMarketOrder(marketId, "trader-new", "yes", 5, "New Trader");
      const portfolio = getTraderPortfolio("trader-new");
      expect(portfolio).toBeDefined();
      expect(portfolio!.displayName).toBe("New Trader");
      expect(portfolio!.balance).toBeLessThan(1000);
    });

    it("returns undefined for unknown trader", () => {
      expect(getTraderPortfolio("unknown")).toBeUndefined();
    });
  });

  describe("getMarketAnalytics", () => {
    it("returns analytics with price history", () => {
      placeMarketOrder(marketId, "trader-1", "yes", 10);
      const analytics = getMarketAnalytics(marketId);
      expect(analytics.marketId).toBe(marketId);
      expect(analytics.priceHistory.length).toBeGreaterThanOrEqual(1);
      expect(analytics.impliedProbability).toBeGreaterThan(0);
      expect(["bullish", "bearish", "neutral"]).toContain(analytics.sentiment);
    });
  });
});
