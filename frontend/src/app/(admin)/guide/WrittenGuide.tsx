"use client";
import Link from "next/link";
import { Fragment } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n";

function Go({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-primary underline underline-offset-2">
      {children}
    </Link>
  );
}

/**
 * Fills {name} placeholders in an already-translated string with React nodes (links),
 * so a sentence can hold a link at whatever position the Hindi word order needs.
 */
function rich(text: string, slots: Record<string, React.ReactNode>): React.ReactNode {
  const parts = text.split(/(\{\w+\})/g);
  return parts.map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    if (m && Object.prototype.hasOwnProperty.call(slots, m[1])) {
      return <Fragment key={i}>{slots[m[1]]}</Fragment>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
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
  const { t } = useT();
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
        {n}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{title}</span>
          {optional && <Badge variant="outline">{t("guide.optional", "Optional")}</Badge>}
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
  const { t } = useT();

  // Link labels reuse the sidebar wording so the guide and the menu always agree.
  const pumpSetup = <Go href="/settings/pump">{t("nav.pumpSetup", "Pump Setup")}</Go>;
  const shifts = <Go href="/shifts/new">{t("nav.shifts", "Shift Reports")}</Go>;
  const cash = <Go href="/cash">{t("nav.cash", "Cash & Bank")}</Go>;
  const compliance = <Go href="/compliance">{t("nav.compliance", "Compliance & Staff")}</Go>;
  const wetStock = <Go href="/wet-stock">{t("nav.wetStock", "Wet Stock & Testing")}</Go>;

  return (
    <div className="space-y-4">
      {/* -------------------------------- Part 1 -------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("guide.part1Title", "Part 1 — Setting up the pump (one time)")}
          </CardTitle>
          <CardDescription>
            {t("guide.part1Desc", "Do this once. After it, every shift takes a few minutes.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Item n={1} title={t("guide.p1s1Title", "Pump details")}>
            <p>
              {rich(
                t(
                  "guide.p1s1Body",
                  "Fill in the pump name, address, city and state in {pumpSetup}. This is what prints on the statements you hand your credit customers."
                ),
                { pumpSetup }
              )}
            </p>
          </Item>
          <Item n={2} title={t("guide.p1s2Title", "Tanks")}>
            <p>
              {t(
                "guide.p1s2Body",
                "Add one entry per underground tank, with the fuel it holds — HSD, MS, MS Power, CNG. Stock, dip and every tanker load is tracked tank by tank, so two tanks of diesel are two entries, not one."
              )}
            </p>
          </Item>
          <Item n={3} title={t("guide.p1s3Title", "Nozzles on each tank")}>
            <p>
              {t(
                "guide.p1s3Body",
                "Add every nozzle and attach it to the tank it draws from. Sales are measured from nozzle meter readings, so a tank with no nozzle can never show a sale. Give each nozzle the code your staff already calls it by."
              )}
            </p>
          </Item>
          <Item n={4} title={t("guide.p1s4Title", "Today's fuel rates")}>
            <p>
              {rich(
                t(
                  "guide.p1s4Body",
                  "Enter the current rate for every fuel you sell in {rates}. Litres sold times the rate is the sale value, so an unpriced fuel cannot be valued. When the oil company changes prices, record the change in {pricing}."
                ),
                {
                  rates: <Go href="/rates">{t("nav.rates", "Fuel Rates")}</Go>,
                  pricing: <Go href="/pricing">{t("nav.pricing", "Price Revisions")}</Go>,
                }
              )}
            </p>
          </Item>
          <Item n={5} title={t("guide.p1s5Title", "How customers pay you")}>
            <p>
              {rich(
                t(
                  "guide.p1s5Body",
                  "List your payment channels in {pumpSetup} — cash, card machine, UPI, bank deposit. At least one channel must be marked CASH, because that is the one the drawer is counted against. Card and UPI are reconciled separately later against what the bank actually credited."
                ),
                { pumpSetup }
              )}
            </p>
          </Item>
          <Item n={6} title={t("guide.p1s6Title", "Shift time slots, tagged Day or Night")}>
            <p>
              {t(
                "guide.p1s6Body",
                "If you collect money in blocks — 6am to 10am, 10am to 2pm, and so on — set those slots up and tag each one Day or Night. A slot tagged Night then never appears on a day shift. An untagged slot shows on both shifts, which is usually not what you want."
              )}
            </p>
          </Item>
          <Item n={7} title={t("guide.p1s7Title", "Expense heads")}>
            <p>
              {rich(
                t(
                  "guide.p1s7Body",
                  "Set up the heads you spend under in {expenses} — electricity, salary, tea, repairs, generator diesel. Every shift expense is filed under one of these, and the P&L groups them the same way."
                ),
                { expenses: <Go href="/expenses">{t("nav.expenses", "Expense Categories")}</Go> }
              )}
            </p>
          </Item>
          <Item n={8} title={t("guide.p1s8Title", "Staff")}>
            <p>
              {rich(
                t(
                  "guide.p1s8Body",
                  "Add your attendants and cashiers in {employees}. Sales and cash are pinned to the attendant who worked each nozzle, so the names have to exist before the first shift."
                ),
                { employees: <Go href="/employees">{t("nav.employees", "Employees")}</Go> }
              )}
            </p>
          </Item>

          <Separator />
          <p className="text-sm text-muted-foreground">
            {t(
              "guide.restIsOptional",
              "The rest is optional. Skip it and the pump still runs — but each one buys you something."
            )}
          </p>

          <Item n={9} title={t("guide.p1s9Title", "Credit customers and their vehicles")} optional>
            <p>
              {rich(
                t(
                  "guide.p1s9Body",
                  "If you sell on udhaar, add the customer in {credit}. One customer can hold many vehicles — a transporter with twelve trucks is one account with twelve vehicle numbers, and every credit sale names both the customer and the vehicle."
                ),
                { credit: <Go href="/credit">{t("nav.credit", "Credit Customers")}</Go> }
              )}
            </p>
          </Item>
          <Item n={10} title={t("guide.p1s10Title", "Tank dip charts")} optional>
            <p>
              {rich(
                t(
                  "guide.p1s10Body",
                  "Load the calibration chart for each tank in {wetStock}. The chart turns a dipstick reading in centimetres into litres, which is what book-versus-dip variance needs."
                ),
                { wetStock }
              )}
            </p>
          </Item>
          <Item n={11} title={t("guide.p1s11Title", "Bank account")} optional>
            <p>
              {rich(
                t(
                  "guide.p1s11Body",
                  "Add your account in {cash} so deposits can be recorded and card and UPI settlement can be matched against it."
                ),
                { cash }
              )}
            </p>
          </Item>
          <Item n={12} title={t("guide.p1s12Title", "Licences and expiry dates")} optional>
            <p>
              {rich(
                t(
                  "guide.p1s12Body",
                  "Record PESO, stamping, fire and pollution NOC with their expiry dates in {compliance}. A lapsed licence or an unstamped nozzle can stop you trading."
                ),
                { compliance }
              )}
            </p>
          </Item>
          <Item n={13} title={t("guide.p1s13Title", "Lubricants and other non-fuel lines")} optional>
            <p>
              {rich(
                t(
                  "guide.p1s13Body",
                  "Add them in {products}. Fuel margin is fixed by the oil company; lubes are where the margin actually is."
                ),
                { products: <Go href="/products">{t("nav.products", "Lubes & Non-Fuel")}</Go> }
              )}
            </p>
          </Item>
        </CardContent>
      </Card>

      {/* -------------------------------- Part 2 -------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("guide.part2Title", "Part 2 — Running a shift, in the order the screens are used")}
          </CardTitle>
          <CardDescription>
            {t("guide.part2Desc", "From opening the shift to locking it. This is the daily routine.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Item n={1} title={t("guide.p2s1Title", "Create the shift")}>
            <p>
              {rich(
                t(
                  "guide.p2s1Body",
                  "In {shifts}, pick the date and whether it is the Day or the Night shift. That is all you enter by hand to start."
                ),
                { shifts }
              )}
            </p>
          </Item>

          <Item n={2} title={t("guide.p2s2Title", "What is already filled in for you")}>
            <p>{t("guide.p2s2Body", "A new shift does not start blank. It carries forward:")}</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <span className="font-medium">
                  {t("guide.p2s2Item1Label", "Opening meter readings")}
                </span>
                {t("guide.p2s2Item1", " — the closing readings of the previous shift.")}
              </li>
              <li>
                <span className="font-medium">{t("guide.p2s2Item2Label", "Tank stock")}</span>
                {t(
                  "guide.p2s2Item2",
                  " — the closing stock of the previous shift becomes this shift's opening stock."
                )}
              </li>
              <li>
                <span className="font-medium">
                  {t("guide.p2s2Item3Label", "Expense opening balances")}
                </span>
                {t("guide.p2s2Item3", " — carried over the same way.")}
              </li>
              <li>
                <span className="font-medium">{t("guide.p2s2Item4Label", "The crew")}</span>
                {t("guide.p2s2Item4a", " — who worked which nozzle is copied from the last shift ")}
                <span className="font-medium">{t("guide.p2s2Item4b", "of the same type")}</span>
                {t(
                  "guide.p2s2Item4c",
                  ". A day shift copies the previous day shift, not last night's. Change whoever is not on duty today."
                )}
              </li>
            </ul>
          </Item>

          <Item n={3} title={t("guide.p2s3Title", "Closing meter readings")}>
            <p>
              {t(
                "guide.p2s3Body1",
                "At shift end, enter the closing reading for every nozzle. Sales come out as "
              )}
              <span className="font-mono text-xs">
                {t("guide.p2s3Formula", "closing − opening − test litres")}
              </span>
              {t(
                "guide.p2s3Body2",
                ", so whatever you pump back into the measure during testing is not counted as a sale."
              )}
            </p>
          </Item>

          <Item n={4} title={t("guide.p2s4Title", "Tank dips and stock")}>
            <p>
              {t(
                "guide.p2s4Body",
                "Record the dip for each tank. With a dip chart loaded, the reading converts to litres, and the shift can then be compared against what the book says should be there."
              )}
            </p>
          </Item>

          <Item n={5} title={t("guide.p2s5Title", "Tanker loads received")}>
            <p>
              {rich(
                t(
                  "guide.p2s5Body",
                  "If a tanker came in during the shift, record the load — the tank it went into and the quantity. It is also visible on its own in {tankers}."
                ),
                { tankers: <Go href="/tanker-receipts">{t("nav.tankers", "Tanker Receipts")}</Go> }
              )}
            </p>
          </Item>

          <Item n={6} title={t("guide.p2s6Title", "Collections, per channel and per time slot")}>
            <p>
              {t(
                "guide.p2s6Body",
                "Enter what came in, split by payment channel — cash, card, UPI, bank deposit — and by time slot if you use slots. Only slots tagged for this shift type show up here."
              )}
            </p>
          </Item>

          <Item n={7} title={t("guide.p2s7Title", "Credit sales (udhaar)")}>
            <p>
              {t(
                "guide.p2s7Body",
                "For every credit sale, name the customer and the vehicle. These are what later build the customer's statement and their outstanding balance."
              )}
            </p>
          </Item>

          <Item n={8} title={t("guide.p2s8Title", "Expenses paid during the shift")}>
            <p>{t("guide.p2s8Body", "Each expense under one of your expense heads, with the amount.")}</p>
          </Item>

          <Item n={9} title={t("guide.p2s9Title", "Weights & Measures nozzle tests")}>
            <p>
              {t(
                "guide.p2s9Body",
                "Record the test litres you drew for the 5-litre measure on each nozzle. Those litres are removed from sales, and the record is there when an inspector asks."
              )}
            </p>
          </Item>

          <Item
            n={10}
            title={t("guide.p2s10Title", "Cash: drops during the shift, and the settlement at the end")}
          >
            <p>
              {t("guide.p2s10Body1a", "Staff do not have to hold cash to the end. They can hand it in ")}
              <span className="font-medium">{t("guide.p2s10During", "during")}</span>
              {t(
                "guide.p2s10Body1b",
                " the shift, and each drop records the exact time and who took it — the cashier or the office safe."
              )}
            </p>
            <p>{t("guide.p2s10Body2", "At shift end, each attendant's expected cash is:")}</p>
            <div className="rounded-md border bg-slate-50 p-3 font-mono text-xs">
              {t(
                "guide.p2s10Formula",
                "their nozzle sales − credit they gave − digital payments they took"
              )}
            </div>
            <p>
              {t(
                "guide.p2s10Body3",
                "A shortfall is not written off as a loss. It becomes money that attendant owes, and it stays visible against their name."
              )}
            </p>
            <Note>
              {t(
                "guide.p2s10Note1",
                "Expenses an attendant paid out of the drawer are shown next to their settlement for context, but they are "
              )}
              <span className="font-medium">{t("guide.p2s10NotDeducted", "not deducted")}</span>
              {t(
                "guide.p2s10Note2",
                " from the expected cash. That is deliberate: collections are recorded gross of expenses, so deducting them again would count the same money twice."
              )}
            </Note>
          </Item>

          <Item n={11} title={t("guide.p2s11Title", "Submit, then Lock")}>
            <p>
              {t("guide.p2s11Body1", "Submit saves the shift as complete. Then ")}
              <span className="font-medium">{t("guide.p2s11Lock", "Lock")}</span>
              {t("guide.p2s11Body2", " — and locking is the moment that matters. Locking:")}
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>{t("guide.p2s11Item1", "freezes the shift so the figures cannot drift,")}</li>
              <li>{t("guide.p2s11Item2", "updates every credit customer's balance,")}</li>
              <li>{t("guide.p2s11Item3", "posts the shift into the double-entry ledger.")}</li>
            </ul>
            <p>
              {t(
                "guide.p2s11Body3",
                "It is reversible: unlocking posts mirror entries that cancel the original ones. Nothing is ever deleted, so the trail of what was posted and reversed stays intact."
              )}
            </p>
          </Item>
        </CardContent>
      </Card>

      {/* -------------------------------- Part 3 -------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("guide.part3Title", "Part 3 — Afterwards: where to look")}
          </CardTitle>
          <CardDescription>
            {t("guide.part3Desc", "Once shifts are being locked, these are the screens you live in.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-medium">
                <Go href="/reports">{t("nav.reports", "Reports")}</Go>
              </dt>
              <dd className="text-slate-700">
                {t(
                  "guide.p3Reports",
                  "Sales and expense analysis over any date range — by day, fuel, nozzle, attendant, channel and expense head."
                )}
              </dd>
            </div>
            <div>
              <dt className="font-medium">
                <Go href="/books">{t("nav.books", "Books (Ledger)")}</Go>
              </dt>
              <dd className="text-slate-700">
                {t("guide.p3Books", "Trial balance, profit & loss, balance sheet, and who owes what.")}
              </dd>
            </div>
            <div>
              <dt className="font-medium">
                <Go href="/cash">{t("nav.cash", "Cash & Bank")}</Go>
              </dt>
              <dd className="text-slate-700">
                {t(
                  "guide.p3Cash",
                  "Where the cash physically is right now, and card and UPI settlement checked against what the bank actually credited."
                )}
              </dd>
            </div>
            <div>
              <dt className="font-medium">
                <Go href="/receivables">{t("nav.receivables", "Statements & Cheques")}</Go>
              </dt>
              <dd className="text-slate-700">
                {t("guide.p3Receivables", "Customer bills and statements, and bounced cheques.")}
              </dd>
            </div>
            <div>
              <dt className="font-medium">
                <Go href="/wet-stock">{t("nav.wetStock", "Wet Stock & Testing")}</Go>
              </dt>
              <dd className="text-slate-700">
                {t(
                  "guide.p3WetStock",
                  "Book stock against dip stock — the variance that tells you about leakage or a bad reading."
                )}
              </dd>
            </div>
            <div>
              <dt className="font-medium">
                <Go href="/compliance">{t("nav.compliance", "Compliance & Staff")}</Go>
              </dt>
              <dd className="text-slate-700">
                {t("guide.p3Compliance", "Licence expiry dates and daily staff attendance.")}
              </dd>
            </div>
          </dl>

          <Separator />

          <div className="space-y-3">
            <div className="text-sm font-medium">
              {t("guide.twoThings", "Two things to know about the books")}
            </div>
            <Note>
              <span className="font-medium">
                {t("guide.ledgerStartsLabel", "The ledger starts from your first locked shift.")}
              </span>
              {rich(
                t(
                  "guide.ledgerStartsBody",
                  " Shifts from before that are not back-posted into the accounts. If you want the books to open with what you already own and are owed, post opening balances yourself from {booksNew}."
                ),
                { booksNew: <Go href="/books/new-entry">{t("guide.linkBooks", "Books")}</Go> }
              )}
            </Note>
            <Note>
              <span className="font-medium">
                {t(
                  "guide.onDemandLabel",
                  "Bank deposits, staff advances and cash sent to the bank are posted to the books on demand."
                )}
              </span>
              {rich(
                t(
                  "guide.onDemandBody",
                  " You run that posting yourself from {books}. It is safe to run again and again — running it twice does not double the entries."
                ),
                { books: <Go href="/books">{t("guide.linkBooks", "Books")}</Go> }
              )}
            </Note>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
