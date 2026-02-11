import { EmbedBuilder } from 'discord.js';
import type { TokenReport, FlowSegment, SmartMoneySection, TopTrader } from '../core/types.js';

// ============================================
// Formatting Helpers
// ============================================

function formatUsd(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  if (abs >= 1) return `${sign}$${abs.toFixed(2)}`;
  if (abs >= 0.01) return `${sign}$${abs.toFixed(4)}`;
  // Very small prices (memecoins)
  return `${sign}$${abs.toExponential(2)}`;
}

function formatPrice(value: number): string {
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.0001) return `$${value.toFixed(6)}`;
  // Subscript notation for very small prices: $0.0₅4123
  const str = value.toFixed(20);
  const match = str.match(/^0\.(0+)/);
  if (match) {
    const zeroCount = match[1].length;
    const significantDigits = str.slice(2 + zeroCount, 2 + zeroCount + 4);
    return `$0.0\u2080${subscriptDigit(zeroCount)}${significantDigits}`;
  }
  return `$${value.toExponential(2)}`;
}

function subscriptDigit(n: number): string {
  const subscripts = '\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089';
  return String(n).split('').map(d => subscripts[parseInt(d)]).join('');
}

function formatAge(days: number): string {
  if (days >= 365) {
    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    return months > 0 ? `${years}y ${months}mo` : `${years}y`;
  }
  if (days >= 30) {
    const months = Math.floor(days / 30);
    return `${months}mo`;
  }
  if (days >= 7) {
    const weeks = Math.floor(days / 7);
    return `${weeks}w`;
  }
  return `${days}d`;
}

function formatPriceChange(pct: number | null): string {
  if (pct === null) return 'N/A';
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

const FLOW_EMOJI: Record<string, string> = {
  'Smart Traders': '\uD83E\uDD13',  // 🤓
  'Whales': '\uD83D\uDC0B',          // 🐋
  'Public Figures': '\uD83D\uDC64',  // 👤
  'Exchanges': '\uD83C\uDFE6',       // 🏦
  'Top PnL Traders': '\uD83D\uDCC8', // 📈
  'Fresh Wallets': '\uD83C\uDD95',   // 🆕
};

function formatFlowLine(flow: FlowSegment): string {
  const emoji = FLOW_EMOJI[flow.name] || '\u2022';

  // Show N/A if no data for this segment
  if (flow.walletCount === 0 && flow.netFlowUsd === 0) {
    return `${emoji} ${flow.name}: N/A`;
  }

  const direction = flow.netFlowUsd >= 0 ? 'IN' : 'OUT';
  const dirEmoji = flow.netFlowUsd >= 0 ? '\u2B06\uFE0F' : '\u2B07\uFE0F'; // ⬆️ / ⬇️
  const ratio = flow.avgFlowUsd !== 0
    ? Math.abs(flow.netFlowUsd / flow.avgFlowUsd).toFixed(1)
    : '0.0';

  return `${emoji} ${flow.name}: ${formatUsd(Math.abs(flow.netFlowUsd))} ${direction} ${dirEmoji} (${ratio}x avg, ${flow.walletCount}w)`;
}

// ============================================
// Smart Money Formatting
// ============================================

function formatSmartMoneyTelegram(sm: SmartMoneySection): string[] {
  const lines: string[] = [];
  lines.push('<b>\uD83E\uDD13 Smart Money DEX (24h)</b>');

  // Buy/Sell ratio
  if (sm.buySell) {
    const bs = sm.buySell;
    lines.push(`\uD83D\uDFE2 Buying: ${formatUsd(bs.boughtVolumeUsd)} (${bs.buyerCount} traders)`);
    lines.push(`\uD83D\uDD34 Selling: ${formatUsd(bs.soldVolumeUsd)} (${bs.sellerCount} traders)`);

    const netEmoji = bs.netFlowUsd >= 0 ? '\uD83D\uDFE2' : '\uD83D\uDD34'; // 🟢 / 🔴
    const sentiment = bs.netFlowUsd >= 0 ? 'bullish' : 'bearish';
    const netSign = bs.netFlowUsd >= 0 ? '+' : '';
    lines.push(`${netEmoji} Net: ${netSign}${formatUsd(bs.netFlowUsd)} (${sentiment})`);
  }

  // Top Buyers
  if (sm.topBuyers.length > 0) {
    lines.push('');
    lines.push('<b>\uD83D\uDFE2 Top Buyers</b>');
    for (let i = 0; i < sm.topBuyers.length; i++) {
      const t = sm.topBuyers[i];
      lines.push(`${i + 1}. ${t.label} \u2014 ${formatUsd(t.volumeUsd)}`);
    }
  }

  // Top Sellers
  if (sm.topSellers.length > 0) {
    lines.push('');
    lines.push('<b>\uD83D\uDD34 Top Sellers</b>');
    for (let i = 0; i < sm.topSellers.length; i++) {
      const t = sm.topSellers[i];
      lines.push(`${i + 1}. ${t.label} \u2014 ${formatUsd(t.volumeUsd)}`);
    }
  }

  return lines;
}

function formatSmartMoneyDiscord(sm: SmartMoneySection): string {
  const lines: string[] = [];

  if (sm.buySell) {
    const bs = sm.buySell;
    lines.push(`\uD83D\uDFE2 Buying: ${formatUsd(bs.boughtVolumeUsd)} (${bs.buyerCount} traders)`);
    lines.push(`\uD83D\uDD34 Selling: ${formatUsd(bs.soldVolumeUsd)} (${bs.sellerCount} traders)`);
    const netEmoji = bs.netFlowUsd >= 0 ? '\uD83D\uDFE2' : '\uD83D\uDD34';
    const sentiment = bs.netFlowUsd >= 0 ? 'bullish' : 'bearish';
    const netSign = bs.netFlowUsd >= 0 ? '+' : '';
    lines.push(`${netEmoji} Net: ${netSign}${formatUsd(bs.netFlowUsd)} (${sentiment})`);
  }

  return lines.join('\n');
}

function formatTradersDiscord(traders: TopTrader[], side: 'BUY' | 'SELL'): string {
  return traders.map((t, i) => {
    return `${i + 1}. ${t.label} \u2014 ${formatUsd(t.volumeUsd)}`;
  }).join('\n');
}

function hasSmartMoneyData(sm: SmartMoneySection): boolean {
  const hasTraders = sm.topBuyers.length > 0 || sm.topSellers.length > 0;
  const hasVolume = sm.buySell !== null && (sm.buySell.boughtVolumeUsd > 0 || sm.buySell.soldVolumeUsd > 0);
  return hasTraders || hasVolume;
}

// ============================================
// Telegram HTML Renderer
// ============================================

export function toTelegramHTML(report: TokenReport): string {
  const t = report.token;
  const lines: string[] = [];

  // Header
  const pct = report.priceChange24h;
  const changeEmoji = (pct ?? 0) >= 0 ? '\uD83D\uDFE2' : '\uD83D\uDD34'; // 🟢 / 🔴
  const changeStr = pct !== null ? ` ${changeEmoji} ${formatPriceChange(pct)} (24H)` : '';
  lines.push(`<b>${t.name} (${t.symbol})</b>${changeStr}`);
  lines.push(`${chainEmoji(t.chain)} ${capitalize(t.chain)}`);
  lines.push(`CA: <code>${t.address}</code>`);
  lines.push('');

  // Market data
  if (report.priceUsd !== null) {
    const changeTag = report.priceChange24h !== null
      ? ` (${formatPriceChange(report.priceChange24h)})`
      : '';
    lines.push(`\uD83D\uDCB0 Price: ${formatPrice(report.priceUsd)}${changeTag}`);
  }
  if (report.marketCapUsd !== null) {
    lines.push(`\uD83C\uDFDB\uFE0F Mcap: ${formatUsd(report.marketCapUsd)}`);
  }
  if (report.fdvUsd !== null && report.fdvUsd !== report.marketCapUsd) {
    lines.push(`\uD83D\uDC8E FDV: ${formatUsd(report.fdvUsd)}`);
  }
  if (report.volume24hUsd !== null) {
    lines.push(`\uD83D\uDCC8 24h Vol: ${formatUsd(report.volume24hUsd)}`);
  }
  if (report.liquidityUsd !== null) {
    lines.push(`\uD83D\uDCA7 Liq: ${formatUsd(report.liquidityUsd)}`);
  }
  if (report.tokenAgeDays !== null) {
    lines.push(`\uD83D\uDD52 Age: ${formatAge(report.tokenAgeDays)}`);
  }
  if (report.holderCount !== null) {
    lines.push(`\uD83D\uDC65 Holders: ${report.holderCount.toLocaleString()}`);
  }

  // Holder Flows section
  const hasSM = hasSmartMoneyData(report.smartMoney);
  const hasFlows = report.flows.length > 0;

  lines.push('');
  lines.push('<b>\uD83D\uDD04 Holder Flows (24h)</b>');

  if (hasFlows) {
    for (const flow of report.flows) {
      lines.push(formatFlowLine(flow));
    }
  } else {
    lines.push('\u2022 Not Available');
  }

  // Smart Money DEX buy/sell summary
  if (hasSM && report.smartMoney.buySell) {
    const bs = report.smartMoney.buySell;
    lines.push(`\uD83D\uDCB1 DEX Activity: \uD83D\uDFE2 ${formatUsd(bs.boughtVolumeUsd)} bought / \uD83D\uDD34 ${formatUsd(bs.soldVolumeUsd)} sold`);
  }

  // Top Buyers
  if (report.smartMoney.topBuyers.length > 0) {
    lines.push('');
    lines.push('<b>\uD83D\uDFE2 Top Buyers</b>');
    for (let i = 0; i < report.smartMoney.topBuyers.length; i++) {
      const t = report.smartMoney.topBuyers[i];
      lines.push(`${i + 1}. ${t.label} \u2014 ${formatUsd(t.volumeUsd)}`);
    }
  }

  // Top Sellers
  if (report.smartMoney.topSellers.length > 0) {
    lines.push('');
    lines.push('<b>\uD83D\uDD34 Top Sellers</b>');
    for (let i = 0; i < report.smartMoney.topSellers.length; i++) {
      const t = report.smartMoney.topSellers[i];
      lines.push(`${i + 1}. ${t.label} \u2014 ${formatUsd(t.volumeUsd)}`);
    }
  }

  // Smart Money section — show N/A if no data
  if (!hasSM) {
    lines.push('');
    lines.push('<b>\uD83E\uDD13 Smart Money DEX (24h)</b>');
    lines.push('\u2022 Not Available');
  }

  // Footer with data source
  lines.push('');
  const sourceLabel = report.dataSource === 'both' ? 'Nansen + CoinGecko'
    : report.dataSource === 'coingecko' ? 'CoinGecko (Nansen analytics unavailable)'
    : report.dataSource === 'nansen' ? 'Nansen'
    : 'Limited data';
  lines.push(`<a href="${report.nansenUrl}">View on Nansen</a> \u2022 ${sourceLabel}`);

  return lines.join('\n');
}

// ============================================
// Discord Embed Renderer
// ============================================

export function toDiscordEmbed(report: TokenReport): EmbedBuilder {
  const t = report.token;
  const isPositive = (report.priceChange24h ?? 0) >= 0;
  const color = isPositive ? 0x00c853 : 0xff1744; // green / red

  const pct = report.priceChange24h;
  const changeEmoji = (pct ?? 0) >= 0 ? '\uD83D\uDFE2' : '\uD83D\uDD34';
  const changeStr = pct !== null ? ` ${changeEmoji} ${formatPriceChange(pct)} (24H)` : '';

  const sourceLabel = report.dataSource === 'both' ? 'Nansen + CoinGecko'
    : report.dataSource === 'coingecko' ? 'CoinGecko'
    : report.dataSource === 'nansen' ? 'Nansen'
    : 'Limited data';

  const embed = new EmbedBuilder()
    .setTitle(`${t.name} (${t.symbol})${changeStr}`)
    .setURL(report.nansenUrl)
    .setColor(color)
    .setDescription(`${chainEmoji(t.chain)} **${capitalize(t.chain)}**\nCA: \`${t.address}\``)
    .setFooter({ text: `Data from ${sourceLabel}` })
    .setTimestamp();

  // Market data fields (inline)
  if (report.priceUsd !== null) {
    const changeTag = report.priceChange24h !== null
      ? ` (${formatPriceChange(report.priceChange24h)})`
      : '';
    embed.addFields({ name: '\uD83D\uDCB0 Price', value: `${formatPrice(report.priceUsd)}${changeTag}`, inline: true });
  }
  if (report.marketCapUsd !== null) {
    embed.addFields({ name: '\uD83C\uDFDB\uFE0F Mcap', value: formatUsd(report.marketCapUsd), inline: true });
  }
  if (report.volume24hUsd !== null) {
    embed.addFields({ name: '\uD83D\uDCC8 24h Vol', value: formatUsd(report.volume24hUsd), inline: true });
  }
  if (report.fdvUsd !== null) {
    embed.addFields({ name: '\uD83D\uDC8E FDV', value: formatUsd(report.fdvUsd), inline: true });
  }
  if (report.liquidityUsd !== null) {
    embed.addFields({ name: '\uD83D\uDCA7 Liq', value: formatUsd(report.liquidityUsd), inline: true });
  }
  if (report.tokenAgeDays !== null) {
    embed.addFields({ name: '\uD83D\uDD52 Age', value: formatAge(report.tokenAgeDays), inline: true });
  }
  if (report.holderCount !== null) {
    embed.addFields({ name: '\uD83D\uDC65 Holders', value: report.holderCount.toLocaleString(), inline: true });
  }

  // Holder Flows
  const hasSMDiscord = hasSmartMoneyData(report.smartMoney);
  const flowLines: string[] = [];

  if (report.flows.length > 0) {
    flowLines.push(...report.flows.map(formatFlowLine));
  } else {
    flowLines.push('Not Available');
  }

  if (hasSMDiscord && report.smartMoney.buySell) {
    const bs = report.smartMoney.buySell;
    flowLines.push(`\uD83D\uDCB1 DEX Activity: \uD83D\uDFE2 ${formatUsd(bs.boughtVolumeUsd)} bought / \uD83D\uDD34 ${formatUsd(bs.soldVolumeUsd)} sold`);
  }
  embed.addFields({ name: '\uD83D\uDD04 Holder Flows (24h)', value: flowLines.join('\n'), inline: false });

  if (report.smartMoney.topBuyers.length > 0) {
    embed.addFields({
      name: '\uD83D\uDFE2 Top Buyers',
      value: formatTradersDiscord(report.smartMoney.topBuyers, 'BUY'),
      inline: true,
    });
  }
  if (report.smartMoney.topSellers.length > 0) {
    embed.addFields({
      name: '\uD83D\uDD34 Top Sellers',
      value: formatTradersDiscord(report.smartMoney.topSellers, 'SELL'),
      inline: true,
    });
  }

  if (!hasSMDiscord) {
    embed.addFields({ name: '\uD83E\uDD13 Smart Money DEX (24h)', value: 'Not Available', inline: false });
  }

  return embed;
}

function chainEmoji(chain: string): string {
  const map: Record<string, string> = {
    ethereum: '\u2B20',    // ⬠ (ETH diamond)
    solana: '\u2600\uFE0F', // ☀️
    base: '\uD83D\uDD35',  // 🔵
    bnb: '\uD83D\uDFE1',   // 🟡
    arbitrum: '\uD83D\uDD37', // 🔷
    polygon: '\uD83D\uDFE3', // 🟣
    optimism: '\uD83D\uDD34', // 🔴
    avalanche: '\uD83D\uDD3A', // 🔺
    tron: '\u26A1',         // ⚡
    fantom: '\uD83D\uDC7B', // 👻
    blast: '\uD83D\uDFE1',  // 🟡
    scroll: '\uD83D\uDCDC', // 📜
    linea: '\u2796',        // ➖
    mantle: '\uD83D\uDFE2', // 🟢
    ronin: '\u2694\uFE0F',  // ⚔️
    sei: '\uD83C\uDF0A',    // 🌊
    zksync: '\uD83D\uDD37', // 🔷
    unichain: '\uD83E\uDD84', // 🦄
    sonic: '\uD83D\uDC9C',  // 💜
    monad: '\uD83D\uDFE3',  // 🟣
    near: '\uD83C\uDF10',   // 🌐
    starknet: '\u2B50',     // ⭐
    sui: '\uD83D\uDCA7',    // 💧
    ton: '\uD83D\uDC8E',    // 💎
    hyperevm: '\uD83D\uDFE2', // 🟢
    plasma: '\u26A1',       // ⚡
    iotaevm: '\uD83C\uDF10', // 🌐
  };
  return map[chain] || '\uD83D\uDD17'; // 🔗 fallback
}

// ============================================
// Twitter/X Plain Text Renderer
// ============================================

/**
 * Convert a TokenReport into a tweet thread (array of ≤280-char strings).
 * Tweet 1: Price / market data
 * Tweet 2: Smart money / holder flows
 * Tweet 3: Top buyers/sellers (if available)
 */
export function toTweetText(report: TokenReport): string[] {
  const sym = `$${report.token.symbol}`;
  const parts: string[] = [];

  // --- Part 1: Header + Market data + key flows ---
  const lines1: string[] = [];
  let header = sym;
  if (report.priceUsd !== null) header += ` | ${formatPrice(report.priceUsd)}`;
  if (report.priceChange24h !== null) header += ` (${formatPriceChange(report.priceChange24h)})`;
  lines1.push(header);

  if (report.marketCapUsd !== null) lines1.push(`Mcap: ${formatUsd(report.marketCapUsd)}`);
  if (report.volume24hUsd !== null) lines1.push(`24h Vol: ${formatUsd(report.volume24hUsd)}`);
  if (report.liquidityUsd !== null) lines1.push(`Liq: ${formatUsd(report.liquidityUsd)}`);

  // If Tweet 1 is too thin (no market data), fold top flow signals into it
  const interestingFlows = report.flows.filter(
    (f) => f.walletCount > 0 && f.netFlowUsd !== 0
  );

  if (lines1.length <= 2 && interestingFlows.length > 0) {
    lines1.push('');
    for (const flow of interestingFlows.slice(0, 3)) {
      const dir = flow.netFlowUsd >= 0 ? 'IN' : 'OUT';
      lines1.push(`${flow.name}: ${formatUsd(Math.abs(flow.netFlowUsd))} ${dir}`);
    }
    if (report.smartMoney.buySell) {
      const bs = report.smartMoney.buySell;
      const sentiment = bs.netFlowUsd >= 0 ? 'bullish' : 'bearish';
      lines1.push(`SM DEX: ${formatUsd(bs.boughtVolumeUsd)} bought / ${formatUsd(bs.soldVolumeUsd)} sold (${sentiment})`);
    }
  }

  parts.push(fitTweet(lines1.join('\n')));

  // --- Part 2: Full flows + Smart Money (skip if already folded above) ---
  if (lines1.length <= 2 || interestingFlows.length > 0) {
    const lines2: string[] = [];
    lines2.push(`${sym} flows (24h):`);

    if (interestingFlows.length > 0) {
      for (const flow of interestingFlows) {
        const dir = flow.netFlowUsd >= 0 ? 'IN' : 'OUT';
        const ratio =
          flow.avgFlowUsd !== 0
            ? ` (${Math.abs(flow.netFlowUsd / flow.avgFlowUsd).toFixed(1)}x avg)`
            : '';
        lines2.push(`${flow.name}: ${formatUsd(Math.abs(flow.netFlowUsd))} ${dir}${ratio}`);
      }
    }

    if (report.smartMoney.buySell) {
      const bs = report.smartMoney.buySell;
      const sentiment = bs.netFlowUsd >= 0 ? 'bullish' : 'bearish';
      lines2.push(`SM DEX: ${formatUsd(bs.boughtVolumeUsd)} bought / ${formatUsd(bs.soldVolumeUsd)} sold (${sentiment})`);
    }

    if (lines2.length > 1) {
      parts.push(fitTweet(lines2.join('\n')));
    }
  }

  // --- Part 3: Top buyers/sellers (if any) ---
  const lines3: string[] = [];
  if (report.smartMoney.topBuyers.length > 0) {
    lines3.push(`${sym} top buyers:`);
    for (const t of report.smartMoney.topBuyers.slice(0, 3)) {
      lines3.push(`${t.label} — ${formatUsd(t.volumeUsd)}`);
    }
  }
  if (report.smartMoney.topSellers.length > 0) {
    if (lines3.length > 0) lines3.push('');
    lines3.push('Top sellers:');
    for (const t of report.smartMoney.topSellers.slice(0, 3)) {
      lines3.push(`${t.label} — ${formatUsd(t.volumeUsd)}`);
    }
  }

  if (lines3.length > 0) {
    parts.push(fitTweet(lines3.join('\n')));
  }

  return parts;
}

/**
 * Truncate text to fit a single tweet (280 chars).
 */
function fitTweet(text: string): string {
  if (text.length <= 280) return text;
  return text.slice(0, 277) + '...';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
