/**
 * Scans the watchlist for interesting token activity and ranks by "tweetworthiness".
 * Sequential API calls with delays to respect Nansen rate limits.
 */

import type { NansenClient } from '../nansen/client.js';
import type { ResolvedToken, TokenReport } from '../core/types.js';
import { buildTokenReport } from '../core/lookup.js';

// ============================================
// Types
// ============================================

export interface ScanResult {
  token: ResolvedToken;
  report: TokenReport;
  interestScore: number;
  signals: string[];
}

// ============================================
// Interest scoring weights
// ============================================

function scoreReport(report: TokenReport): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  // Smart Money net flow > $1M
  if (report.smartMoney.buySell) {
    const netFlow = Math.abs(report.smartMoney.buySell.netFlowUsd);
    if (netFlow >= 1_000_000) {
      score += 30;
      const direction = report.smartMoney.buySell.netFlowUsd >= 0 ? 'buying' : 'selling';
      signals.push(`SM net ${direction} $${(netFlow / 1e6).toFixed(1)}M`);
    } else if (netFlow >= 500_000) {
      score += 15;
      const direction = report.smartMoney.buySell.netFlowUsd >= 0 ? 'buying' : 'selling';
      signals.push(`SM net ${direction} $${(netFlow / 1e3).toFixed(0)}K`);
    }

    // Buyer/seller imbalance > 3:1
    const { buyerCount, sellerCount } = report.smartMoney.buySell;
    if (buyerCount > 0 && sellerCount > 0) {
      const ratio = buyerCount / sellerCount;
      if (ratio >= 3) {
        score += 20;
        signals.push(`${ratio.toFixed(1)}:1 buy/sell ratio`);
      } else if (ratio <= 1 / 3) {
        score += 20;
        signals.push(`${(1 / ratio).toFixed(1)}:1 sell/buy ratio`);
      }
    }
  }

  // Flow ratio vs avg — smart traders or whales with >3x average
  for (const flow of report.flows) {
    if (flow.avgFlowUsd === 0 || flow.walletCount === 0) continue;

    const ratio = Math.abs(flow.netFlowUsd / flow.avgFlowUsd);
    if (ratio >= 3 && Math.abs(flow.netFlowUsd) >= 100_000) {
      if (flow.name === 'Smart Traders' || flow.name === 'Whales') {
        score += 25;
        const dir = flow.netFlowUsd >= 0 ? 'inflow' : 'outflow';
        signals.push(`${flow.name} ${ratio.toFixed(1)}x avg ${dir}`);
      } else if (flow.name === 'Exchanges') {
        // Exchange outflow (negative netFlowUsd = leaving exchanges = bullish)
        if (flow.netFlowUsd < 0) {
          score += 15;
          signals.push(`Exchange outflow ${ratio.toFixed(1)}x avg`);
        }
      }
    }
  }

  // Whale flow > $5M
  const whaleFlow = report.flows.find((f) => f.name === 'Whales');
  if (whaleFlow && Math.abs(whaleFlow.netFlowUsd) >= 5_000_000) {
    score += 20;
    const dir = whaleFlow.netFlowUsd >= 0 ? 'accumulation' : 'distribution';
    signals.push(`Whale ${dir} $${(Math.abs(whaleFlow.netFlowUsd) / 1e6).toFixed(1)}M`);
  }

  // Significant price move + volume (token is moving AND there's signal)
  if (report.priceChange24h !== null && Math.abs(report.priceChange24h) >= 10) {
    score += 10;
    const dir = report.priceChange24h >= 0 ? 'up' : 'down';
    signals.push(`Price ${dir} ${Math.abs(report.priceChange24h).toFixed(1)}%`);
  }

  return { score, signals };
}

// ============================================
// Scanner
// ============================================

const SCAN_DELAY_MS = 2000; // 2s between tokens to avoid hammering Nansen

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Scan a list of tokens and return ranked results by interest score.
 * Only returns tokens with score >= minScore.
 */
export async function scanWatchlist(
  tokens: ResolvedToken[],
  nansen: NansenClient,
  minScore = 30
): Promise<ScanResult[]> {
  const results: ScanResult[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    try {
      console.log(`[Scanner] (${i + 1}/${tokens.length}) Scanning ${token.symbol}...`);
      const report = await buildTokenReport(token, nansen);
      const { score, signals } = scoreReport(report);

      if (score >= minScore) {
        results.push({ token, report, interestScore: score, signals });
        console.log(`[Scanner] ${token.symbol}: score=${score} signals=[${signals.join(', ')}]`);
      } else {
        console.log(`[Scanner] ${token.symbol}: score=${score} (below threshold)`);
      }
    } catch (error) {
      console.error(`[Scanner] Error scanning ${token.symbol}:`, error);
    }

    // Delay between tokens (skip after last one)
    if (i < tokens.length - 1) {
      await sleep(SCAN_DELAY_MS);
    }
  }

  // Sort by interest score descending
  results.sort((a, b) => b.interestScore - a.interestScore);
  return results;
}
