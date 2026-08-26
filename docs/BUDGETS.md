# Budgets

PulsRouter enforces **daily USDC spend caps per data type**. A budget is checked *before* any provider is contacted, so an exhausted type simply routes nowhere — money never moves without an allowance.

## Configuring

Budgets live in `pulsrouter.config.json` under `budgets`, keyed by data type:

```jsonc
{
  "budgets": {
    "research": 5,      // max 5 USDC per UTC day on type "research"
    "markets": 1        // max 1 USDC per UTC day on type "markets"
  }
}
```

Apply changes by editing the file and restarting `pulsrouter serve`.

## How enforcement works

1. `POST /proxy` (or `pulsrouter pay`) builds the registry and filters candidates for your `type`.
2. **Before any offer is made**, each candidate passes through the budget check for that type. If today's ledger already shows the cap reached, routing stops immediately.
3. Result: zero candidates ⇒ the caller gets `404 {"error":"no provider for type \"…\""}` — the same response as an unknown type. Nothing is paid.
4. Only a **settled** payment is recorded against the ledger (`budgetSpend` runs after a successful 402 flow). Failed attempts, timeouts, and rejected quotes cost you nothing and count for nothing.

### Rules of the ledger

| Rule | Detail |
|---|---|
| Scope | One ledger entry per data type. |
| Window | UTC calendar day (`YYYY-MM-DD`); resets automatically at midnight UTC. |
| Missing cap / cap ≤ 0 | ⚠️ **Unlimited** — there is no way to say "block this type" via a zero cap. |
| Overshoot | At most **one call**: the check runs before the payment, so the last call under the cap can push total spend slightly past it (e.g. cap `0.05`, spent `0.048`, next call costs `0.01` → day ends at `0.058`). |
| Persistence | In-memory for v0.1 — **restarting the server resets today's counters**. Durable persistence is planned for v0.2. |
| Granularity | Per type, not per wallet or per provider — all wallets share the type's allowance. |

## Worked example

```json
"budgets": { "research": 5 }
```

With `Puls Deep Research` priced at `0.01 USDC`:

| Calls today | Ledger | Next `POST /proxy {type:"research"}` |
|---|---|---|
| 0–499 | `0.00 – 4.99` | ✅ pays |
| 500 | `5.00` | ❌ `404` — budget reached, nothing attempted |

The budget also bounds failover spending: if three providers can serve `research`, they draw from the *same* 5-USDC pool — retries can't multiply past the cap.

## Recipes

**Guardrail while testing** — tight cap, cheap type:

```json
"budgets": { "research": 0.05 }
```

**Unlimited type** — omit the key entirely (or set `<= 0`, same effect):

```json
"budgets": { "research": 5 }
```

**"Disable" a type** — a `0` cap means unlimited, so instead remove its providers:

- delete its `localRows` entries / registry-file rows, or
- set `"discovery": false` if discovery was its only source.

For a hard stop on *all* spending, unset the wallet — `/proxy` then answers `502 no wallet configured` before routing ever reaches a payment.

## Monitoring burn

- `GET /health` → `pending`: unmined settlements (a spike usually means retries stacking up).
- Dashboard Overview tab → session **Volume** card (client-side view).
- `GET /api/agents/feed` *(planned)* will expose per-decision events including budget blocks.

## Troubleshooting

**A type that worked this morning now returns 404**
Daily budget hit (or the server restarted *without* its rows configured — but check the budget first). Raise the cap or wait for the UTC rollover.

**I set `"research": 0` to pause spending and it got worse**
`0` (and any value ≤ 0) parses as *unlimited*. Remove the type's providers instead — see Recipes.

**Spend didn't stop exactly at my cap**
Expected: the pre-payment check allows one final call that may cross the line by a single price increment. Size caps with that in mind.

**Counters came back after I restarted the server**
v0.1 keeps the ledger in process memory by design; persistence lands in v0.2. Treat every restart as a fresh day.
