# Nansen Token Bot

Telegram bot for on-chain token intelligence powered by [Nansen](https://nansen.ai).

Send a token symbol or contract address, get back a full report: price, market cap, holder flows, smart money activity, and top buyers/sellers.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)
![Telegram](https://img.shields.io/badge/Telegram-2CA5E0?logo=telegram&logoColor=white)

## What You Get

```
Pepe (PEPE) -1.43% (24H)
Ethereum
CA: 0x6982508145454ce325ddbe47a25d4ec3d2311933

Price: $0.0000003760
Mcap: $1.58B
Vol: $726.5K
Liq: $15.13M
Age: 2y 10mo
Holders: 385,154

Holder Flows (24h)
Smart Traders: N/A
Whales: N/A
Exchanges: $803.0K OUT (0.9x avg)
Top PnL Traders: $12.3K IN (0.9x avg)
Fresh Wallets: $257.6K IN (0.7x avg)
DEX Activity: $339.5K bought / $309.5K sold

Top Buyers
1. Wintermute Market Making — $255.6K
2. DEX/CEX Trading Bot — $34.2K

Top Sellers
1. MEV: Bot — $102.6K
2. High Balance — $62.1K
```

## Setup

```bash
# Clone
git clone https://github.com/onlyshauns/nansen-token-bot.git
cd nansen-token-bot

# Install dependencies
npm install

# Add your Telegram bot token
cp .env.example .env
# Edit .env and set TELEGRAM_BOT_TOKEN

# Run
npm run dev
```

That's it. Users provide their own Nansen API key directly in Telegram -- no server-side key needed.

## How API Keys Work

Each user sets their own [Nansen](https://app.nansen.ai) API key via DM:

1. Open a **private chat** with the bot on Telegram
2. Send `/setkey YOUR_NANSEN_API_KEY`
3. Bot validates the key, deletes your message (security), and confirms
4. Start querying tokens -- `$PEPE`, `$ETH`, `0x6982...`

Keys are persisted in `data/keys.json` on the server (gitignored) and survive restarts.

## Commands

| Command | Where | Description |
|---|---|---|
| `/start` | DM / Group | Welcome message and status |
| `/setkey <key>` | **DM only** | Set your Nansen API key |
| `/removekey` | DM / Group | Remove your stored key |
| `/token <query>` | DM / Group | Look up a token |
| `/dmonly` | DM | Toggle DM-only mode (blocks your key from working in groups) |
| `/mystats` | DM / Group | View your usage stats (queries, rate limits) |
| `/allow` | **Group only** | Reply to a user's message to grant them access to your API key in that group |
| `/revoke` | **Group only** | Reply to a user's message to revoke their access |
| `/allowlist` | **Group only** | See who you've granted access to in the current group |

## Usage

### Querying Tokens
- `$PEPE` -- look up by symbol
- `$PEPE SOL` -- specify a chain
- `$ETH`, `$BTC`, `$SOL` -- native tokens work too
- `0x6982...` -- paste a contract address directly
- `/token PEPE` -- use the command form

### Group Access Sharing

By default, only users with their own API key can query tokens. If you want to let others in a group use your key:

1. Go to the group chat
2. Reply to a message from the user you want to allow
3. Send `/allow`
4. That user can now query tokens in **that specific group** using your key

To revoke: reply to their message and send `/revoke`. Use `/allowlist` to see who has access.

Access is **per-group** -- allowing someone in Group A doesn't give them access in Group B.

### DM-Only Mode

If you don't want your key used in any groups (even by you), send `/dmonly` in a DM. Your key will only work in private chat with the bot. Send `/dmonly` again to turn it off.

### Supported Chains
Ethereum, Solana, Base, BNB Chain, Arbitrum, Polygon, Optimism, Avalanche, Tron, Fantom

### Native Tokens
ETH, BTC, SOL, BNB, AVAX, POL, and FTM are handled natively without needing a contract address.

## Security

- **API keys are only accepted via DM** -- the bot auto-deletes `/setkey` messages to prevent key exposure
- **Rate limiting** -- 10 queries/minute, 30 queries/hour per user (sliding window)
- **Concurrent guard** -- one query at a time per user to prevent spam
- **DM-only mode** -- users can lock their key to private chat only
- **Per-group allowlists** -- key owners control exactly who can use their key in each group

## Deploying to Railway

The bot is designed to run 24/7 on [Railway](https://railway.com):

1. Push your code to a GitHub repo
2. Create a new Railway project and connect the repo
3. Add a **Volume** mounted at `/data` (for persistent API key storage)
4. Set environment variables:
   - `TELEGRAM_BOT_TOKEN` -- your bot token from [@BotFather](https://t.me/BotFather)
   - `DATA_DIR=/data` -- points key storage to the Railway volume
5. Deploy -- Railway auto-builds and starts the bot

The included `railway.json` handles build and start configuration automatically.

## Data Sources

- **[Nansen](https://nansen.ai)** -- Token info, holder flows, smart money DEX activity
- **[CoinGecko](https://coingecko.com)** -- Token resolution (symbol to address) and 24h price change

## Architecture

```
src/
├── index.ts              # Entry point
├── config.ts             # Env var loading
├── storage/
│   └── keyStore.ts       # Per-user API key persistence (JSON file)
├── security/
│   └── rateLimiter.ts    # Rate limiting + concurrent query guard
├── core/
│   ├── parser.ts         # Parse user input ($SYMBOL, 0x..., chain hints)
│   ├── resolver.ts       # Resolve symbol -> chain + address via CoinGecko
│   ├── lookup.ts         # Build token report (parallel API calls)
│   └── types.ts          # Shared interfaces
├── nansen/
│   ├── client.ts         # Nansen API client with retry logic
│   └── pool.ts           # NansenClient pool (one per API key)
└── platforms/
    ├── render.ts         # Format reports for Telegram HTML
    └── telegram.ts       # Grammy bot setup, commands, security checks
```

## License

MIT
