# Nansen Token Bot

Telegram & Discord bot for on-chain token intelligence powered by [Nansen](https://nansen.ai).

Send a token symbol or contract address, get back a full report: price, market cap, holder flows, smart money activity, and top buyers/sellers.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)
![Telegram](https://img.shields.io/badge/Telegram-2CA5E0?logo=telegram&logoColor=white)
![Discord](https://img.shields.io/badge/Discord-5865F2?logo=discord&logoColor=white)

## What You Get

```
Pepe (PEPE) 🔴 -1.43% (24H)
⬠ Ethereum
CA: 0x6982508145454ce325ddbe47a25d4ec3d2311933

💰 Price: $0.0₀₅3760
🏛️ Mcap: $1.58B
📈 Vol: $726.5K
💧 Liq: $15.13M
🕒 Age: 2y 10mo
👥 Holders: 385,154

🔄 Holder Flows (24h)
🤓 Smart Traders: N/A
🐋 Whales: N/A
🏦 Exchanges: $803.0K OUT ⬇️ (0.9x avg)
📈 Top PnL Traders: $12.3K IN ⬆️ (0.9x avg)
🆕 Fresh Wallets: $257.6K IN ⬆️ (0.7x avg)
💱 DEX Activity: 🟢 $339.5K bought / 🔴 $309.5K sold

🟢 Top Buyers
1. Wintermute Market Making — $255.6K
2. DEX/CEX Trading Bot — $34.2K

🔴 Top Sellers
1. MEV: Bot — $102.6K
2. High Balance — $62.1K
```

## Prerequisites

You'll need your own API keys:

| Key | Where to get it |
|---|---|
| **Nansen API Key** (required) | [app.nansen.ai](https://app.nansen.ai) |
| **Telegram Bot Token** | Create via [@BotFather](https://t.me/BotFather) on Telegram |
| **Discord Bot Token** (optional) | [Discord Developer Portal](https://discord.com/developers/applications) |

## Setup

```bash
# Clone
git clone https://github.com/onlyshauns/nansen-token-bot.git
cd nansen-token-bot

# Install dependencies
npm install

# Configure your API keys
cp .env.example .env
# Edit .env and add your keys
```

## Running

```bash
# Development (with hot reload)
npm run dev

# Production build
npm run build
npm start
```

## Usage

### Telegram
- Send `$PEPE` to look up by symbol
- Send `$PEPE SOL` to specify a chain
- Send a contract address like `0x6982...` directly
- Use `/token <query>` as a command

### Discord
- Use the `/token` slash command
- Or send `$PEPE` in any channel the bot can read

### Supported Chains
Ethereum, Solana, Base, BNB Chain, Arbitrum, Polygon, Optimism, Avalanche, Tron, Fantom

## Data Sources

- **[Nansen](https://nansen.ai)** — Token info, holder flows, smart money DEX activity
- **[CoinGecko](https://coingecko.com)** — Token resolution (symbol to address) and 24h price change

## Architecture

```
src/
├── index.ts              # Entry point
├── config.ts             # Env var loading
├── core/
│   ├── parser.ts         # Parse user input ($SYMBOL, 0x..., chain hints)
│   ├── resolver.ts       # Resolve symbol → chain + address via CoinGecko
│   ├── lookup.ts         # Build token report (parallel API calls)
│   └── types.ts          # Shared interfaces
├── nansen/
│   └── client.ts         # Nansen API client with retry logic
└── platforms/
    ├── render.ts         # Format reports for Telegram HTML & Discord embeds
    ├── telegram.ts       # Grammy bot setup
    └── discord.ts        # Discord.js bot setup
```

## License

MIT
