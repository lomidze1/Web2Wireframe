# Runbook — Deployment Security Requirements

> Trust-boundary assumptions our API relies on. Misconfigure these and a
> network-layer attacker can bypass IP allowlists, signature checks, or
> webhook authentication. Read before any infra change that touches the
> reverse-proxy chain.

---

## 1. Trust-proxy hop count

`packages/api/src/index.ts` calls `app.set("trust proxy", 1)`. This tells
Express to:

- Take the **last** entry in `X-Forwarded-For` as `req.ip`
- Treat `X-Forwarded-Proto` as authoritative for `req.secure`

This is **only safe when exactly one trusted reverse proxy sits in front
of the API.**

### Why it matters

The `flittIpAllowlist` middleware compares `req.ip` against the known
Flitt callback IPs. With one trusted hop:

```
[Internet] → [our TLS proxy] → [API]
              └─ sets X-Forwarded-For: <client-ip>
                 (the proxy strips any client-supplied X-Forwarded-For)
```

`req.ip` = the actual client IP. Allowlist works.

### Failure modes

**Zero hops (direct exposure):**
```
[Internet] → [API:3002]
```
An attacker sends `X-Forwarded-For: 54.154.216.60` and bypasses the
allowlist. The `req.ip` would be the attacker's socket IP, but Express
would override it with the spoofed header because `trust proxy = 1`
says "trust the last hop". **There is no last hop.**

Mitigation: in this topology, set `trust proxy = 0` and rely on
`req.socket.remoteAddress`. But the right fix is to add a reverse proxy.

**Two or more hops:**
```
[Internet] → [CDN/WAF] → [our TLS proxy] → [API]
              └─ adds X-Forwarded-For: <client>
                                       └─ appends X-Forwarded-For: <CDN-egress-ip>
```
With `trust proxy = 1`, Express trusts only the last entry — which is
the CDN's egress IP, not the client. Allowlist checks the CDN, not
attacker. An attacker with control of a request through the CDN can
spoof everything up to the second-to-last header.

Mitigation: set `trust proxy = N` where N = number of trusted hops
in front of the API. Document the topology.

---

## 2. Validating the current deployment

Before any production change, verify trust-proxy is correctly configured:

```bash
# Probe /api/debug/trust-proxy (if added) or check headers manually.
# The simplest verification: trigger a known Flitt-style webhook from
# an unexpected IP and observe whether it reaches the handler.

# From a control-plane host (allowed to hit production directly):
curl -X POST https://api.web2wireframe.design/api/webhooks/flitt \
  -H "Content-Type: application/json" \
  -H "X-Forwarded-For: 54.154.216.60" \
  -d '{}'
# Expected with FLITT_IP_ALLOWLIST_ENABLED=true and a correctly tuned
# trust-proxy: rejected, because the CDN's egress IP (which Express sees
# as the source) is NOT 54.154.216.60.
```

If the spoof succeeds, **trust-proxy is misconfigured** — increase
the hop count to match your actual topology.

---

## 3. Cloudflare / Vercel / etc. specifics

| Front-edge | hop count to set | Notes |
|------------|------------------|-------|
| Direct (no edge) | 0 | Not recommended; webhook IP allowlist is the only network-layer defense |
| Single nginx / Caddy in same VPC | 1 | Default. Matches our `trust proxy = 1`. |
| Cloudflare → nginx | 2 | Cloudflare sets `CF-Connecting-IP`; consider extracting from there instead |
| Vercel / Render / Fly | 1 (their proxy) | Verify with `req.ip` debug endpoint |
| AWS ALB → ECS | 1 (ALB) | ALB's `X-Forwarded-For` is appended; trust the last hop |

---

## 4. IP allowlist toggle policy

`FLITT_IP_ALLOWLIST_ENABLED` is **off by default**. Reasons:

1. Flitt's documented webhook IPs (`54.154.216.60`, `3.75.125.89`) can
   silently change during regional incidents. With the allowlist on,
   our handler returns 200 + drops the webhook (no Flitt retry storm)
   — which means we lose events we didn't know we lost.
2. The webhook signature check is the primary defense. IP allowlist is
   defense-in-depth, not primary.

**When to enable:** sustained signature-failure rate > 5%/hour from
non-Flitt IPs (visible in `/api/health/flitt` → `signatureFailures`).
Enable temporarily to filter the noise, then re-enable signature-only
once the noise stops.

To enable:
```bash
# In production .env
FLITT_IP_ALLOWLIST_ENABLED=true
# Override the default list if Flitt's IPs change:
FLITT_WEBHOOK_IPS=54.154.216.60,3.75.125.89,NEW.FLITT.IP.X
```

Restart the API to pick up. Verify by curling a known-bad IP:
```bash
curl -X POST https://api.web2wireframe.design/api/webhooks/flitt \
  -H "X-Forwarded-For: 1.2.3.4" -d '{}'
# Expected: 200 {"received":true} (silent drop — no Flitt retry)
# Logs should show: source IP not in Flitt allowlist
```

---

## 5. Webhook secret rotation overlap

When `FLITT_SECRET_KEY` rotates (see [`key-rotation.md`](./key-rotation.md)),
there's a brief window where signed-with-old-key webhooks may still arrive
in-flight from Flitt. Currently we treat them as signature failures and
silently drop (returning 200). For at-most-1-minute rotation overlaps
this is acceptable; longer overlaps need a dual-secret check (not
implemented).

---

## 6. CORS allow-list scope

`packages/api/src/index.ts` configures CORS per-router:

- **Plugin routes** (`/api/*`): allow `null` origin (Figma iframe) + the
  Figma host (`figma.com`).
- **Website routes** (`/web/*`): allow `web2wireframe.design` only.

If you add a new front-end origin (staging domain, preview deploy), add
it to `CORS_ORIGIN` env, not to the hard-coded list. Hard-coded entries
are intentionally minimal to keep the audit surface small.

---

## 7. Production secrets — fail-fast guards

`assertProductionSecrets` (in `src/config/startupChecks.ts`) refuses to
boot the API if any of these are missing or set to dev-prefix values:

- `AUTH_SECRET`, `SESSION_SECRET`, `ADMIN_TOKEN` (≥24 chars, no
  `change-me-`, `dev-`, etc.)

`assertProductionUrls` refuses to boot if any URL env var is non-HTTPS
or localhost in production:

- `API_PUBLIC_URL`, `WEBSITE_BASE_URL`

If you see "Refusing to start" in production logs, **don't bypass it**.
Generate strong secrets: `openssl rand -hex 32` per variable.

---

## See also

- [`refund.md`](./refund.md)
- [`key-rotation.md`](./key-rotation.md)
- [`billing-faq.md`](./billing-faq.md)
- [`backup-restore.md`](./backup-restore.md)
