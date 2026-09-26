"use client";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

function Go({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-primary underline underline-offset-2">
      {children}
    </Link>
  );
}

function Item({
  n,
  title,
  optional,
  children,
}: {
  n: number | string;
  title: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
        {n}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{title}</span>
          {optional && <Badge variant="outline">Optional</Badge>}
        </div>
        <div className="space-y-1.5 text-sm text-slate-700">{children}</div>
      </div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      {children}
    </div>
  );
}

export default function WrittenGuide() {
  return (
    <div className="space-y-4">
      {/* -------------------------------- Part 1 -------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Part 1 — Setting up the pump (one time)</CardTitle>
          <CardDescription>
            Do this once. After it, every shift takes a few minutes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Item n={1} title="Pump details">
            <p>
              Fill in the pump name, address, city and state in{" "}
              <Go href="/settings/pump">Pump Setup</Go>. This is what prints on the statements you
              hand your credit customers.
            </p>
          </Item>
          <Item n={2} title="Tanks">
            <p>
              Add one entry per underground tank, with the fuel it holds — HSD, MS, MS Power, CNG.
              Stock, dip and every tanker load is tracked tank by tank, so two tanks of diesel are
              two entries, not one.
            </p>
          </Item>
          <Item n={3} title="Nozzles on each tank">
            <p>
              Add every nozzle and attach it to the tank it draws from. Sales are measured from
              nozzle meter readings, so a tank with no nozzle can never show a sale. Give each
              nozzle the code your staff already calls it by.
            </p>
          </Item>
          <Item n={4} title="Today's fuel rates">
            <p>
              Enter the current rate for every fuel you sell in{" "}
              <Go href="/rates">Fuel Rates</Go>. Litres sold times the rate is the sale value, so
              an unpriced fuel cannot be valued. When the oil company changes prices, record the
              change in <Go href="/pricing">Price Revisions</Go>.
            </p>
          </Item>
          <Item n={5} title="How customers pay you">
            <p>
              List your payment channels in <Go href="/settings/pump">Pump Setup</Go> — cash, card
              machine, UPI, bank deposit. At least one channel must be marked CASH, because that
              is the one the drawer is counted against. Card and UPI are reconciled separately
              later against what the bank actually credited.
            </p>
          </Item>
          <Item n={6} title="Shift time slots, tagged Day or Night">
            <p>
              If you collect money in blocks — 6am to 10am, 10am to 2pm, and so on — set those
              slots up and tag each one Day or Night. A slot tagged Night then never appears on a
              day shift. An untagged slot shows on both shifts, which is usually not what you
              want.
            </p>
          </Item>
          <Item n={7} title="Expense heads">
            <p>
              Set up the heads you spend under in <Go href="/expenses">Expense Categories</Go> —
              electricity, salary, tea, repairs, generator diesel. Every shift expense is filed
              under one of these, and the P&amp;L groups them the same way.
            </p>
          </Item>
          <Item n={8} title="Staff">
            <p>
              Add your attendants and cashiers in <Go href="/employees">Employees</Go>. Sales and
              cash are pinned to the attendant who worked each nozzle, so the names have to exist
              before the first shift.
            </p>
          </Item>

          <Separator />
          <p className="text-sm text-muted-foreground">
            The rest is optional. Skip it and the pump still runs — but each one buys you
            something.
          </p>

          <Item n={9} title="Credit customers and their vehicles" optional>
            <p>
              If you sell on udhaar, add the customer in{" "}
              <Go href="/credit">Credit Customers</Go>. One customer can hold many vehicles — a
              transporter with twelve trucks is one account with twelve vehicle numbers, and every
              credit sale names both the customer and the vehicle.
            </p>
          </Item>
          <Item n={10} title="Tank dip charts" optional>
            <p>
              Load the calibration chart for each tank in{" "}
              <Go href="/wet-stock">Wet Stock &amp; Testing</Go>. The chart turns a dipstick
              reading in centimetres into litres, which is what book-versus-dip variance needs.
            </p>
          </Item>
          <Item n={11} title="Bank account" optional>
            <p>
              Add your account in <Go href="/cash">Cash &amp; Bank</Go> so deposits can be
              recorded and card and UPI settlement can be matched against it.
            </p>
          </Item>
          <Item n={12} title="Licences and expiry dates" optional>
            <p>
              Record PESO, stamping, fire and pollution NOC with their expiry dates in{" "}
              <Go href="/compliance">Compliance &amp; Staff</Go>. A lapsed licence or an unstamped
              nozzle can stop you trading.
            </p>
          </Item>
          <Item n={13} title="Lubricants and other non-fuel lines" optional>
            <p>
              Add them in <Go href="/products">Lubes &amp; Non-Fuel</Go>. Fuel margin is fixed by
              the oil company; lubes are where the margin actually is.
            </p>
          </Item>
        </CardContent>
      </Card>

      {/* -------------------------------- Part 2 -------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Part 2 — Running a shift, in the order the screens are used
          </CardTitle>
          <CardDescription>
            From opening the shift to locking it. This is the daily routine.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Item n={1} title="Create the shift">
            <p>
              In <Go href="/shifts/new">Shift Reports</Go>, pick the date and whether it is the Day
              or the Night shift. That is all you enter by hand to start.
            </p>
          </Item>

          <Item n={2} title="What is already filled in for you">
            <p>A new shift does not start blank. It carries forward:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <span className="font-medium">Opening meter readings</span> — the closing readings
                of the previous shift.
              </li>
              <li>
                <span className="font-medium">Tank stock</span> — the closing stock of the previous
                shift becomes this shift&apos;s opening stock.
              </li>
              <li>
                <span className="font-medium">Expense opening balances</span> — carried over the
                same way.
              </li>
              <li>
                <span className="font-medium">The crew</span> — who worked which nozzle is copied
                from the last shift <span className="font-medium">of the same type</span>. A day
                shift copies the previous day shift, not last night&apos;s. Change whoever is not
                on duty today.
              </li>
            </ul>
          </Item>

          <Item n={3} title="Closing meter readings">
            <p>
              At shift end, enter the closing reading for every nozzle. Sales come out as{" "}
              <span className="font-mono text-xs">closing − opening − test litres</span>, so
              whatever you pump back into the measure during testing is not counted as a sale.
            </p>
          </Item>

          <Item n={4} title="Tank dips and stock">
            <p>
              Record the dip for each tank. With a dip chart loaded, the reading converts to
              litres, and the shift can then be compared against what the book says should be
              there.
            </p>
          </Item>

          <Item n={5} title="Tanker loads received">
            <p>
              If a tanker came in during the shift, record the load — the tank it went into and
              the quantity. It is also visible on its own in{" "}
              <Go href="/tanker-receipts">Tanker Receipts</Go>.
            </p>
          </Item>

          <Item n={6} title="Collections, per channel and per time slot">
            <p>
              Enter what came in, split by payment channel — cash, card, UPI, bank deposit — and by
              time slot if you use slots. Only slots tagged for this shift type show up here.
            </p>
          </Item>

          <Item n={7} title="Credit sales (udhaar)">
            <p>
              For every credit sale, name the customer and the vehicle. These are what later build
              the customer&apos;s statement and their outstanding balance.
            </p>
          </Item>

          <Item n={8} title="Expenses paid during the shift">
            <p>Each expense under one of your expense heads, with the amount.</p>
          </Item>

          <Item n={9} title="Weights &amp; Measures nozzle tests">
            <p>
              Record the test litres you drew for the 5-litre measure on each nozzle. Those litres
              are removed from sales, and the record is there when an inspector asks.
            </p>
          </Item>

          <Item n={10} title="Cash: drops during the shift, and the settlement at the end">
            <p>
              Staff do not have to hold cash to the end. They can hand it in{" "}
              <span className="font-medium">during</span> the shift, and each drop records the
              exact time and who took it — the cashier or the office safe.
            </p>
            <p>At shift end, each attendant&apos;s expected cash is:</p>
            <div className="rounded-md border bg-slate-50 p-3 font-mono text-xs">
              their nozzle sales − credit they gave − digital payments they took
            </div>
            <p>
              A shortfall is not written off as a loss. It becomes money that attendant owes, and
              it stays visible against their name.
            </p>
            <Note>
              Expenses an attendant paid out of the drawer are shown next to their settlement for
              context, but they are <span className="font-medium">not deducted</span> from the
              expected cash. That is deliberate: collections are recorded gross of expenses, so
              deducting them again would count the same money twice.
            </Note>
          </Item>

          <Item n={11} title="Submit, then Lock">
            <p>
              Submit saves the shift as complete. Then <span className="font-medium">Lock</span> —
              and locking is the moment that matters. Locking:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>freezes the shift so the figures cannot drift,</li>
              <li>updates every credit customer&apos;s balance,</li>
              <li>posts the shift into the double-entry ledger.</li>
            </ul>
            <p>
              It is reversible: unlocking posts mirror entries that cancel the original ones.
              Nothing is ever deleted, so the trail of what was posted and reversed stays intact.
            </p>
          </Item>
        </CardContent>
      </Card>

      {/* -------------------------------- Part 3 -------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Part 3 — Afterwards: where to look</CardTitle>
          <CardDescription>
            Once shifts are being locked, these are the screens you live in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-medium">
                <Go href="/reports">Reports</Go>
              </dt>
              <dd className="text-slate-700">
                Sales and expense analysis over any date range — by day, fuel, nozzle, attendant,
                channel and expense head.
              </dd>
            </div>
            <div>
              <dt className="font-medium">
                <Go href="/books">Books (Ledger)</Go>
              </dt>
              <dd className="text-slate-700">
                Trial balance, profit &amp; loss, balance sheet, and who owes what.
              </dd>
            </div>
            <div>
              <dt className="font-medium">
                <Go href="/cash">Cash &amp; Bank</Go>
              </dt>
              <dd className="text-slate-700">
                Where the cash physically is right now, and card and UPI settlement checked against
                what the bank actually credited.
              </dd>
            </div>
            <div>
              <dt className="font-medium">
                <Go href="/receivables">Statements &amp; Cheques</Go>
              </dt>
              <dd className="text-slate-700">
                Customer bills and statements, and bounced cheques.
              </dd>
            </div>
            <div>
              <dt className="font-medium">
                <Go href="/wet-stock">Wet Stock &amp; Testing</Go>
              </dt>
              <dd className="text-slate-700">
                Book stock against dip stock — the variance that tells you about leakage or a bad
                reading.
              </dd>
            </div>
            <div>
              <dt className="font-medium">
                <Go href="/compliance">Compliance &amp; Staff</Go>
              </dt>
              <dd className="text-slate-700">
                Licence expiry dates and daily staff attendance.
              </dd>
            </div>
          </dl>

          <Separator />

          <div className="space-y-3">
            <div className="text-sm font-medium">Two things to know about the books</div>
            <Note>
              <span className="font-medium">The ledger starts from your first locked shift.</span>{" "}
              Shifts from before that are not back-posted into the accounts. If you want the books
              to open with what you already own and are owed, post opening balances yourself from{" "}
              <Go href="/books/new-entry">Books</Go>.
            </Note>
            <Note>
              <span className="font-medium">
                Bank deposits, staff advances and cash sent to the bank are posted to the books on
                demand.
              </span>{" "}
              You run that posting yourself from <Go href="/books">Books</Go>. It is safe to run
              again and again — running it twice does not double the entries.
            </Note>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
