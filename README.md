# FuelBook

Petrol Pump Management System — replaces the manual daily Excel workflow with a clean web app.
Tracks every rupee of money flow: sales → cash, digital, credit issued; outstanding received; expenses → closing cash. Auto-reconciles meter-method vs stock-method litres. Configurable payment channels and time slots. Role-based access (Owner / Manager / Staff) with per-permission toggles.

## Project layout

```
fuelbook/
├── backend/        # Express + TypeScript + Prisma + PostgreSQL  (port 4000)
├── frontend/       # Next.js 14 (App Router) admin panel         (port 3000)
└── docker-compose.yml   # Postgres for local dev
```

## Quick start (local dev)

You need Node 18+, npm, and either Docker or any Postgres 14+.

### 1. Start a Postgres

Either with Docker:

```bash
docker compose up -d
```

Or use a hosted Postgres (Neon / Supabase / Railway) — set the connection string in `backend/.env`.

### 2. Backend

```bash
cd backend
cp .env.example .env       # edit DATABASE_URL if needed
npm install
npx prisma migrate dev --name init
npm run seed               # seeds 1 pump, 5 tanks, 10 nozzles, channels, expense categories, sample customer
npm run dev                # http://localhost:4000
```

Default credentials seeded:

| Role     | Phone        | PIN  |
|----------|--------------|------|
| Owner    | 9000000001   | 1234 |
| Manager  | 9000000002   | 5678 |

### 3. Frontend

```bash
cd ../frontend
npm install
npm run dev                # http://localhost:3000
```

Sign in with the owner credentials above. The dashboard shows today's money flow once you create your first shift report.

## What's in v1 (built)

- **Backend**
  - Prisma schema for: pump, tanks, nozzles, fuel rates, users + per-permission toggles, shift reports, nozzle readings, stock entries, tanker receipts, payment channels (configurable), time slots (configurable), credit customers, **credit sales with split payment** (Vijay's case), outstanding received, expense categories, expense entries, audit log.
  - JWT auth (phone + PIN), bcrypt PIN hashing.
  - REST API: auth, shifts (full lifecycle + carry-forward + submit + lock), nozzle readings, stock, tanker receipts, payment collections, outstanding receipts, expense entries, credit sales, credit customers, fuel rates, expense categories, payment channels, time slots, users + permissions, dashboard, sales trend.
  - Reconciliation engine: meter vs stock litres, expected vs actual collections, closing-cash math.
  - Carry-forward: previous shift's closing reading → next shift's opening (per nozzle, per tank, per expense category, plus opening cash).

- **Frontend**
  - Login + role-aware admin shell with sidebar nav.
  - **Dashboard** — today's money flow reconciliation (where every rupee went), fuel sales by type, collections by channel, stock fill bars, outstanding total.
  - **Shift Reports list + new shift wizard** (auto carry-forward).
  - **Shift entry screen** with 7 tabs: Nozzle Readings, Stock + Tanker Receipts, Collections, Credit Sales (split-payment dialog), Outstanding Received, Expenses, Reconciliation.
  - Credit Customers list + ledger view.
  - Expense Categories management.
  - Fuel Rates with history.
  - Tanker Receipts global view.
  - Users + per-permission toggles (owner can grant managers exactly what they need).
  - Pump Setup view.

## Money + volume precision

- All money stored as `BigInt` paise (1 INR = 100 paise) → no float errors.
- All fuel volume stored as `BigInt` ml (1 L = 1000 ml).
- Conversion happens only at the UI boundary via `lib/utils.ts` (frontend) and `lib/money.ts` (backend).

## Reconciliation logic

```
Money in (expected)  = totalSales − creditIssued + outstandingReceived
Money in (actual)    = sum of all PaymentModeCollection amounts
Difference           = actual − expected     (should be ~₹0)

Closing cash         = openingCash
                     + (totalSales − creditIssued)
                     + outstandingReceived
                     − totalExpenses
```

Quantity check: meter-method litres (Σ nozzle closing − opening − testing) vs stock-method (Σ tank opening + purchase − closing). Discrepancy beyond pump-configurable threshold is flagged.

## What's next (v2 ideas)

- Excel export matching the legacy file layout (so accountant is comfortable).
- PDF print of a single shift.
- Date-range reports (P&L, expense trends, customer outstanding aging).
- Photo capture for credit sales (S3 + presigned URLs).
- Auto bill numbers (`FB-SHP-202605-0247` format).
- Multi-pump rollup (the schema supports it via `pumpId`; just need a pump-selector UI).
- Mobile PWA offline support.
- WhatsApp / SMS reminders on credit balances.
