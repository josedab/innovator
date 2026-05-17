/**
 * @module futures-market
 *
 * Idea Futures Market — prediction market engine with LMSR automated
 * market maker, continuous double auction order book, trader portfolios,
 * and analytics. All state is in-memory; persistence can be added via
 * a storage adapter.
 */

import { randomUUID } from "node:crypto";
import type {
  Market,
  Order,
  Trade,
  TraderPortfolio,
  MarketAnalytics,
  MarketConfig,
} from "./types.js";
import { MarketSchema, OrderSchema, TradeSchema, MarketAnalyticsSchema } from "./types.js";

export * from "./types.js";

// ---- In-Memory State ----

const markets = new Map<string, Market>();
const orders = new Map<string, Order[]>();
const trades = new Map<string, Trade[]>();
const portfolios = new Map<string, TraderPortfolio>();
const priceHistory = new Map<string, Array<{ timestamp: string; price: number; volume: number }>>();

const DEFAULT_CONFIG: Required<MarketConfig> = {
  startingBalance: 1000,
  liquidityParameter: 100,
  maxPositionSize: 500,
};

// ---- LMSR (Logarithmic Market Scoring Rule) ----

/**
 * LMSR cost function: C(q) = b * ln(e^(q_yes/b) + e^(q_no/b))
 * Price of YES share = e^(q_yes/b) / (e^(q_yes/b) + e^(q_no/b))
 */
function lmsrPrice(yesShares: number, noShares: number, b: number): number {
  const expYes = Math.exp(yesShares / b);
  const expNo = Math.exp(noShares / b);
  return expYes / (expYes + expNo);
}

function lmsrCost(
  currentYes: number,
  currentNo: number,
  deltaYes: number,
  deltaNo: number,
  b: number
): number {
  const costBefore = b * Math.log(Math.exp(currentYes / b) + Math.exp(currentNo / b));
  const costAfter =
    b * Math.log(Math.exp((currentYes + deltaYes) / b) + Math.exp((currentNo + deltaNo) / b));
  return costAfter - costBefore;
}

// ---- Market Operations ----

/**
 * Create a new prediction market for an idea.
 */
export function createMarket(
  ideaId: string,
  ideaTitle: string,
  description: string,
  config: MarketConfig = {}
): Market {
  const id = randomUUID();
  const now = new Date().toISOString();
  const b = config.liquidityParameter ?? DEFAULT_CONFIG.liquidityParameter;

  const market: Market = MarketSchema.parse({
    id,
    ideaId,
    ideaTitle,
    description,
    status: "open",
    currentPrice: 0.5,
    liquidityParameter: b,
    totalVolume: 0,
    traderCount: 0,
    createdAt: now,
  });

  markets.set(id, market);
  orders.set(id, []);
  trades.set(id, []);
  priceHistory.set(id, [{ timestamp: now, price: 0.5, volume: 0 }]);

  return market;
}

function ensurePortfolio(traderId: string, displayName?: string): TraderPortfolio {
  let portfolio = portfolios.get(traderId);
  if (!portfolio) {
    portfolio = {
      traderId,
      displayName: displayName ?? traderId,
      balance: DEFAULT_CONFIG.startingBalance,
      positions: [],
      realizedPnL: 0,
      wins: 0,
      losses: 0,
      accuracy: 0,
      joinedAt: new Date().toISOString(),
    };
    portfolios.set(traderId, portfolio);
  }
  return portfolio;
}

function getOrCreatePosition(portfolio: TraderPortfolio, marketId: string) {
  let pos = portfolio.positions.find((p) => p.marketId === marketId);
  if (!pos) {
    pos = { marketId, yesShares: 0, noShares: 0, averageCost: 0 };
    portfolio.positions.push(pos);
  }
  return pos;
}

/**
 * Place a limit order in the prediction market.
 */
export function placeLimitOrder(
  marketId: string,
  traderId: string,
  side: "yes" | "no",
  quantity: number,
  limitPrice: number,
  displayName?: string
): Order {
  const market = markets.get(marketId);
  if (!market) throw new Error(`Market ${marketId} not found`);
  if (market.status !== "open") throw new Error(`Market ${marketId} is not open`);
  if (quantity <= 0) throw new Error("Quantity must be positive");
  if (limitPrice < 0 || limitPrice > 1) throw new Error("Limit price must be between 0 and 1");

  const portfolio = ensurePortfolio(traderId, displayName);
  const now = new Date().toISOString();

  const order: Order = OrderSchema.parse({
    id: randomUUID(),
    marketId,
    traderId,
    side,
    type: "limit",
    quantity,
    filledQuantity: 0,
    limitPrice,
    status: "open",
    createdAt: now,
  });

  // Try to fill against LMSR
  const currentYes = market.totalVolume * market.currentPrice;
  const currentNo = market.totalVolume * (1 - market.currentPrice);
  const b = market.liquidityParameter;
  const currentMktPrice = lmsrPrice(currentYes, currentNo, b);

  const canFill =
    side === "yes" ? limitPrice >= currentMktPrice : limitPrice <= 1 - currentMktPrice;

  if (canFill) {
    const deltaYes = side === "yes" ? quantity : 0;
    const deltaNo = side === "no" ? quantity : 0;
    const cost = Math.abs(lmsrCost(currentYes, currentNo, deltaYes, deltaNo, b));

    if (cost <= portfolio.balance) {
      portfolio.balance -= cost;
      const pos = getOrCreatePosition(portfolio, marketId);
      if (side === "yes") pos.yesShares += quantity;
      else pos.noShares += quantity;

      const newPrice = lmsrPrice(currentYes + deltaYes, currentNo + deltaNo, b);
      market.currentPrice = newPrice;
      market.totalVolume += cost;

      order.filledQuantity = quantity;
      order.executionPrice = cost / quantity;
      order.status = "filled";
      order.filledAt = now;

      const trade: Trade = TradeSchema.parse({
        id: randomUUID(),
        marketId,
        buyOrderId: order.id,
        traderId,
        side,
        quantity,
        price: cost / quantity,
        cost,
        executedAt: now,
      });
      trades.get(marketId)!.push(trade);

      const history = priceHistory.get(marketId)!;
      history.push({ timestamp: now, price: newPrice, volume: cost });

      // Update trader count
      const uniqueTraders = new Set(trades.get(marketId)!.map((t) => t.traderId));
      market.traderCount = uniqueTraders.size;
    }
  }

  orders.get(marketId)!.push(order);
  return order;
}

/**
 * Place a market order (fills immediately at LMSR price).
 */
export function placeMarketOrder(
  marketId: string,
  traderId: string,
  side: "yes" | "no",
  quantity: number,
  displayName?: string
): Order {
  const market = markets.get(marketId);
  if (!market) throw new Error(`Market ${marketId} not found`);

  const currentPrice = side === "yes" ? market.currentPrice : 1 - market.currentPrice;
  return placeLimitOrder(marketId, traderId, side, quantity, currentPrice + 0.01, displayName);
}

/** Get current market price (implied probability). */
export function getMarketPrice(marketId: string): number {
  const market = markets.get(marketId);
  if (!market) throw new Error(`Market ${marketId} not found`);
  return market.currentPrice;
}

/** Get the order book for a market. */
export function getOrderBook(marketId: string): {
  market: Market;
  openOrders: Order[];
  recentTrades: Trade[];
} {
  const market = markets.get(marketId);
  if (!market) throw new Error(`Market ${marketId} not found`);
  const marketOrders = orders.get(marketId) ?? [];
  const marketTrades = trades.get(marketId) ?? [];
  return {
    market,
    openOrders: marketOrders.filter((o) => o.status === "open"),
    recentTrades: marketTrades.slice(-50),
  };
}

/** Get a trader's portfolio. */
export function getTraderPortfolio(traderId: string): TraderPortfolio | undefined {
  return portfolios.get(traderId);
}

/** Get analytics for a market. */
export function getMarketAnalytics(marketId: string): MarketAnalytics {
  const market = markets.get(marketId);
  if (!market) throw new Error(`Market ${marketId} not found`);

  const marketTrades = trades.get(marketId) ?? [];
  const history = priceHistory.get(marketId) ?? [];

  // Build leaderboard
  const traderPnLs = new Map<string, { pnL: number; tradeCount: number; displayName: string }>();
  for (const trade of marketTrades) {
    const existing = traderPnLs.get(trade.traderId) ?? {
      pnL: 0,
      tradeCount: 0,
      displayName: trade.traderId,
    };
    existing.tradeCount++;
    traderPnLs.set(trade.traderId, existing);
  }

  const leaderboard = Array.from(traderPnLs.entries()).map(([traderId, data]) => ({
    traderId,
    displayName: portfolios.get(traderId)?.displayName ?? data.displayName,
    pnL: portfolios.get(traderId)?.realizedPnL ?? 0,
    accuracy: portfolios.get(traderId)?.accuracy ?? 0,
    tradeCount: data.tradeCount,
  }));

  // Compute volatility from recent price changes
  const recentPrices = history.slice(-20).map((h) => h.price);
  let volatility = 0;
  if (recentPrices.length > 1) {
    const changes = recentPrices.slice(1).map((p, i) => Math.abs(p - recentPrices[i]));
    volatility = changes.reduce((s, c) => s + c, 0) / changes.length;
  }

  const sentiment =
    market.currentPrice > 0.6 ? "bullish" : market.currentPrice < 0.4 ? "bearish" : "neutral";

  return MarketAnalyticsSchema.parse({
    marketId,
    priceHistory: history,
    impliedProbability: market.currentPrice,
    leaderboard: leaderboard.sort((a, b) => b.pnL - a.pnL).slice(0, 100),
    sentiment,
    volatility,
  });
}
