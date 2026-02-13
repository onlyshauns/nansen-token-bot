# Nansen Intern Bot

Multi-platform crypto intelligence bot powered by [Nansen](https://nansen.ai). Runs on **Telegram**, **Twitter/X**, and **Discord**.

Delivers on-chain token reports, smart money flow alerts, and whale activity -- all backed by real Nansen data.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)
![Telegram](https://img.shields.io/badge/Telegram-2CA5E0?logo=telegram&logoColor=white)
![Twitter](https://img.shields.io/badge/Twitter-000000?logo=x&logoColor=white)
![Discord](https://img.shields.io/badge/Discord-5865F2?logo=discord&logoColor=white)

## Platforms

### Telegram Bot
Interactive token lookup. Users set their own Nansen API key and query tokens directly.

```
Pepe (PEPE) -1.43% (24H)
ETHEREUM
CA: 0x6982508145454ce325ddbe47a25d4ec3d2311933

Price: $0.0000003760
Mcap: $1.58B | Vol: $726.5K | Liq: $15.13M
Age: 2y 10mo | Holders: 385,154

Holder Flows (24h)
Exchanges: $803.0K OUT (0.9x avg)
Top PnL Traders: $12.3K IN (0.9x avg)
Fresh Wallets: $257.6K IN (0.7x avg)

DEX Activity: $339.5K bought / $309.5K sold

Top Buyers
1. Wintermute Market Making -- $255.6K
2. DEX/CEX Trading Bot -- $34.2K

Top Sellers
1. MEV: Bot -- $102.6K
2. High Balance -- $62.1K
```

### Twitter/X Bot (@nansen_intern)
Autonomous on-chain analytics bot. Two modes:

**Scheduled tweets** -- Scans a watchlist of 30+ tokens, ranks by interest score, and tweets about the most notable smart money activity.

**Mention replies** -- Three-layer detection when someone @mentions the bot:

| Layer | Trigger | Example | Response |
|-------|---------|---------|----------|
| Token lookup | `$SYMBOL` or contract address | `@nansen_intern $HYPE` | Full token analysis reply |
| Keyword detection | Keyword + chain name | `What is smart money doing on Solana @nansen_intern` | Token analysis focused on the keyword angle |
| Product routing | Nansen product/feature question | `@nansen_intern where can I stake?` | Helpful reply with Nansen product link |

**Keywords detected:** smart money, whales, flows, holders, buying, selling, accumulating, dumping

**Products routed:** Staking, Research, Token God Mode, Smart Alerts, AI, Portfolio, Profiler, Screener, API, Points, Pricing, Trading

### Discord Bot
Token lookup via slash commands. Uses a shared Nansen API key set by the server admin.

## Setup

```bash
git clone https://github.com/onlyshauns/nansen-token-bot.git
cd nansen-token-bot
npm install
cp .env.example .env
# Edit .env -- see below for per-platform config
npm run dev
```

Each platform is optional. The bot starts whichever platforms have valid credentials in `.env`.

### Environment Variables

```bash
# Telegram (optional)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# Nansen API key (required for Twitter/Discord, optional for Telegram)
# Telegram users set their own key via /setkey
NANSEN_API_KEY=your_nansen_api_key

# Discord (optional)
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id

# Anthropic / Claude (required for Twitter, optional for Telegram personality)
ANTHROPIC_API_KEY=your_anthropic_api_key

# Twitter/X (optional)
TWITTER_API_KEY=your_twitter_api_key
TWITTER_API_SECRET=your_twitter_api_secret
TWITTER_ACCESS_TOKEN=your_twitter_access_token
TWITTER_ACCESS_SECRET=your_twitter_access_secret
TWITTER_TIER=free              # 'free' or 'basic'
TWITTER_SCAN_INTERVAL_HOURS=6  # How often to scan watchlist
TWITTER_MENTION_POLL_MINUTES=15
TWITTER_DRY_RUN=true           # Log tweets to console instead of posting
```

## Telegram Commands

| Command | Where | Description |
|---------|-------|-------------|
| `/start` | DM / Group | Welcome message and status |
| `/setkey <key>` | **DM only** | Set your Nansen API key |
| `/removekey` | DM / Group | Remove your stored key |
| `/token <query>` | DM / Group | Look up a token |
| `/dmonly` | DM | Toggle DM-only mode |
| `/mystats` | DM / Group | View your usage stats |
| `/allow` | **Group only** | Reply to grant group access to your key |
| `/revoke` | **Group only** | Reply to revoke group access |
| `/allowlist` | **Group only** | See who has access in this group |

### Querying Tokens
- `$PEPE` -- look up by symbol
- `$PEPE SOL` -- specify a chain
- `$ETH`, `$BTC`, `$SOL` -- native tokens
- `0x6982...` -- contract address
- `/token PEPE` -- command form

### Token Resolution

Symbols are resolved via **CoinGecko** first (free, no key needed). If CoinGecko doesn't list the token, the bot falls back to **Nansen's token screener** to find it -- so newer tokens like memecoins and recently launched projects that aren't on CoinGecko will still work.

### Supported Chains

| Chain | Alias | Native Token |
|-------|-------|--------------|
| Ethereum | `eth` | ETH |
| Solana | `sol` | SOL |
| Base | `base` | ETH |
| BNB Chain | `bnb`, `bsc` | BNB |
| Arbitrum | `arb` | ARB |
| Polygon | `poly` | POL |
| Optimism | `op` | OP |
| Avalanche | `avax` | AVAX |
| Tron | `tron` | TRX |
| Fantom | `ftm` | FTM |
| Blast | `blast` | ETH |
| Scroll | `scroll` | ETH |
| Linea | `linea` | ETH |
| Mantle | `mantle` | MNT |
| Ronin | `ronin` | RON |
| Sei | `sei` | SEI |
| zkSync | `zk`, `zksync` | ETH |
| Unichain | `unichain` | ETH |
| Sonic | `sonic` | S |
| HyperEVM | `hyperevm` | HYPE |
| NEAR | `near` | NEAR |
| Starknet | `stark` | STRK |
| Sui | `sui` | SUI |
| TON | `ton` | TON |
| Monad | `mon`, `monad` | MON |
| Plasma | `plasma` | ETH |
| IOTA EVM | `iota` | IOTA |

## Examples

### Telegram

**Input:** `$PEPE`

```
Pepe (PEPE) 🔴 -1.43% (24H)
🔗 Chain: ETH
CA: 0x6982508145454ce325ddbe47a25d4ec3d2311933

💰 Price: $0.000005123 (-1.43%)
🏛️ Mcap: $2.15B
📈 24h Vol: $726.5K
💧 Liq: $15.13M
🕒 Age: 2y 10mo
👥 Holders: 385,154

🔄 Holder Flows (24h)
🏦 Exchanges: $803.0K OUT ⬇️ (0.9x avg, 142w)
📈 Top PnL Traders: $12.3K IN ⬆️ (0.9x avg, 8w)
🆕 Fresh Wallets: $257.6K IN ⬆️ (0.7x avg, 53w)
💱 DEX Activity: 🟢 $339.5K bought / 🔴 $309.5K sold

🟢 Top Buyers
1. Wintermute Market Making — $255.6K
2. DEX/CEX Trading Bot — $34.2K

🔴 Top Sellers
1. MEV: Bot — $102.6K
2. High Balance — $62.1K

View on Nansen
```

**Input:** `$HYPE`

```
Hyperliquid (HYPE) 🟢 +4.21% (24H)
🔗 Chain: HYPE
CA: 0x...

💰 Price: $26.84 (+4.21%)
🏛️ Mcap: $8.96B
📈 24h Vol: $12.5M
💧 Liq: $6.42M
🕒 Age: 6mo
👥 Holders: 48,219

🔄 Holder Flows (24h)
🤓 Smart Traders: $1.2M IN ⬆️ (2.1x avg, 85w)
🐋 Whales: $3.4M OUT ⬇️ (1.5x avg, 12w)
🏦 Exchanges: $2.1M IN ⬆️ (1.8x avg, 201w)

🟢 Top Buyers
1. Smart Trader — $420.5K
2. All Time Smart Trader — $312.1K

🔴 Top Sellers
1. Whale — $1.2M
2. Fund — $890.3K

View on Nansen
```

**Input:** `$SOL` (native token)

```
Solana (SOL) 🟢 +2.15% (24H)
🔗 Chain: SOL
CA: so11111111111111111111111111111111111111112

💰 Price: $176.42 (+2.15%)
🏛️ Mcap: $85.6B
📈 24h Vol: $3.2M
💧 Liq: $45.2M

🔄 Holder Flows (24h)
🏦 Exchanges: $15.2M OUT ⬇️ (1.2x avg, 3201w)
🐋 Whales: $8.7M IN ⬆️ (1.8x avg, 45w)
🤓 Smart Traders: $2.1M IN ⬆️ (1.5x avg, 312w)

🟢 Top Buyers
1. Fund — $1.8M
2. All Time Smart Trader — $450.2K

View on Nansen
```

**Input:** `0x6982508145454ce325ddbe47a25d4ec3d2311933` (contract address)

Same output as `$PEPE` — the bot auto-detects chain from the address format.

### Twitter/X

**Scheduled tweet** (auto-generated from watchlist scan):

```
$HYPE | $26.84 (+4.21%)
Mcap: $8.96B
24h Vol: $12.5M
Liq: $6.42M

$HYPE flows (24h):
Smart Traders: $1.2M IN (2.1x avg)
Whales: $3.4M OUT (1.5x avg)
Exchanges: $2.1M IN (1.8x avg)
SM DEX: $420.5K bought / $312.1K sold (bullish)

$HYPE top buyers:
Smart Trader — $420.5K
All Time Smart Trader — $312.1K

Top sellers:
Whale — $1.2M
Fund — $890.3K
```

**Mention reply** — `@nansen_intern $PEPE`: Same token analysis as above, formatted as a tweet thread (≤280 chars per tweet).

**Keyword reply** — `@nansen_intern what are whales doing on Solana?`: Bot finds top-volume Solana token with whale activity and tweets the analysis.

**Product reply** — `@nansen_intern where can I see smart alerts?`: Bot replies with a link to the relevant Nansen product page.

### Discord

**Input:** `/token PEPE`

The bot replies with a rich embed containing the same data sections:

| Field | Value |
|-------|-------|
| **Title** | Pepe (PEPE) 🔴 -1.43% (24H) |
| **Chain** | ⬠ Ethereum |
| 💰 Price | $0.000005123 (-1.43%) |
| 🏛️ Mcap | $2.15B |
| 📈 24h Vol | $726.5K |
| 💧 Liq | $15.13M |
| 🕒 Age | 2y 10mo |
| 👥 Holders | 385,154 |
| 🔄 Holder Flows | Exchanges: $803.0K OUT ⬇️ (0.9x avg) |
| 🟢 Top Buyers | 1. Wintermute Market Making — $255.6K |
| 🔴 Top Sellers | 1. MEV: Bot — $102.6K |

### Group Chat (Telegram)

In group chats, mention the bot with a `$SYMBOL`:

**Input:** `Hey @NansenAssistantBot what do you think about $PENGU?`

The bot extracts `$PENGU`, ignores the conversational text, and replies with the full token analysis (same format as DM).

**Input:** `Hey @NansenAssistantBot how's the market?` (no `$SYMBOL`)

The bot replies with a witty AI-generated personality response (requires `ANTHROPIC_API_KEY`).

### Chain Hints

**Input:** `$PEPE SOL` — looks up PEPE on Solana (not Ethereum)

**Input:** `$USDC ARB` — looks up USDC on Arbitrum

**Input:** `$ETH BASE` — looks up WETH on Base

### Error Cases

**Input:** `$XYZNOTREAL`

```
❌ Could not look up 'XYZNOTREAL'
No token found matching 'XYZNOTREAL'
Try using the contract address directly.
```

**Input:** `$PEPE` (without API key set)

```
⚠️ No API key set. Send /setkey <your_key> in DM to get started.
```

## Testing

```bash
# Test mention parsing (no API keys needed)
npx tsx test-mentions.ts

# Test Twitter data pipeline (needs NANSEN_API_KEY)
npx tsx test-twitter.ts

# Test core pipeline (needs NANSEN_API_KEY)
npx tsx test-pipeline.ts

# Twitter dry run mode (logs tweets to console)
# Set TWITTER_DRY_RUN=true in .env
npm run dev
```

## Architecture

```
src/
├── index.ts              # Entry point -- starts enabled platforms
├── config.ts             # Environment variable loading
├── core/
│   ├── parser.ts         # Parse input ($SYMBOL, 0x..., keywords, products)
│   ├── resolver.ts       # Resolve symbol -> chain + address (CoinGecko + Nansen fallback)
│   ├── lookup.ts         # Build token reports (parallel API calls)
│   └── types.ts          # Shared interfaces
├── nansen/
│   ├── client.ts         # Nansen API client with retry logic
│   └── pool.ts           # NansenClient pool (one per API key)
├── llm/
│   ├── client.ts         # Anthropic/Claude API client
│   ├── personality.ts    # Telegram personality replies
│   ├── tweetPrompt.ts    # Twitter tweet generation (scheduled + replies)
│   └── rateLimiter.ts    # LLM rate limiting
├── twitter/
│   ├── watchlist.ts      # Token watchlist (30+ tokens)
│   ├── scanner.ts        # Watchlist scanner + interest scoring
│   ├── state.ts          # Tweet history + mention pagination state
│   └── rateLimiter.ts    # Twitter API rate limits (free/basic tiers)
├── security/
│   └── rateLimiter.ts    # Telegram per-user rate limiting
├── storage/
│   └── keyStore.ts       # Per-user API key persistence
└── platforms/
    ├── telegram.ts       # Grammy bot -- commands, security, groups
    ├── twitter.ts        # Twitter bot -- scheduled scans + mention replies
    ├── discord.ts        # Discord bot -- slash commands
    └── render.ts         # Format reports for each platform
```

## Security

- **API keys accepted via DM only** -- bot auto-deletes `/setkey` messages
- **Rate limiting** -- 10 queries/min, 30/hour per user (Telegram)
- **Concurrent guard** -- one query at a time per user
- **DM-only mode** -- lock your key to private chat
- **Per-group allowlists** -- key owners control access per group
- **Twitter tier limits** -- respects free/basic API rate limits

## Deploying to Railway

1. Push code to GitHub
2. Create a Railway project and connect the repo
3. Add a **Volume** mounted at `/data` (persistent key storage)
4. Set environment variables (see above)
5. Deploy -- Railway auto-builds and starts all configured platforms

## Data Sources

- **[Nansen](https://nansen.ai)** -- Token data, holder flows, smart money activity, exchange flows, token resolution fallback
- **[CoinGecko](https://coingecko.com)** -- Primary token resolution (symbol to address) and price data
- **[Anthropic Claude](https://anthropic.com)** -- Tweet generation and personality replies

## License

MIT
