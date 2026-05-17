/**
 * @module futures-market
 *
 * Idea Futures Market — an internal prediction market where team members
 * bet virtual tokens on which ideas will succeed. Uses a continuous double
 * auction order book and Logarithmic Market Scoring Rule (LMSR) for
 * automated market making.
 */

import { z } from "zod";

// ---- Market ----

export const MarketStatusSchema = z.enum(["open", "closed", "resolved"]);
export type MarketStatus = z.infer<typeof MarketStatusSchema>;

export const MarketSchema = z.object({
  id: z.string().max(200),
  ideaId: z.string().max(200),
  ideaTitle: z.string().max(500),
  description: z.string().max(5000),
  status: MarketStatusSchema,
  /** Current market-implied probability of success (0–1). */
  currentPrice: z.number().min(0).max(1),
  /** LMSR liquidity parameter (higher = less price impact per trade). */
  liquidityParameter: z.number().min(1).max(10000).default(100),
  /** Total virtual tokens wagered. */
  totalVolume: z.number().min(0),
  /** Number of unique traders. */
  traderCount: z.number().int().min(0),
  /** Actual outcome if resolved. */
  resolvedOutcome: z.boolean().optional(),
  createdAt: z.string(),
  closesAt: z.string().optional(),
  resolvedAt: z.string().optional(),
});

export type Market = z.infer<typeof MarketSchema>;

// ---- Orders ----

export const OrderSideSchema = z.enum(["yes", "no"]);
export type OrderSide = z.infer<typeof OrderSideSchema>;

export const OrderTypeSchema = z.enum(["limit", "market"]);
export type OrderType = z.infer<typeof OrderTypeSchema>;

export const OrderStatusSchema = z.enum(["open", "filled", "partially-filled", "cancelled"]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const OrderSchema = z.object({
  id: z.string().max(200),
  marketId: z.string().max(200),
  traderId: z.string().max(200),
  side: OrderSideSchema,
  type: OrderTypeSchema,
  /** Number of shares. */
  quantity: z.number().int().min(1).max(100000),
  /** Filled quantity. */
  filledQuantity: z.number().int().min(0),
  /** Limit price (0–1, only for limit orders). */
  limitPrice: z.number().min(0).max(1).optional(),
  /** Execution price (set after fill). */
  executionPrice: z.number().min(0).max(1).optional(),
  status: OrderStatusSchema,
  createdAt: z.string(),
  filledAt: z.string().optional(),
});

export type Order = z.infer<typeof OrderSchema>;

// ---- Trades ----

export const TradeSchema = z.object({
  id: z.string().max(200),
  marketId: z.string().max(200),
  buyOrderId: z.string().max(200),
  sellOrderId: z.string().max(200).optional(),
  traderId: z.string().max(200),
  side: OrderSideSchema,
  quantity: z.number().int().min(1),
  price: z.number().min(0).max(1),
  /** Virtual tokens exchanged. */
  cost: z.number(),
  executedAt: z.string(),
});

export type Trade = z.infer<typeof TradeSchema>;

// ---- Trader Portfolio ----

export const TraderPortfolioSchema = z.object({
  traderId: z.string().max(200),
  displayName: z.string().max(200),
  /** Virtual token balance. */
  balance: z.number(),
  /** Holdings per market. */
  positions: z
    .array(
      z.object({
        marketId: z.string().max(200),
        yesShares: z.number().int().min(0),
        noShares: z.number().int().min(0),
        averageCost: z.number().min(0).max(1),
      })
    )
    .max(1000),
  /** Total realized profit/loss. */
  realizedPnL: z.number(),
  /** Win/loss record. */
  wins: z.number().int().min(0),
  losses: z.number().int().min(0),
  /** Prediction accuracy (0–1). */
  accuracy: z.number().min(0).max(1),
  joinedAt: z.string(),
});

export type TraderPortfolio = z.infer<typeof TraderPortfolioSchema>;

// ---- Analytics ----

export const MarketAnalyticsSchema = z.object({
  marketId: z.string().max(200),
  /** Price history for charting. */
  priceHistory: z
    .array(
      z.object({
        timestamp: z.string(),
        price: z.number().min(0).max(1),
        volume: z.number().min(0),
      })
    )
    .max(10000),
  /** Current implied probability. */
  impliedProbability: z.number().min(0).max(1),
  /** Trader leaderboard. */
  leaderboard: z
    .array(
      z.object({
        traderId: z.string().max(200),
        displayName: z.string().max(200),
        pnL: z.number(),
        accuracy: z.number().min(0).max(1),
        tradeCount: z.number().int().min(0),
      })
    )
    .max(100),
  /** Market sentiment (bull/bear/neutral). */
  sentiment: z.enum(["bullish", "bearish", "neutral"]),
  /** Volatility of recent price changes. */
  volatility: z.number().min(0),
});

export type MarketAnalytics = z.infer<typeof MarketAnalyticsSchema>;

// ---- Config ----

export interface MarketConfig {
  /** Starting virtual token balance for new traders. */
  startingBalance?: number;
  /** LMSR liquidity parameter. */
  liquidityParameter?: number;
  /** Maximum position size per trader per market. */
  maxPositionSize?: number;
}
