import { EmbedBuilder } from 'discord.js';
import type { TokenReport, FlowSegment } from '../core/types.js';

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
  'Smart Traders': '\uD83E\uDDE0',  // 🧠
  'Whales': '\uD83D\uDC0B',          // 🐋
  'Public Figures': '\uD83D\uDC64',  // 👤
  'Exchanges': '\uD83C\uDFE6',       // 🏦
  'Top PnL Traders': '\uD83D\uDCC8', // 📈
  'Fresh Wallets': '\uD83C\uDD95',   // 🆕
};

function formatFlowLine(flow: FlowSegment): string {
  const emoji = FLOW_EMOJI[flow.name] || '•';
  const direction = flow.netFlowUsd >= 0 ? 'IN' : 'OUT';
  const dirEmoji = flow.netFlowUsd >= 0 ? '\u2B06\uFE0F' : '\u2B07\uFE0F'; // ⬆️ / ⬇️
  const ratio = flow.avgFlowUsd !== 0
    ? Math.abs(flow.netFlowUsd / flow.avgFlowUsd).toFixed(1)
    : '0.0';

  return `${emoji} ${flow.name}: ${formatUsd(Math.abs(flow.netFlowUsd))} ${direction} ${dirEmoji} (${ratio}x avg, ${flow.walletCount}w)`;
}

// ============================================
// Telegram HTML Renderer
// ============================================

export function toTelegramHTML(report: TokenReport): string {
  const t = report.token;
  const lines: string[] = [];

  // Header
  const changeEmoji = (report.priceChange24h ?? 0) >= 0 ? '\u2B06\uFE0F' : '\u2B07\uFE0F';
  lines.push(`<b>${t.name} (${t.symbol})</b> ${changeEmoji}`);
  lines.push(`\uD83C\uDF10 ${capitalize(t.chain)}`);
  lines.push(`CA: <code>${t.address}</code>`);
  lines.push('');

  // Market data
  if (report.priceUsd !== null) {
    lines.push(`\uD83D\uDCB0 Price: ${formatPrice(report.priceUsd)}`);
  }
  if (report.marketCapUsd !== null) {
    lines.push(`\uD83D\uDCCA Mcap: ${formatUsd(report.marketCapUsd)}`);
  }
  if (report.fdvUsd !== null && report.fdvUsd !== report.marketCapUsd) {
    lines.push(`\uD83D\uDC8E FDV: ${formatUsd(report.fdvUsd)}`);
  }
  if (report.priceChange24h !== null) {
    const emoji = report.priceChange24h >= 0 ? '\uD83D\uDFE2' : '\uD83D\uDD34'; // 🟢 / 🔴
    lines.push(`${emoji} 24h: ${formatPriceChange(report.priceChange24h)}`);
  }
  if (report.volume24hUsd !== null) {
    lines.push(`\uD83D\uDCCA Vol: ${formatUsd(report.volume24hUsd)}`);
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

  // Flows
  if (report.flows.length > 0) {
    lines.push('');
    lines.push('<b>\uD83D\uDCCA Holder Flows (24h)</b>');
    for (const flow of report.flows) {
      // Skip segments with 0 wallets
      if (flow.walletCount === 0 && flow.netFlowUsd === 0) continue;
      lines.push(formatFlowLine(flow));
    }
  }

  // Footer
  lines.push('');
  lines.push(`<a href="${report.nansenUrl}">View on Nansen</a>`);

  return lines.join('\n');
}

// ============================================
// Discord Embed Renderer
// ============================================

export function toDiscordEmbed(report: TokenReport): EmbedBuilder {
  const t = report.token;
  const isPositive = (report.priceChange24h ?? 0) >= 0;
  const color = isPositive ? 0x00c853 : 0xff1744; // green / red

  const embed = new EmbedBuilder()
    .setTitle(`${t.name} (${t.symbol})`)
    .setURL(report.nansenUrl)
    .setColor(color)
    .setDescription(`Chain: **${capitalize(t.chain)}**\nCA: \`${t.address}\``)
    .setFooter({ text: 'Data from Nansen' })
    .setTimestamp();

  // Market data fields (inline)
  if (report.priceUsd !== null) {
    embed.addFields({ name: '\uD83D\uDCB0 Price', value: formatPrice(report.priceUsd), inline: true });
  }
  if (report.marketCapUsd !== null) {
    embed.addFields({ name: '\uD83D\uDCCA Mcap', value: formatUsd(report.marketCapUsd), inline: true });
  }
  if (report.priceChange24h !== null) {
    const emoji = report.priceChange24h >= 0 ? '\uD83D\uDFE2' : '\uD83D\uDD34';
    embed.addFields({ name: `${emoji} 24h`, value: formatPriceChange(report.priceChange24h), inline: true });
  }
  if (report.volume24hUsd !== null) {
    embed.addFields({ name: '\uD83D\uDCCA Vol', value: formatUsd(report.volume24hUsd), inline: true });
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

  // Flows (non-inline block)
  if (report.flows.length > 0) {
    const activeFlows = report.flows.filter(f => f.walletCount > 0 || f.netFlowUsd !== 0);
    if (activeFlows.length > 0) {
      const flowText = activeFlows.map(formatFlowLine).join('\n');
      embed.addFields({ name: '\uD83D\uDCCA Holder Flows (24h)', value: flowText, inline: false });
    }
  }

  return embed;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
