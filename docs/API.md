# PulsRouter API Reference

Base URL: `http://localhost:PORT` (default port `3000`, override with `--port N` or `server.port` in config).

Every response is `application/json; charset=utf-8`. The server binds locally and has **no authentication** — anyone who can reach the port can trigger payments. Keep it on localhost or put your own auth in front.

> All examples below are **captured from a live server** (`node src/index.js serve --port 3910`) on a fresh checkout with the starter config (`wallets[0]` still a placeholder).

---

## GET /health

Liveness probe + configured-wallet summary.

```
GET /health
```

**Live response** — `200 OK`

```json
{ "ok": true, "wallets": [], "pending": null }
```

| Field | Type | Meaning |
|---|---|---|
| `ok` | `boolean` | Always `true` while the process serves. |
| `wallets` | `string[]` | Wallet addresses from config that look real (placeholder entries like `<your-agent-wallet>` are filtered out). Empty array ⇒ `/proxy` payments are disabled. |
| `pending` | `number \| null` | Count of `INITIATED` (unmined) transactions for the payer wallet. `null` when no wallet is configured or the Circle CLI lookup fails — health never throws because of it. |

---

## GET /registry

The unified provider catalog: inline config rows + local registry file + (optionally) Circle x402 Discovery, filtered to your configured chain. Endpoint duplicates are dropped, local rows win.

```
GET /registry
```

**Live response** — `200 OK` (starter config)

```json
{
  "registry": [
    {
      "type": "research",
      "name": "Puls Deep Research",
      "endpoint": "https://api.pulsmarket.tech/api/x402/research",
      "priceUsdc": 0.01,
      "source": "local"
    },
    {
      "type": "markets",
      "name": "Puls Market Snapshot",
      "endpoint": "https://api.pulsmarket.tech/api/x402/markets",
      "priceUsdc": 0.01,
      "source": "local"
    }
  ]
}
```

**Row schema**

| Field | Type | Meaning |
|---|---|---|
| `type` | `string` | Routing key used by `POST /proxy` and `pulsrouter pay`. Lowercased. |
| `name` | `string` | Display name (provider name + path for discovery rows). |
| `endpoint` | `string` | Fully-qualified x402 resource URL. Dedup key. |
| `priceUsdc` | `number` | Price per call in USDC. Discovery amounts arrive in base units and are divided by `1e6`. |
| `chain` | `string?` | Network id (`eip155:` prefix stripped). Present on discovery rows; omitted for chain-agnostic local rows. |
| `source` | `"local" \| "discovery"` | Where the row came from. |

Notes:

- Discovery is filtered by `cfg.chain` — e.g. `ARC-TESTNET` maps to EIP-155 id `5042002`, so only resources accepting that network survive.
- If the Discovery API is unreachable or slow (>5 s timeout), the registry degrades silently to local rows only.
- Wrong method ⇒ `405` (live): `{"error":"method not allowed — use GET /registry"}` with an `Allow: GET` header.

---

## POST /proxy

Route a request to the cheapest healthy provider for a data type and **pay it for real** from your agent wallet via the x402 flow.

```
POST /proxy
Content-Type: application/json

{"type": "research", "q": "fed rate cut"}
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `type` | `string` | yes | Data type to route. Matched case-insensitively against `registry[].type`. |
| `q` | `string` | no | Query passed to the provider as `?q=`. Trimmed and truncated to **512 chars**. |

### Success — `200 OK`

```jsonc
{
  "via": "Puls Deep Research",   // name of the provider that won
  "priceUsdc": 0.01,             // what the call cost
  "result": {                    // normalized receipt from the payment rail
    "paid": true,                // provider payload / payment confirmation
    "count": 3,                  // provider-dependent payload fields
    "settledTx": "0x…",          // settlement tx hash, when available
    "raw": { "...": "…" }        // untouched provider response
  }
}
```

`result` contents depend on the provider; `paid`, `count`, `settledTx`, `raw` are PulsRouter's normalization. A successful call also records the spend against the type's [daily budget](BUDGETS.md).

### Errors

Every failure mode, with live captures from the current build:

| Status | When | Live body |
|---|---|---|
| `400` | Body is not valid JSON | `{"error":"invalid JSON body — expected {\"type\":\"research\",\"q\":\"fed rate cut\"}"}` |
| `400` | `type` missing/empty | `{"error":"missing \"type\" field — expected {\"type\":\"research\",\"q\":\"...\"}"}` |
| `404` | No candidate for that type — includes unknown types **and** exhausted daily budgets | `{"error":"no provider for type \"weather\""}` |
| `502` | No wallet configured | `{"error":"no wallet configured — set wallets[0].address in pulsrouter.config.json or $WALLET"}` |
| `502` | Every candidate's payment/upstream attempt failed | `{"error":"all 2 provider(s) failed: <detail> \| <detail>"}` |
| `413` | Body over 1 MB | `{"error":"request body exceeds 1000000 bytes"}` |
| `405` | Non-POST method | `{"error":"method not allowed — use POST /proxy"}` with `Allow: POST` |

Routing order: filter by `type` → drop rows whose `chain` mismatches `cfg.chain` → sort cheapest-first → stop at the first budget-blocked point. Candidates are attempted in order until one pays; failures fall through to the next.

Unknown paths get `404 {"error":"not found: <METHOD> <path>"}`.

---

## GET /api/agents/feed

> **Planned endpoint** (contract below). On the current build it responds `404`:

**Live response** — `404 Not Found`

```json
{ "error": "not found: GET /api/agents/feed" }
```

Contract once shipped: a poll-able JSON array of routing decisions, newest last — one event per route pick, price quote, budget block, and settlement outcome. Intended shape:

```jsonc
[
  {
    "ts": 1756200000000,
    "kind": "route",              // route | budget | settle | error
    "type": "research",
    "provider": "Puls Deep Research",
    "priceUsdc": 0.01,
    "status": "settled"
  }
]
```

Until it lands, the public/dashboard.html Log tab keeps its own client-side audit trail, and `pending` in `/health` covers settlement visibility.

---

## Calling it from curl

macOS/Linux:

```bash
curl http://localhost:3000/health

curl -X POST http://localhost:3000/proxy \
  -H 'Content-Type: application/json' \
  -d '{"type":"research","q":"fed rate cut"}'
```

Windows PowerShell — inner quotes need escaping (bare `-d '{"type":…}'` loses them and yields a confusing `invalid JSON body`):

```powershell
curl.exe -X POST http://localhost:3000/proxy `
  -H 'Content-Type: application/json' `
  -d '{\"type\":\"research\",\"q\":\"fed rate cut\"}'
```

or pass a file, which avoids quoting entirely:

```powershell
'{"type":"research","q":"fed rate cut"}' | Set-Content body.json
curl.exe -X POST http://localhost:3000/proxy -H 'Content-Type: application/json' --data-binary @body.json
```
