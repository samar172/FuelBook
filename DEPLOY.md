# FuelBook — Deployment Runbook

How to deploy **FuelBook** (petrol-pump shift/credit/reconciliation app) — an Express +
TypeScript + Prisma API on the `saangri` server, and a Next.js frontend on Vercel. Same
pattern as the other apps on that box (JMS, vivaha, election, aadil-trade, trinity): backend
behind nginx + pm2 + Let's Encrypt, Postgres from the system server, frontend on Vercel.

> **Two things to know before you start:**
> 1. FuelBook's backend **defaults to port 4000, which is already taken** on saangri by
>    `saangri-api`. This deploy uses **port 4005** instead — set `PORT=4005` in the backend
>    `.env`. (FuelBook's own frontend `.env.example` points at a separate Azure box; we are
>    deliberately putting it on saangri with the other apps.)
> 2. The backend is **compiled with plain `tsc`** (`build` = `tsc` → `dist/server.js`, run
>    `node dist/server.js`). The `build` script does **not** run `prisma generate` — so the
>    deploy runs `prisma generate` and `prisma migrate deploy` as explicit steps.

---

## 0. Ground rules (read first)

- **Do not touch `saangri-api` or its database.** It is unrelated and lives on the same box.
- **Do not touch the JMS, vivaha, election, aadil-trade, or trinity apps**, their pm2
  processes, their databases, or their nginx sites. Only add new, `fuelbook`-prefixed
  resources.
- Everything this app introduces is namespaced `fuelbook` / `fuelbook-api` so it can't
  collide with what's already there.

### Server topology

| Thing            | Value                                                        |
|------------------|--------------------------------------------------------------|
| SSH              | `ssh saangri` → `98.70.37.83`                                |
| App root         | `/opt/apps/fuelbook` (to be created)                         |
| Node             | v20.20.2 at `/usr/bin/node` — **system-wide; no nvm on this box** |
| pm2              | 7.x (already on the box)                                     |
| Postgres         | system Postgres 16 on `127.0.0.1:5432`                       |
| Redis            | **not required** by this app                                 |
| nginx + certbot  | already used for the other apps via nip.io                   |

### Port map (do not reuse a taken port)

| App           | API port |
|---------------|----------|
| saangri-api   | 4000     |
| trinity-api   | 4001     |
| jms-api       | 4002     |
| election-api  | 4003     |
| vivaha-api    | 4004     |
| **fuelbook-api**| **4005** |
| aadil-api     | 4100     |

Backend listens on **4005** (its default 4000 is taken — you **must** override it). Confirm
4005 is free before you start: `ssh saangri 'sudo ss -ltnp | grep 4005'` should print nothing.

The API has no global prefix: health is `GET /health` (and `GET /` returns a JSON banner);
feature routes live under `/api/*` (`/api/auth`, `/api/shifts`, `/api/credit`, …).

---

## 1. Get the code onto the server

The repo already has a GitHub remote (`github.com/samar172/FuelBook`, branch `main`).

```bash
ssh saangri
sudo mkdir -p /opt/apps && sudo chown "$USER":"$USER" /opt/apps
cd /opt/apps
git clone https://github.com/samar172/FuelBook.git fuelbook
cd fuelbook
```

Later deploys are just `git pull` + the build/migrate/reload steps in §4–§6.

> rsync alternative (if you're deploying uncommitted local changes):
> ```bash
> # from /Users/samarbhati/Developer/FuelBook
> rsync -az --delete --exclude node_modules --exclude dist --exclude .next --exclude .git \
>   ./ saangri:/opt/apps/fuelbook/
> ```

---

## 2. PostgreSQL: database + role

Reuse the system Postgres on the box. Create a **dedicated** database and role — do not reuse
any other app's DB.

```bash
ssh saangri
sudo -u postgres psql <<'SQL'
CREATE ROLE fuelbook WITH LOGIN PASSWORD 'CHANGE_ME_STRONG';
CREATE DATABASE fuelbook OWNER fuelbook;
GRANT ALL PRIVILEGES ON DATABASE fuelbook TO fuelbook;
SQL
```

Connection string (localhost, so it never leaves the box):
```
postgresql://fuelbook:CHANGE_ME_STRONG@localhost:5432/fuelbook?schema=public
```

> The schema uses `BigInt` columns for money/volume (paise and millilitres). That's handled in
> app code — nothing special is needed at the DB level.

---

## 3. Backend environment (`/opt/apps/fuelbook/backend/.env`)

Copy `backend/.env.example` to `backend/.env` and fill it in. Production values:

```dotenv
# --- database (from §2) ---
DATABASE_URL="postgresql://fuelbook:CHANGE_ME_STRONG@localhost:5432/fuelbook?schema=public"

# --- auth: generate a real secret, do NOT ship the example one ---
JWT_SECRET="<paste output of: openssl rand -base64 48>"
JWT_EXPIRES_IN="12h"

# --- server ---
# 4000 is taken by saangri-api on this box — MUST be 4005 here.
PORT=4005
NODE_ENV="production"

# --- CORS: the deployed frontend origin(s) ---
# Comma-separated exact origins, or a wildcard suffix like *.vercel.app (which
# matches every Vercel preview + prod URL). Fill in after the Vercel deploy (§7).
FRONTEND_URL="https://<your-vercel-domain>.vercel.app,*.vercel.app"

# --- reconciliation thresholds (business tuning) ---
DISCREPANCY_ML_THRESHOLD=500
DISCREPANCY_PAISE_THRESHOLD=5000
```

Generate `JWT_SECRET` with `openssl rand -base64 48` — never deploy with the example string.
`FRONTEND_URL` supports a `*.vercel.app` wildcard, so listing it lets preview deployments work
too; keep your exact prod origin in there as well. Lock the file down: `chmod 600 backend/.env`.

---

## 4. Install deps + build (backend)

```bash
ssh saangri
cd /opt/apps/fuelbook
node -v                        # expect v20.x (system node; no nvm)

cd backend
npm ci                         # install deps
npx prisma generate            # build script is `tsc` only, so generate the client explicitly
npm run build                  # tsc -> dist/server.js
cd ..
```

The compiled entrypoint is `backend/dist/server.js` (`node dist/server.js`). The frontend is
**not** built on the server — Vercel builds it (§7).

---

## 5. Database migrations + seed

```bash
cd /opt/apps/fuelbook/backend

# apply all migrations to the fuelbook DB
npx prisma migrate deploy

# seed demo data (business, pump, tanks, base users) — uses tsx.
# Run ONCE on first setup; it upserts, but it also creates a sample pump you
# likely don't want in a clean production DB. Skip it if starting empty.
npm run seed
```

`migrate deploy` is safe to re-run on every deploy (it only applies pending migrations). The
seed is a one-time convenience for a demo dataset — for a real pump's data, skip it and create
the business/pump/users through the app instead.

### Migrations that need care (added 2026-09-26)

Two migrations change existing data. `migrate deploy` applies them in order and both are
safe to re-run, but know what they do before running them on a live pump's database:

| Migration | What it does |
|-----------|--------------|
| `20260926090000_add_vehicles_and_profiles` | Adds the `Vehicle` table and the new customer/staff profile columns. **Copies each customer's single `vehicleNo` into `Vehicle` as their primary vehicle, links past credit sales to the matching vehicle, and only then drops `CreditCustomer.vehicleNo`.** The backfill runs inside the migration, so no vehicle numbers are lost — but take a backup first (§9) because the column drop is irreversible. |
| `20260926100000_add_double_entry_ledger` | Adds the double-entry ledger (`LedgerAccount`, `JournalEntry`, `JournalLine`), `EmployeeCashHandover`, `TankInventoryState`, the `cashHandoverMode` pump setting, and employee-attribution columns on credit sales, collections and expenses. Purely additive — no existing data is rewritten. |

Take a backup immediately before the first of these, so there is a restore point:

```bash
ssh saangri
/opt/apps/_backups/backup-fuelbook.sh      # writes to /opt/apps/fuelbook/backups
cd /opt/apps/fuelbook/backend && npx prisma migrate deploy
```

**The ledger only starts recording once shifts are locked.** Existing locked shifts are NOT
back-posted — the journal begins from the first shift locked after this deploy. Accounts are
created automatically per pump (at pump creation, and lazily on first use), so no manual
chart-of-accounts setup is needed. Opening balances (cash in hand, what customers already owe,
fuel already in the tanks) are not invented: post them yourself as a manual journal entry from
**Books → Journal** if you want the balance sheet to reflect them.

---

## 6. Run it with pm2

Single long-running process; no workers, no cron, no WebSocket.

```bash
cd /opt/apps/fuelbook/backend
pm2 start "node dist/server.js" --name fuelbook-api --time
pm2 save                        # persist across reboots

pm2 logs fuelbook-api --lines 40   # confirm: "[fuelbook-api] listening on http://localhost:4005"
```

On later deploys, after `git pull` + `npm ci` (if deps changed) + `prisma generate` + build +
migrate:
```bash
pm2 restart fuelbook-api
```

> If pm2 can't find `node` under the raw name, use the absolute path:
> `pm2 start "$(which node) dist/server.js" --name fuelbook-api --time`.

---

## 7. nginx reverse proxy + HTTPS

Give the API a public HTTPS URL via nip.io + Let's Encrypt, same as the other apps. No
WebSocket, so it's a plain proxy.

Chosen hostname: **`fuelbook-api.98.70.37.83.nip.io`**

Create `/etc/nginx/sites-available/fuelbook-api`:

```nginx
server {
    listen 80;
    server_name fuelbook-api.98.70.37.83.nip.io;

    # Excel exports and JSON payloads; the app caps request bodies at 2mb.
    client_max_body_size 5m;

    location / {
        proxy_pass http://127.0.0.1:4005;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable it and issue the cert:

```bash
sudo ln -s /etc/nginx/sites-available/fuelbook-api /etc/nginx/sites-enabled/fuelbook-api
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d fuelbook-api.98.70.37.83.nip.io
sudo nginx -t && sudo systemctl reload nginx
```

API is then reachable at `https://fuelbook-api.98.70.37.83.nip.io` — health check:
```bash
curl -sS https://fuelbook-api.98.70.37.83.nip.io/health
```

---

## 8. Frontend on Vercel

The frontend (`frontend/`, Next.js 14) deploys to Vercel, same as the other web apps.

```bash
cd /Users/samarbhati/Developer/FuelBook/frontend
npx vercel --prod --yes
```

Set this environment variable in the Vercel project (Project → Settings → Environment
Variables), pointing at the API's public HTTPS host from §7. It's `NEXT_PUBLIC_*`, so it's
baked at build time — redeploy after changing it:

```
NEXT_PUBLIC_API_URL = https://fuelbook-api.98.70.37.83.nip.io
```

> **No `/api` suffix here** — the frontend's axios client adds the route paths itself
> (`/api/auth`, …). Set the bare API origin.

> **Flaky-deploy note (same as the other apps):** if Vercel returns `Not authorized` or
> `fetch failed`, it's usually transient — re-run `npx vercel --prod --yes`. Use Node 20 for
> the CLI.

### Close the loop: CORS

Once the Vercel domain is known, make sure it (or the `*.vercel.app` wildcard) is in the
backend `.env` `FRONTEND_URL` (§3) and restart the API:

```bash
ssh saangri
# edit /opt/apps/fuelbook/backend/.env -> FRONTEND_URL="https://<domain>.vercel.app,*.vercel.app"
pm2 restart fuelbook-api
```

The API rejects any browser origin not on this allow-list, so it must match the Vercel origin.

---

## 9. Daily database backup

Mirror the other apps. Create `/opt/apps/_backups/backup-fuelbook.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
STAMP="$(date +%F_%H%M)"
OUT="/opt/apps/fuelbook/backups"
mkdir -p "$OUT"
pg_dump "postgresql://fuelbook:CHANGE_ME_STRONG@localhost:5432/fuelbook" \
  | gzip > "$OUT/fuelbook_${STAMP}.sql.gz"
find "$OUT" -name 'fuelbook_*.sql.gz' -mtime +14 -delete   # keep 14 days
```

```bash
chmod +x /opt/apps/_backups/backup-fuelbook.sh
mkdir -p /opt/apps/fuelbook/logs
( crontab -l 2>/dev/null; echo "50 2 * * * /opt/apps/_backups/backup-fuelbook.sh >> /opt/apps/fuelbook/logs/backup.log 2>&1" ) | crontab -
```

Restore (only when needed):
```bash
gunzip -c /opt/apps/fuelbook/backups/fuelbook_<stamp>.sql.gz \
  | psql "postgresql://fuelbook:CHANGE_ME_STRONG@localhost:5432/fuelbook"
```

---

## 10. Redeploy checklist (steady state)

```bash
ssh saangri
cd /opt/apps/fuelbook
git pull
cd backend
npm ci                         # only if deps changed
npx prisma generate            # only if the schema/client changed (safe to run anyway)
npm run build                  # tsc -> dist/
npx prisma migrate deploy      # apply any new migrations
pm2 restart fuelbook-api
pm2 logs fuelbook-api --lines 30   # confirm clean boot on :4005
```

Frontend-only change? Just `cd frontend && npx vercel --prod --yes`.

---

## 11. Post-deploy verification

- [ ] `pm2 status` shows `fuelbook-api` **online**; logs say `listening ... :4005`.
- [ ] `curl https://fuelbook-api.98.70.37.83.nip.io/health` → `{"ok":true,...}`.
- [ ] Frontend loads on its Vercel URL and you can log in.
- [ ] No CORS errors in the browser console → `FRONTEND_URL` matches the Vercel origin.
- [ ] An Excel export downloads correctly (exercises the `/api/exports` route).
- [ ] Credit customers still show their vehicles (the migration backfill worked):
      `curl -s -H "Authorization: Bearer <token>" https://fuelbook-api.98.70.37.83.nip.io/api/credit/customers | head -c 400`
- [ ] After locking one shift, **Books → Trial Balance** reports `balanced: true`
      (`GET /api/ledger/trial-balance`). A `false` here means the books do not add up and
      wants investigating before more shifts are locked.
- [ ] Untouched: `saangri-api`, `jms-api`, `election-api`, `vivaha-api`, `aadil-api`,
      `trinity-api` all still online in `pm2 status`; their nginx sites and DBs unchanged.

---

## 12. What the app now covers

Deployed 2026-09-26. Each section is a page in the sidebar, backed by its own API prefix.

| Section | Route | API | What it does |
|---|---|---|---|
| Books (Ledger) | `/books` | `/api/ledger` | Double-entry ledger: trial balance, P&L, balance sheet, journal, per-account statements, who-owes-what. Entries post when a shift is LOCKED and reverse on unlock. |
| Cash & Bank | `/cash` | `/api/cash-bank` | Cash custody trail (attendant → cashier → safe → owner → bank), cash position, note counts, deposits, card/UPI settlement, bank-statement matching. |
| Wet Stock & Testing | `/wet-stock` | `/api/wet-stock` | Tank dip charts, dip/density/temperature log, W&M nozzle tests, book-vs-dip variance, tanker decantation and transit-loss claims. |
| Statements & Cheques | `/receivables` | `/api/credit-lifecycle` | Customer statements with due dates, ageing by due date, cheque register with bounce handling, payment reminder text. |
| Lubes & Non-Fuel | `/products` | `/api/products` | Lubricant/AdBlue/service catalogue, GST, weighted-average cost, stock and margin reports. |
| Price Revisions | `/pricing` | `/api/pricing` | Daily rate revisions with stock revaluation and margin per litre. |
| Compliance & Staff | `/compliance` | `/api/compliance` | Licence expiry calendar (PESO, W&M stamping, fire/pollution NOC…), attendance register, staff advances. |

### Two things to know about the accounting

1. **The ledger starts from the next locked shift.** Shifts locked before this deploy are
   not back-posted. Post opening balances (cash in hand, what customers already owe, fuel in
   the tanks) as a manual entry from **Books → New Entry** if you want the balance sheet to
   reflect them.
2. **Some activity posts on demand, not instantly.** Bank deposits, staff advances and
   cash moved to the bank are recorded by their own screens and turned into journal entries
   by `POST /api/ledger/post-pending` (owner only; `GET /api/ledger/pending` shows what is
   waiting). It is idempotent, so running it twice is harmless. Price revaluation is
   deliberately never posted — a selling-price change is not a realised gain until the fuel
   is sold.

---

## 13. Quick reference

| Item                | Value                                             |
|---------------------|---------------------------------------------------|
| App root            | `/opt/apps/fuelbook`                              |
| Backend entrypoint  | `backend/dist/server.js` (`node dist/server.js`)  |
| Backend port        | `4005` (default 4000 is taken — must override)    |
| pm2 process         | `fuelbook-api`                                     |
| Public API          | `https://fuelbook-api.98.70.37.83.nip.io`         |
| Health check        | `GET /health` (routes under `/api/*`)             |
| DB / role           | `fuelbook` / `fuelbook`                           |
| Redis               | not used                                          |
| Frontend            | Vercel (`npx vercel --prod --yes`)               |
| Frontend env        | `NEXT_PUBLIC_API_URL` = API origin (no `/api`)    |
| Backups             | `/opt/apps/_backups/backup-fuelbook.sh` (daily 02:50) |
