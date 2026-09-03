<div align="center">

# One endpoint for the x402 economy

**PulsRouter** routes paid-data requests to the cheapest healthy provider, settles in USDC from your Circle Agent Wallet, and falls over automatically. You write zero payment code.

</div>

| ⬡ Providers | ⛓ Chains | 💸 Price | 🛡 Budgets |
|:---:|:---:|:---:|:---:|
| built-in catalog + [Circle x402 Discovery](https://circle.com) | Arc testnet now · mainnet-ready | **$0.01**/query typical | daily caps, enforced pre-payment |

---

```bash
$ node src/index.js serve --port 3000
pulsrouter serving on http://localhost:3000
  GET  /registry   merged local + discovery provider catalog
  POST /proxy      body: {"type":"research","q":"fed rate cut"}
  GET  /health     { ok, wallets, pending }

$ curl -X POST localhost:3000/proxy -H 'content-type: application/json' \
      -d '{"type":"research","q":"fed rate cut"}'

$ node src/index.js pay research "fed rate decision"
routing "research" via cheapest healthy provider…
via    Puls Deep Research
price  0.01 USDC
{
  "paid": true,
  "count": 3,
  "settledTx": "0x9f2a…",
  "raw": { … }
}
```

*One call in, receipt + data out. The 402 dance, price comparison, retries, and budgets are PulsRouter's problem now.*

## Quick Start

Three commands to your first paid API call (< 5 min):

```bash
# 1 ─ scaffold pulsrouter.config.json
node src/index.js init

# 2 ─ set your agent wallet
#    edit wallets[0].address in the config, or just:
export WALLET=0xyouragentwallet        # PowerShell: $env:WALLET="0x…"

# 3 ─ first real payment (cheapest healthy provider for type "research")
node src/index.js pay research "arc ecosystem overview"
```

Prereqs: Node ≥ 18 and the [Circle CLI](https://circle.com) logged in (`circle wallet status`), with a little test USDC on the wallet. Everything defaults to ARC-TESTNET. Then `node src/index.js serve` for the HTTP API + Control Deck Dashboard at `http://localhost:3000`.

To run the standalone landing page: `npm run landing:dev`.

Full walkthrough: [`docs/guide.md`](docs/guide.md) · Endpoint details: [`docs/API.md`](docs/API.md)

## How It Works

```
 your app                    PulsRouter (:3000)                     x402 provider
    │                              │                                      │
    │  POST /proxy {type,q}        │                                      │
    ├─────────────────────────────►│  1. build catalog                    │
    │                              │     ├─ config localRows + registry.json
    │                              │     └─ Circle x402 Discovery API     │
    │                              │  2. route                            │
    │                              │     filter by type + chain           │
    │                              │     sort cheapest-first              │
    │                              │     enforce daily budget             │
    │                              │  3. pay (x402 / HTTP 402 flow)       │
    │                              ├─────────────────────────────────────►│
    │                              │◄── 402 + payment terms ──────────────┤
    │                              ├── USDC transfer · agent wallet ─────►│
    │                              │◄────────── 200 + data ───────────────┤
    │ ◄── {via, priceUsdc, result}─│  4. next candidate on failure        │
```

If the winner won't answer, routing walks down the price list. A spent-up budget yields no candidates at all — see [`docs/BUDGETS.md`](docs/BUDGETS.md).

## Catalog Preview

What `GET /registry` serves on a fresh checkout:

| Type | Provider | Price | Source |
|---|---|---:|---|
| `research` | Puls Deep Research | $0.0100 | local |
| `markets` | Puls Market Snapshot | $0.0100 | local |
| *…plus everything Circle Discovery knows for your chain* | | varies | `discovery` |

Add your own providers in seconds — a row is four fields:

```json
{ "type": "weather", "name": "SkyWire", "endpoint": "https://api.skywire.example/x402/today", "priceUsdc": 0.002 }
```

## Why not just…

| | Raw x402 client | Manual CLI calls | PulsRouter |
|---|---|---|---|
| Discover providers | you scrape/broker lists | you read docs by hand | ✅ merged catalog, auto-refreshed |
| Pick cheapest healthy | your code | your gut | ✅ sorted, failover built in |
| 402 negotiation + USDC settle | your crypto code | `circle services pay`, by hand, per call | ✅ one POST |
| Retries across providers | your loop | you, again | ✅ automatic walk down the list |
| Spend limits | your ledger | hope | ✅ daily caps enforced pre-payment |
| Audit trail | your logs | scrollback | ✅ `/health`, feed endpoint, dashboard Log tab |
| Code you write | hundreds of lines | every time, forever | **zero lines** |

## Repository Map

| Path | What |
|---|---|
| [`docs/API.md`](docs/API.md) | Every HTTP endpoint, live-tested request/response examples |
| [`docs/BUDGETS.md`](docs/BUDGETS.md) | Daily-cap semantics, recipes, gotchas |
| [`docs/guide.md`](docs/guide.md) | Zero → first payment walkthrough + troubleshooting |
| [`public/`](public/) | Control Deck (Dashboard) served on `http://localhost:3000/` |
| [`landing/`](landing/) | Standalone Vite marketing landing project (`npm run landing:dev`) |
| `pulsrouter.config.json` | The only thing you configure |

---

<div align="center">

**MIT** licensed — free, open source, self-hosted. No accounts, no cloud, no middleman.
⚠️ `/proxy` moves real money: keep budgets small until you trust your providers.

</div>
