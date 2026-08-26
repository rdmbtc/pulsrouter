# PulsRouter — User Guide

From zero to your first paid API call in under five minutes.

**Contents**

1. [What PulsRouter is](#1-what-pulsrouter-is)
2. [Prerequisites](#2-prerequisites)
3. [Install](#3-install)
4. [Configure](#4-configure)
5. [Run the server](#5-run-the-server)
6. [First payment](#6-first-payment)
7. [Budgets](#7-budgets)
8. [Wallet operations](#8-wallet-operations)
9. [Dashboard tour](#9-dashboard-tour)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. What PulsRouter is

PulsRouter is a local router for the **x402 economy** — APIs that charge per call in USDC via the HTTP `402 Payment Required` flow.

Instead of hard-coding provider URLs, prices, and payment code into your app, you send everything to one local endpoint:

```
POST http://localhost:3000/proxy   { "type": "research", "q": "arc ecosystem news" }
```

PulsRouter then:

1. **Builds the catalog** — merges the providers you listed in config with the wider ecosystem from Circle's x402 Discovery API.
2. **Routes cheapest-first** — filters by data type and chain, sorts by price, enforces your budget.
3. **Pays with your agent wallet** — performs the 402 negotiation and USDC settlement through the Circle CLI.
4. **Returns receipt + payload** — `{ via, priceUsdc, result }`, and logs the decision to `/api/agents/feed`.

If the cheapest provider fails, the router falls over to the next candidate automatically.

## 2. Prerequisites

| Requirement | Check |
|---|---|
| Node.js ≥ 18 | `node --version` |
| Circle CLI installed and logged in | `circle wallet status` |
| Test funds | A little USDC on your agent wallet (testnet faucet) |

The payer wallet is `wallets[0]` from your config (or the `WALLET` env var). Everything defaults to **ARC-TESTNET**, so test money only — but it *is* real settlement logic.

## 3. Install

PulsRouter has **zero npm dependencies** — clone and run:

```bash
git clone <your-fork-url> pulsrouter
cd pulsrouter
node src/index.js help        # sanity check: prints the command list
```

Available commands:

```
init      write starter config
serve     dashboard + GET /registry + POST /proxy
pay       pay the cheapest healthy provider for a type
balance   wallet balances
pending   INITIATED tx summary
status    circle session status
```

## 4. Configure

Generate the starter config:

```bash
node src/index.js init
```

This writes `pulsrouter.config.json` in the current directory (never overwrites an existing file). Open it and fill in the one required field:

```jsonc
{
  "chain": "ARC-TESTNET",                          // payments + discovery filter
  "wallets": [
    { "address": "<your-agent-wallet>", "label": "main" }   // ← PUT YOUR ADDRESS HERE
  ],
  "budgets": { "research": 5, "markets": 1 },      // USDC caps per type
  "registries": {
    "local": "./registry.json",                    // optional extra rows file
    "discovery": true,                             // pull Circle x402 Discovery
    "localRows": [                                 // inline providers
      { "type": "research", "name": "Puls Deep Research",
        "endpoint": "https://api.pulsmarket.tech/api/x402/research",
        "priceUsdc": 0.01 },
      { "type": "markets", "name": "Puls Market Snapshot",
        "endpoint": "https://api.pulsmarket.tech/api/x402/markets",
        "priceUsdc": 0.01 }
    ]
  },
  "rails": { "cli": true, "gateway": false },      // cli = Circle CLI rail
  "server": { "port": 3000 }
}
```

Field-by-field:

| Field | Meaning |
|---|---|
| `chain` | Chain used for payments and for filtering discovery results (`"discovery"` rows on other networks are dropped). Env override: `PULSROUTER_CHAIN`. |
| `wallets[]` | Agent wallets. Index `[0]` pays. If empty, falls back to env `WALLET`. |
| `budgets` | Map of `type → max USDC`. See [Budgets](#7-budgets). |
| `registries.localRows` | Providers always available, no network needed. `type` is the routing key, `priceUsdc` is what a call costs. |
| `registries.local` | Optional path to a JSON file holding more rows (a bare array or `{ "endpoints": [...] }`). |
| `registries.discovery` | `true` = merge Circle Discovery resources (filtered by `chain`). Set `false` to run fully offline. |
| `server.port` | HTTP port; `--port N` wins at runtime. |

Useful env vars:

```bash
PULSROUTER_CONFIG=/path/to/other.json   # use another config file
PULSROUTER_CHAIN=BASE-SEPOLIA           # override chain
WALLET=0xabc…                           # fallback payer address
```

## 5. Run the server

```bash
node src/index.js serve            # or: node src/index.js serve --port 8080
```

You should see:

```
pulsrouter serving on :3000  (POST /proxy {type,q})
```

Verify it's alive:

```bash
curl http://localhost:3000/health     # → { ok, uptimeSec, agentStack }
curl http://localhost:3000/registry   # → merged provider catalog
```

Open **`public/dashboard.html`** in a browser to get the visual control deck. Two ways to open it:

- **Recommended:** served by the router itself at `http://localhost:3000/` (same origin, no CORS involved), once your build serves `public/`.
- **Directly:** double-click `public/dashboard.html`. It will fetch `http://localhost:3000` cross-origin; if the server doesn't send CORS headers yet, use the served route instead.

## 6. First payment

Two equivalent ways to spend your first cent.

**Option A — CLI**

```bash
node src/index.js pay research "arc ecosystem overview"
```

**Option B — Dashboard**

1. Open the dashboard → **Pay** tab.
2. Type: `research` · Query: `arc ecosystem overview`.
3. Hit **PAY** and wait — on-chain settlement can take up to ~60 s.
4. The receipt panel fills with JSON; the Overview tab's *Tx Count* / *Volume* cards tick up.

A successful response looks like:

```jsonc
{
  "via": "Puls Deep Research",     // which provider won the auction
  "priceUsdc": 0.01,               // what it cost
  "result": {
    "ok": true,
    "settled": { "tx": "0x…" },    // settlement receipt (provider-dependent shape)
    "paid": { "…": "…" },          // parsed provider payload
    "count": 3
  }
}
```

✅ Zero→first-payment checklist: Node ≥ 18 ✓ · `circle wallet status` OK ✓ · wallet address in config ✓ · USDC balance > 0 ✓ · `serve` running ✓ · `pay research …` returns `"via"` ✓

## 7. Budgets

Budgets are **per-data-type spend caps in USDC**:

```json
"budgets": { "research": 5, "markets": 1 }
```

Semantics:

- Before offering candidates for a type, the router runs its budget check.
- **Exhausted budget ⇒ zero candidates** — the router refuses up front rather than letting a payment overdraft the cap. `POST /proxy` answers `404` ("no provider for type …") when nothing is affordable/allowed.
- Budgets are enforced *before* any candidate list is produced, so a blocked type never reaches a provider endpoint.

Raise/lower caps live by editing `budgets` and restarting `serve`. Keep small caps while testing; a runaway loop of `pay` calls drains real (test) USDC fast.

Tip: watch burn rate in the dashboard Log tab — every settled payment appears with its price.

## 8. Wallet operations

All read-only helpers go through the Circle CLI:

```bash
node src/index.js balance                 # balances of wallets[0]
node src/index.js balance 0xabc…          # explicit wallet
node src/index.js pending                 # count of INITIATED transactions
node src/index.js status                  # circle session status
```

`pending` is your friend after a failed-looking payment: transactions can sit in `INITIATED` while the network settles. Re-run `pending` in a minute before retrying, or you may pay twice for one answer.

## 9. Dashboard tour

`public/dashboard.html` — single file, vanilla JS, no build step. Polls the API every few seconds.

| Tab | What you see |
|---|---|
| **Overview** | Uptime, tx count & volume for this browser session, provider count, plus one card per agent wallet (address + balances when reported). |
| **Registry** | Every known provider — name, type chip, price, chain, source (`local` green / `discovery` pink) — with a live search filter. ↻ refresh pulls the catalog again. |
| **Pay** | The payment form (type dropdown auto-populated from the registry) and the raw receipt viewer. Button locks while the 402 dance settles. |
| **Log** | Scrolling audit trail of everything: boot, connections, feed decisions, pay attempts, errors. Newest first, RAW payloads expandable, unread badge on the tab. `Alt+1..4` switches tabs. |

Status pill top-right: **online** (green pulse) or **offline** (red) with a banner reminding you to start the server.

## 10. Troubleshooting

**`Cannot find module` / weird syntax error on startup**
Node < 18? Run `node --version`. PulsRouter needs ≥ 18 (uses `AbortSignal.timeout`, structured stdlib).

**`circle: command not found` / CLI not found**
The Circle CLI isn't on PATH (on Windows the router also looks for `%APPDATA%\npm\circle.cmd`). Install/login it first; verify with `circle wallet status`.

**Dashboard shows OFFLINE**
Server not started (`node src/index.js serve`) or wrong port. Opened as a file? The page fetches `http://localhost:3000` — if your server runs elsewhere, append `?api=http://localhost:PORT` to the page URL. If fetches fail cross-origin, serve the dashboard from the router instead of opening the file directly.

**`404 no provider for type "X"`**
No registry row has `type == X` (types are matched case-insensitively). Add a `localRows` entry or check `/registry`. Also happens when the budget for that type is exhausted.

**Registry looks empty / discovery rows missing**
Discovery is filtered by your configured `chain`; resources on other networks are dropped. Either align `chain`, add your own `localRows`, or set `"discovery": false` if you're fully offline.

**Payment hangs, then times out**
On-chain settlement legitimately takes tens of seconds. If `circle` subprocesses hang forever, check `circle status` manually — stale sessions block new calls.

**`payment rejected` in the result**
Usually insufficient USDC on the payer wallet, or a provider refused the offered amount. `balance`, then fund via faucet.

**Paid twice for one request?**
Check `pending` — the first attempt probably settled late (`INITIATED` → settled) after you retried. One request ⇒ one wait, no retries.

**Port already in use**
`node src/index.js serve --port 3001` (or change `server.port`).

**Wrong chain everywhere**
`PULSROUTER_CHAIN` env var overrides the config value — unset it if payments land on an unexpected network.

---

Still stuck? `GET /health` tells you if the server itself is fine, and `GET /api/agents/feed` shows exactly what the router decided and why. Both are visible live in the dashboard's Log tab.
