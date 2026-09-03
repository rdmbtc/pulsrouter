<div align="center">

<img src="assets/logo.png" width="90" alt="PulsRouter Logo" />

# PulsRouter

**One unified gateway for the x402 nanopayment economy.**

Route paid-data requests to the cheapest healthy provider, settle in USDC on **Arc Testnet** via **Circle Agent Wallets** or direct **MetaMask Web3**, and fail over automatically. Zero payment boilerplate required.

[![Tests](https://img.shields.io/badge/tests-54%20passed-brightgreen.svg)](https://github.com/rdmbtc/pulsrouter)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Network: Arc Testnet](https://img.shields.io/badge/network-Arc%20Testnet%20(5042002)-8A2BE2.svg)](https://testnet.arcscan.app)
[![Live Control Deck](https://img.shields.io/badge/live-x402.pulsmarket.tech-ff2e93.svg)](https://x402.pulsmarket.tech/dashboard)

[Live Control Deck](https://x402.pulsmarket.tech/dashboard) · [Landing Page](https://x402.pulsmarket.tech) · [API Documentation](docs/API.md) · [Guide](docs/guide.md) · [Budgets](docs/BUDGETS.md)

</div>

---

| ⬡ Providers | ⛓ Chains | 💸 Settle In | 🛡 Budgets & Dual Rails |
|:---:|:---:|:---:|:---:|
| Built-in catalog + [Circle Discovery](https://circle.com) | Arc Testnet (`5042002`) · Base · Mainnet-ready | **$0.01**/query typical (USDC) | Circle Agent Stack **+** MetaMask Web3 |

---

## ⚡ Live Deployments

* 🖥️ **Live Web Control Deck:** [https://x402.pulsmarket.tech/dashboard](https://x402.pulsmarket.tech/dashboard)
* 🚀 **Public Gateway Node:** `https://puls-e03f5aa20cb5.herokuapp.com`
* 🔍 **Arc Testnet Explorer:** [https://testnet.arcscan.app](https://testnet.arcscan.app) (`Chain ID: 5042002` / `0x4cefb2`)

---

## 📦 Quick Start (CLI & Local)

You can run PulsRouter directly with `npx` or install it globally:

```bash
# Run without installing
npx pulsrouter --help

# Or install globally
npm install -g pulsrouter
```

### 1. Initialize Configuration
```bash
pulsrouter init
```
Generates `pulsrouter.config.json` with pre-configured endpoints, daily budgets, and multi-agent wallet support.

### 2. Set Your Agent Wallet
Set your wallet address via environment variable or in `pulsrouter.config.json`:
```bash
export WALLET=0xyouragentwallet        # PowerShell: $env:WALLET="0x…"
```

### 3. Start the Router & Control Deck
```bash
pulsrouter serve --port 3000
```
Open **`http://localhost:3000`** to launch the interactive **Control Deck Dashboard**!

### 4. Route & Pay via CLI
```bash
# Query deep research (routes to cheapest provider, settles 0.01 USDC)
pulsrouter pay research "arc testnet ecosystem overview"

# Query prediction markets
pulsrouter pay markets "BTC"
```

---

## 🌐 Control Deck Features

The Control Deck dashboard is available on [x402.pulsmarket.tech/dashboard](https://x402.pulsmarket.tech/dashboard) and locally at `http://localhost:3000`:

* 🦊 **MetaMask Web3 Direct Settlement:**
  * One-click wallet connect via standard EIP-1193.
  * Auto-switch / add network prompt for **Arc Testnet** (`0x4cefb2` / `5042002`).
  * Live native USDC balance display (18 decimals).
  * Direct browser-initiated on-chain payment with instantaneous Arcscan transaction verification.
* 📦 **Instant Data Delivery (Receipt & Payload):**
  * When paying via MetaMask or Router, the receipt displays both the on-chain confirmation and the **full delivered information** (formatted research brief, cited sources cards, prediction market consensus).
  * Dual-tab toggle between **Delivered Data** and **Raw JSON**.
* 📋 **Interactive Provider Catalog (Registry):**
  * **Chain Filters:** Toggle between `ALL`, `ARC-TESTNET`, and `BASE`.
  * **Quick Sort:** Sort by `Price (Low → High / High → Low)`, `Chain`, `Name`, or `Type`.
  * **Clickable Column Headers:** Click any table column (`Provider`, `Type`, `Price`, `Chain`, `Source`) with directional sort indicators (`▲` / `▼`).
* 📜 **Real-time Event Feed & Audit Trail:**
  * Live telemetry for autonomous AI agent decisions, routing hops, payment proofs, and balance changes.

---

## 🛠️ CLI Command Reference

| Command | Description |
|---|---|
| `pulsrouter serve [--port 3000]` | Boots the HTTP gateway daemon + local Control Deck UI |
| `pulsrouter pay <type> <query>` | Routes to cheapest healthy provider, pays, and returns verified data |
| `pulsrouter list` | Displays active providers, prices, and chains from merged catalog |
| `pulsrouter advice [0xwallet]` | Analyzes wallet float, gas reserves, and recommends rebalancing |
| `pulsrouter health` | Inspects node status, agent stack wallets, and pending transactions |
| `pulsrouter init` | Scaffolds standard `pulsrouter.config.json` |

---

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

---

## 📡 Core Endpoints

#### `POST /proxy`
Executes an intelligent routed request.
```bash
curl -X POST https://puls-e03f5aa20cb5.herokuapp.com/proxy \
  -H 'Content-Type: application/json' \
  -d '{"type":"research","q":"arc testnet architecture"}'
```
*Supports optional `txHash` and `payer` parameters for MetaMask on-chain fulfillment.*

#### `GET /registry`
Returns the deduplicated, chain-aware provider catalog:
```json
{
  "registry": [
    {
      "name": "Puls Deep Research",
      "type": "research",
      "priceUsdc": 0.01,
      "chain": "ARC-TESTNET",
      "endpoint": "https://api.pulsmarket.tech/api/x402/research",
      "source": "local"
    }
  ]
}
```

#### `GET /health`
Returns gateway status, active agent stack wallets (`vega`, `atlas`, `sol`), uptime, and pending queue items.

#### `GET /api/agents/feed`
Returns the rolling audit trail of routing decisions, settlements, and failovers.

---

## 💻 Development & Testing

```bash
# Clone the repository
git clone https://github.com/rdmbtc/pulsrouter.git
cd pulsrouter

# Run automated tests (55 unit & integration tests)
npm test

# Run the landing & deck dev server
npm run landing:dev

# Build the landing project (Vite + Nitro)
npm run landing:build
```

---

## 📂 Repository Map

| Path | Description |
|---|---|
| [`docs/API.md`](docs/API.md) | Every HTTP endpoint, live-tested request/response examples |
| [`docs/BUDGETS.md`](docs/BUDGETS.md) | Daily-cap semantics, recipes, gotchas |
| [`docs/guide.md`](docs/guide.md) | Zero → first payment walkthrough + troubleshooting |
| [`public/`](public/) | Control Deck (Dashboard) served on `http://localhost:3000/` |
| [`landing/`](landing/) | Standalone Vite + React marketing landing and dashboard |
| [`src/`](src/) | Router engine, Circle CLI bridge, and HTTP server daemon |
| `pulsrouter.config.json` | The primary runtime configuration file |

---

<div align="center">

**MIT License** · Free, open source, and self-hostable.

*Built for the autonomous agent and micropayment economy on Arc.*

</div>
