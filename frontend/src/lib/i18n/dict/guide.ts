// guide screens. Keys are "guide.*". See docs/hindi-glossary.md for the agreed wording.
//
// This is the biggest block of prose in the app. The Hindi is written as instructions a
// pump owner would actually follow, not a word-for-word rendering — but every caveat in
// the English is kept: the ledger starts at the first locked shift, deposits/advances/
// cash-to-bank post on demand, expected cash = nozzle sales − credit − digital, and
// drawer-paid expenses are shown but never deducted.
export const guide = {
  en: {
    // ── setup checklist: titles, reasons and the live detail line ──────────
    "guide.step.pump.title": "Confirm your pump details",
    "guide.step.pump.why": "Your pump name and address appear on statements you give customers.",
    "guide.detail.pump.set": "{name} — {city}, {state}",
    "guide.detail.pump.none": "Name and address not filled in",
    "guide.step.tanks.title": "Add your tanks",
    "guide.step.tanks.why": "Stock, dips and fuel purchases are all tracked per tank.",
    "guide.detail.tanks.some": "{count} tank(s): {names}",
    "guide.detail.tanks.none": "No tanks yet",
    "guide.step.nozzles.title": "Add the nozzles on each tank",
    "guide.step.nozzles.why": "Meter readings are per nozzle — this is how sales are measured.",
    "guide.detail.nozzles.none": "No nozzles yet",
    "guide.detail.nozzles.gap": "{count} nozzle(s), but no nozzle on: {missing}",
    "guide.detail.nozzles.ok": "{count} nozzle(s) across {tanks} tank(s)",
    "guide.step.rates.title": "Set today's fuel rates",
    "guide.step.rates.why": "Sales value = litres sold x the rate, so nothing can be valued without it.",
    "guide.detail.rates.none": "No rates set",
    "guide.detail.rates.gap": "No price yet for: {unpriced}",
    "guide.detail.rates.ok": "Priced: {priced}",
    "guide.step.channels.title": "List how customers pay you",
    "guide.step.channels.why": "Cash, card, UPI and bank deposits are reconciled separately.",
    "guide.detail.channels.none": "No payment channels yet",
    "guide.detail.channels.ok": "{count} channel(s), including cash",
    "guide.detail.channels.noCash": "{count} channel(s), but none marked as CASH",
    "guide.step.timeslots.title": "Tag your shift time slots",
    "guide.step.timeslots.why": "Tagging a slot Day or Night keeps a night slot off your day shift.",
    "guide.detail.timeslots.none": "No time slots yet (optional if you record one total per shift)",
    "guide.detail.timeslots.untagged": "{untagged} slot(s) not tagged Day or Night, so they show on both",
    "guide.detail.timeslots.ok": "{count} slot(s), each tagged to a shift",
    "guide.step.categories.title": "Set up your expense heads",
    "guide.step.categories.why": "Daily expenses are grouped by these on every shift and in the P&L.",
    "guide.detail.categories.some": "{count} expense categor(ies)",
    "guide.detail.categories.none": "No expense categories yet",
    "guide.step.employees.title": "Add your staff",
    "guide.step.employees.why": "Sales and cash are pinned to the attendant who worked each nozzle.",
    "guide.detail.employees.some": "{count} active staff",
    "guide.detail.employees.none": "No staff yet",
    "guide.step.customers.title": "Add credit customers and their vehicles",
    "guide.step.customers.why": "Needed only if you sell fuel on udhaar. Each customer can hold many vehicles.",
    "guide.detail.customers.some": "{count} credit customer(s)",
    "guide.detail.customers.none": "None yet — add them when you first sell on credit",
    "guide.step.firstshift.title": "Create your first shift",
    "guide.step.firstshift.why": "A shift is the day's book: readings, collections, credit, expenses and cash.",
    "guide.detail.firstshift.some": "{count} shift(s) created",
    "guide.detail.firstshift.none": "No shifts yet",
    "guide.step.lockshift.title": "Lock a shift to start the books",
    "guide.step.lockshift.why": "Locking freezes the shift and posts it to the double-entry ledger.",
    "guide.detail.lockshift.some": "{count} shift(s) locked, {entries} journal entr(ies) posted",
    "guide.detail.lockshift.none": "Nothing locked yet — the ledger starts from your first locked shift",
    "guide.step.opening.title": "Post your opening balances",
    "guide.step.opening.why": "Without this the balance sheet starts from zero and understates what you own.",
    "guide.detail.opening.some": "{count} manual entr(ies) posted",
    "guide.detail.opening.none": "Cash in hand, what customers already owe, and fuel already in the tanks",
    "guide.step.dipcharts.title": "Load your tank dip charts",
    "guide.step.dipcharts.why": "Turns a dipstick reading into litres, which is what wet-stock variance needs.",
    "guide.detail.dipcharts.noTanks": "Add tanks first",
    "guide.detail.dipcharts.some": "{done} of {total} tank(s) have a calibration chart",
    "guide.step.bank.title": "Add your bank account",
    "guide.step.bank.why": "Needed to record deposits and reconcile card and UPI settlement.",
    "guide.detail.bank.some": "{count} account(s)",
    "guide.detail.bank.none": "None yet",
    "guide.step.licences.title": "Record your licences and their expiry",
    "guide.step.licences.why": "A lapsed licence or unstamped nozzle can stop you trading.",
    "guide.detail.licences.some": "{count} licence(s) tracked",
    "guide.detail.licences.none": "PESO, stamping, fire and pollution NOC",
    "guide.step.products.title": "Add lubricants and other non-fuel lines",
    "guide.step.products.why": "Fuel margins are fixed; lubes are where the real margin is.",
    "guide.detail.products.some": "{count} product(s)",
    "guide.detail.products.none": "None yet",

    // ---- page shell ----
    "guide.title": "Setup Guide",
    "guide.subtitle":
      "How to set up the pump and run your first shift, start to finish — with a live check of what is already done here.",
    "guide.linkBooks": "Books",
    "guide.tabProgress": "Your progress",
    "guide.tabGuide": "The guide",
    "guide.tabFirstShift": "First shift",
    "guide.checking": "Checking what is already set up on this pump…",
    "guide.progressLoadFailed": "Could not load your setup progress",
    "guide.progressReadFailed": "Could not read your setup progress",
    "guide.tabsStillWork":
      "The written guide and the first-shift walkthrough still work — use the tabs above.",

    // ---- checklist ----
    "guide.statusDone": "Done",
    "guide.statusAttention": "Needs a look",
    "guide.statusTodo": "Not done",
    "guide.doThisNext": "Do this next",
    "guide.optional": "Optional",
    "guide.open": "Open",
    "guide.go": "Go",
    "guide.pumpIsSetUp": "Your pump is set up",
    "guide.whereSetupStands": "Where your setup stands",
    "guide.readFromYourData": "{pump} — this is read from your pump's own data, not a fixed list.",
    "guide.neededDone": "{done} of {total} needed steps done",
    "guide.optionalDone": " · {done} of {total} optional done",
    "guide.nothingPending": "Everything needed for a shift is in place. Nothing is pending.",
    "guide.goToShifts": "Go straight to Shift Reports and open the shift for today.",
    "guide.openShiftsWhenReady": "Open Shift Reports when you are ready to record the next shift.",
    "guide.createAShift": "Create a shift",
    "guide.nextStep": "Next step",
    "guide.openIt": "Open it",
    "guide.onePartlyDone": "One step is partly done",
    "guide.manyPartlyDone": "{count} steps are partly done",
    "guide.warningsNotFailures":
      "These are warnings, not failures — the pump still works, but the numbers read better once they are fixed.",
    "guide.cashHandoverMode": "Cash handover mode:",
    "guide.cashModePooled": "Pooled cashier — attendants hand cash to one cashier",
    "guide.cashModePerAttendant": "Per attendant — each attendant settles their own cash",
    "guide.neededFirstShift": "Needed before your first shift",
    "guide.neededFirstShiftDesc": "Without these a shift cannot be recorded properly.",
    "guide.worthDoingSoon": "Worth doing soon",
    "guide.worthDoingSoonDesc":
      "Optional. Skip any of these and the pump still runs — they simply give you better numbers.",

    // ---- written guide: part 1 ----
    "guide.part1Title": "Part 1 — Setting up the pump (one time)",
    "guide.part1Desc": "Do this once. After it, every shift takes a few minutes.",
    "guide.p1s1Title": "Pump details",
    "guide.p1s1Body":
      "Fill in the pump name, address, city and state in {pumpSetup}. This is what prints on the statements you hand your credit customers.",
    "guide.p1s2Title": "Tanks",
    "guide.p1s2Body":
      "Add one entry per underground tank, with the fuel it holds — HSD, MS, MS Power, CNG. Stock, dip and every tanker load is tracked tank by tank, so two tanks of diesel are two entries, not one.",
    "guide.p1s3Title": "Nozzles on each tank",
    "guide.p1s3Body":
      "Add every nozzle and attach it to the tank it draws from. Sales are measured from nozzle meter readings, so a tank with no nozzle can never show a sale. Give each nozzle the code your staff already calls it by.",
    "guide.p1s4Title": "Today's fuel rates",
    "guide.p1s4Body":
      "Enter the current rate for every fuel you sell in {rates}. Litres sold times the rate is the sale value, so an unpriced fuel cannot be valued. When the oil company changes prices, record the change in {pricing}.",
    "guide.p1s5Title": "How customers pay you",
    "guide.p1s5Body":
      "List your payment channels in {pumpSetup} — cash, card machine, UPI, bank deposit. At least one channel must be marked CASH, because that is the one the drawer is counted against. Card and UPI are reconciled separately later against what the bank actually credited.",
    "guide.p1s6Title": "Shift time slots, tagged Day or Night",
    "guide.p1s6Body":
      "If you collect money in blocks — 6am to 10am, 10am to 2pm, and so on — set those slots up and tag each one Day or Night. A slot tagged Night then never appears on a day shift. An untagged slot shows on both shifts, which is usually not what you want.",
    "guide.p1s7Title": "Expense heads",
    "guide.p1s7Body":
      "Set up the heads you spend under in {expenses} — electricity, salary, tea, repairs, generator diesel. Every shift expense is filed under one of these, and the P&L groups them the same way.",
    "guide.p1s8Title": "Staff",
    "guide.p1s8Body":
      "Add your attendants and cashiers in {employees}. Sales and cash are pinned to the attendant who worked each nozzle, so the names have to exist before the first shift.",
    "guide.restIsOptional":
      "The rest is optional. Skip it and the pump still runs — but each one buys you something.",
    "guide.p1s9Title": "Credit customers and their vehicles",
    "guide.p1s9Body":
      "If you sell on udhaar, add the customer in {credit}. One customer can hold many vehicles — a transporter with twelve trucks is one account with twelve vehicle numbers, and every credit sale names both the customer and the vehicle.",
    "guide.p1s10Title": "Tank dip charts",
    "guide.p1s10Body":
      "Load the calibration chart for each tank in {wetStock}. The chart turns a dipstick reading in centimetres into litres, which is what book-versus-dip variance needs.",
    "guide.p1s11Title": "Bank account",
    "guide.p1s11Body":
      "Add your account in {cash} so deposits can be recorded and card and UPI settlement can be matched against it.",
    "guide.p1s12Title": "Licences and expiry dates",
    "guide.p1s12Body":
      "Record PESO, stamping, fire and pollution NOC with their expiry dates in {compliance}. A lapsed licence or an unstamped nozzle can stop you trading.",
    "guide.p1s13Title": "Lubricants and other non-fuel lines",
    "guide.p1s13Body":
      "Add them in {products}. Fuel margin is fixed by the oil company; lubes are where the margin actually is.",

    // ---- written guide: part 2 ----
    "guide.part2Title": "Part 2 — Running a shift, in the order the screens are used",
    "guide.part2Desc": "From opening the shift to locking it. This is the daily routine.",
    "guide.p2s1Title": "Create the shift",
    "guide.p2s1Body":
      "In {shifts}, pick the date and whether it is the Day or the Night shift. That is all you enter by hand to start.",
    "guide.p2s2Title": "What is already filled in for you",
    "guide.p2s2Body": "A new shift does not start blank. It carries forward:",
    "guide.p2s2Item1Label": "Opening meter readings",
    "guide.p2s2Item1": " — the closing readings of the previous shift.",
    "guide.p2s2Item2Label": "Tank stock",
    "guide.p2s2Item2": " — the closing stock of the previous shift becomes this shift's opening stock.",
    "guide.p2s2Item3Label": "Expense opening balances",
    "guide.p2s2Item3": " — carried over the same way.",
    "guide.p2s2Item4Label": "The crew",
    "guide.p2s2Item4a": " — who worked which nozzle is copied from the last shift ",
    "guide.p2s2Item4b": "of the same type",
    "guide.p2s2Item4c":
      ". A day shift copies the previous day shift, not last night's. Change whoever is not on duty today.",
    "guide.p2s3Title": "Closing meter readings",
    "guide.p2s3Body1": "At shift end, enter the closing reading for every nozzle. Sales come out as ",
    "guide.p2s3Formula": "closing − opening − test litres",
    "guide.p2s3Body2":
      ", so whatever you pump back into the measure during testing is not counted as a sale.",
    "guide.p2s4Title": "Tank dips and stock",
    "guide.p2s4Body":
      "Record the dip for each tank. With a dip chart loaded, the reading converts to litres, and the shift can then be compared against what the book says should be there.",
    "guide.p2s5Title": "Tanker loads received",
    "guide.p2s5Body":
      "If a tanker came in during the shift, record the load — the tank it went into and the quantity. It is also visible on its own in {tankers}.",
    "guide.p2s6Title": "Collections, per channel and per time slot",
    "guide.p2s6Body":
      "Enter what came in, split by payment channel — cash, card, UPI, bank deposit — and by time slot if you use slots. Only slots tagged for this shift type show up here.",
    "guide.p2s7Title": "Credit sales (udhaar)",
    "guide.p2s7Body":
      "For every credit sale, name the customer and the vehicle. These are what later build the customer's statement and their outstanding balance.",
    "guide.p2s8Title": "Expenses paid during the shift",
    "guide.p2s8Body": "Each expense under one of your expense heads, with the amount.",
    "guide.p2s9Title": "Weights & Measures nozzle tests",
    "guide.p2s9Body":
      "Record the test litres you drew for the 5-litre measure on each nozzle. Those litres are removed from sales, and the record is there when an inspector asks.",
    "guide.p2s10Title": "Cash: drops during the shift, and the settlement at the end",
    "guide.p2s10Body1a": "Staff do not have to hold cash to the end. They can hand it in ",
    "guide.p2s10During": "during",
    "guide.p2s10Body1b":
      " the shift, and each drop records the exact time and who took it — the cashier or the office safe.",
    "guide.p2s10Body2": "At shift end, each attendant's expected cash is:",
    "guide.p2s10Formula": "their nozzle sales − credit they gave − digital payments they took",
    "guide.p2s10Body3":
      "A shortfall is not written off as a loss. It becomes money that attendant owes, and it stays visible against their name.",
    "guide.p2s10Note1": "Expenses an attendant paid out of the drawer are shown next to their settlement for context, but they are ",
    "guide.p2s10NotDeducted": "not deducted",
    "guide.p2s10Note2":
      " from the expected cash. That is deliberate: collections are recorded gross of expenses, so deducting them again would count the same money twice.",
    "guide.p2s11Title": "Submit, then Lock",
    "guide.p2s11Body1": "Submit saves the shift as complete. Then ",
    "guide.p2s11Lock": "Lock",
    "guide.p2s11Body2": " — and locking is the moment that matters. Locking:",
    "guide.p2s11Item1": "freezes the shift so the figures cannot drift,",
    "guide.p2s11Item2": "updates every credit customer's balance,",
    "guide.p2s11Item3": "posts the shift into the double-entry ledger.",
    "guide.p2s11Body3":
      "It is reversible: unlocking posts mirror entries that cancel the original ones. Nothing is ever deleted, so the trail of what was posted and reversed stays intact.",

    // ---- written guide: part 3 ----
    "guide.part3Title": "Part 3 — Afterwards: where to look",
    "guide.part3Desc": "Once shifts are being locked, these are the screens you live in.",
    "guide.p3Reports":
      "Sales and expense analysis over any date range — by day, fuel, nozzle, attendant, channel and expense head.",
    "guide.p3Books": "Trial balance, profit & loss, balance sheet, and who owes what.",
    "guide.p3Cash":
      "Where the cash physically is right now, and card and UPI settlement checked against what the bank actually credited.",
    "guide.p3Receivables": "Customer bills and statements, and bounced cheques.",
    "guide.p3WetStock":
      "Book stock against dip stock — the variance that tells you about leakage or a bad reading.",
    "guide.p3Compliance": "Licence expiry dates and daily staff attendance.",
    "guide.twoThings": "Two things to know about the books",
    "guide.ledgerStartsLabel": "The ledger starts from your first locked shift.",
    "guide.ledgerStartsBody":
      " Shifts from before that are not back-posted into the accounts. If you want the books to open with what you already own and are owed, post opening balances yourself from {booksNew}.",
    "guide.onDemandLabel":
      "Bank deposits, staff advances and cash sent to the bank are posted to the books on demand.",
    "guide.onDemandBody":
      " You run that posting yourself from {books}. It is safe to run again and again — running it twice does not double the entries.",

    // ---- first-shift walkthrough ----
    "guide.walkTitle": "Walk me through the first shift",
    "guide.walkDesc":
      "Twelve steps, in the order you will actually use the screens. Move through them at your own pace — this page remembers where you stopped.",
    "guide.stepOf": "Step {n} of {total}",
    "guide.startOver": "Start over",
    "guide.lastStep": "Last step",
    "guide.whatToEnter": "What to enter",
    "guide.walkDone":
      "That is the whole loop. Every shift after this one is the same, and most of it is already filled in for you.",
    "guide.allSteps": "All steps",
    "guide.allStepsDesc": "Jump straight to any step.",
    "guide.placeKept":
      "Your place is kept in this browser only. If it cannot be saved, the walkthrough simply starts at step 1 each time.",

    "guide.w1Screen": "Pump Setup",
    "guide.w1Title": "Check the pump is described correctly",
    "guide.w1Link": "Open Pump Setup",
    "guide.w1e1": "Pump name, address, city and state.",
    "guide.w1e2": "Every underground tank, with the fuel it holds.",
    "guide.w1e3": "Every nozzle, attached to the tank it draws from.",
    "guide.w1e4": "Your payment channels — at least one marked CASH.",
    "guide.w1e5": "Time slots, if you collect in blocks, each tagged Day or Night.",
    "guide.w1tip": "A tank with no nozzle can never show a sale, so check each tank has at least one.",

    "guide.w2Screen": "Fuel Rates",
    "guide.w2Title": "Put today's rate against every fuel",
    "guide.w2Link": "Open Fuel Rates",
    "guide.w2e1": "The current selling rate for each fuel your tanks hold.",
    "guide.w2tip": "Litres times rate is the sale value. An unpriced fuel cannot be valued.",

    "guide.w3Screen": "Expense Categories",
    "guide.w3Title": "Name the heads you spend under",
    "guide.w3Link": "Open Expense Categories",
    "guide.w3e1": "Electricity, salary, tea, repairs, generator diesel — whatever you actually spend on.",

    "guide.w4Screen": "Employees",
    "guide.w4Title": "Add the staff who will work the shift",
    "guide.w4Link": "Open Employees",
    "guide.w4e1": "Each attendant and cashier by name.",
    "guide.w4tip":
      "Sales and cash are pinned to the attendant on the nozzle, so the names must exist first.",

    "guide.w5Screen": "Shift Reports",
    "guide.w5Title": "Create the shift",
    "guide.w5Link": "Create a shift",
    "guide.w5e1": "The date.",
    "guide.w5e2": "Day or Night.",
    "guide.w5tip":
      "Opening readings, tank stock, expense opening balances and the crew are filled in from the previous shift of the same type. For your very first shift, enter the opening readings yourself.",

    "guide.w6Screen": "The shift — nozzles",
    "guide.w6Title": "Set the crew and enter closing meter readings",
    "guide.w6Link": "Open Shift Reports",
    "guide.w6e1": "Who worked which nozzle — correct anything carried over.",
    "guide.w6e2": "The closing reading on every nozzle at shift end.",
    "guide.w6tip": "Sales = closing − opening − test litres.",

    "guide.w7Screen": "The shift — stock",
    "guide.w7Title": "Record dips and any tanker load",
    "guide.w7Link": "Open Shift Reports",
    "guide.w7e1": "The dip reading for each tank, and the closing stock.",
    "guide.w7e2": "Any tanker load received during the shift, and which tank it went into.",

    "guide.w8Screen": "The shift — money in",
    "guide.w8Title": "Enter collections and credit sales",
    "guide.w8Link": "Open Shift Reports",
    "guide.w8e1": "Collections split by payment channel, and by time slot if you use slots.",
    "guide.w8e2": "Every credit sale, naming the customer and the vehicle.",
    "guide.w8tip": "Only slots tagged for this shift type appear here.",

    "guide.w9Screen": "The shift — money out and testing",
    "guide.w9Title": "Enter expenses and the nozzle tests",
    "guide.w9Link": "Open Shift Reports",
    "guide.w9e1": "Each expense, under one of your expense heads.",
    "guide.w9e2": "The Weights & Measures test litres drawn on each nozzle.",

    "guide.w10Screen": "The shift — cash",
    "guide.w10Title": "Record cash drops and settle each attendant",
    "guide.w10Link": "Open Shift Reports",
    "guide.w10e1": "Any cash handed in during the shift — the time is recorded, and who took it.",
    "guide.w10e2": "The cash each attendant finally hands over.",
    "guide.w10tip":
      "Expected cash = their nozzle sales − credit they gave − digital payments they took. Expenses they paid from the drawer are shown but not deducted. A shortfall becomes money they owe.",

    "guide.w11Screen": "The shift — finish",
    "guide.w11Title": "Submit, then Lock",
    "guide.w11Link": "Open Shift Reports",
    "guide.w11e1": "Submit to mark the shift complete.",
    "guide.w11e2": "Lock to freeze it.",
    "guide.w11tip":
      "Locking updates customer balances and posts the shift to the ledger. Unlocking posts mirror entries; nothing is deleted.",

    "guide.w12Screen": "Books and Reports",
    "guide.w12Title": "See what the shift did to your accounts",
    "guide.w12Link": "Open Books",
    "guide.w12e1": "Trial balance, P&L and balance sheet in Books.",
    "guide.w12e2": "Sales and expense analysis in Reports.",
    "guide.w12tip":
      "The ledger starts from your first locked shift. Bank deposits, staff advances and cash sent to the bank are posted on demand from Books — safe to run repeatedly.",
  },
  hi: {
    // ── सेटअप चेकलिस्ट ────────────────────────────────────────────────────
    "guide.step.pump.title": "अपने पंप की जानकारी जाँचें",
    "guide.step.pump.why": "ग्राहकों को दिए जाने वाले खाता विवरण पर पंप का नाम और पता छपता है।",
    "guide.detail.pump.set": "{name} — {city}, {state}",
    "guide.detail.pump.none": "नाम और पता भरा नहीं है",
    "guide.step.tanks.title": "अपनी टंकियाँ जोड़ें",
    "guide.step.tanks.why": "स्टॉक, डिप और तेल की खरीद — सब टंकी के हिसाब से चलता है।",
    "guide.detail.tanks.some": "{count} टंकी: {names}",
    "guide.detail.tanks.none": "अभी कोई टंकी नहीं",
    "guide.step.nozzles.title": "हर टंकी की नोज़ल जोड़ें",
    "guide.step.nozzles.why": "मीटर रीडिंग नोज़ल के हिसाब से होती है — बिक्री इसी से नापी जाती है।",
    "guide.detail.nozzles.none": "अभी कोई नोज़ल नहीं",
    "guide.detail.nozzles.gap": "{count} नोज़ल, लेकिन इन टंकियों पर कोई नोज़ल नहीं: {missing}",
    "guide.detail.nozzles.ok": "{tanks} टंकियों पर कुल {count} नोज़ल",
    "guide.step.rates.title": "आज के फ़्यूल रेट डालें",
    "guide.step.rates.why": "बिक्री की रकम = बिके लीटर × रेट, इसलिए रेट बिना कुछ नहीं जुड़ेगा।",
    "guide.detail.rates.none": "कोई रेट नहीं डाला गया",
    "guide.detail.rates.gap": "इनका रेट अभी नहीं: {unpriced}",
    "guide.detail.rates.ok": "रेट डला हुआ: {priced}",
    "guide.step.channels.title": "ग्राहक किन तरीकों से पैसा देते हैं, वह डालें",
    "guide.step.channels.why": "नकद, कार्ड, UPI और बैंक जमा का मिलान अलग-अलग होता है।",
    "guide.detail.channels.none": "अभी कोई पेमेंट चैनल नहीं",
    "guide.detail.channels.ok": "{count} चैनल, नकद समेत",
    "guide.detail.channels.noCash": "{count} चैनल, लेकिन कोई भी CASH नहीं चुना गया",
    "guide.step.timeslots.title": "शिफ़्ट के टाइम स्लॉट पर दिन/रात लगाएँ",
    "guide.step.timeslots.why": "स्लॉट पर दिन या रात लगाने से रात का स्लॉट दिन की शिफ़्ट में नहीं दिखेगा।",
    "guide.detail.timeslots.none": "अभी कोई टाइम स्लॉट नहीं (अगर पूरी शिफ़्ट का एक ही कुल लिखते हैं तो ज़रूरी नहीं)",
    "guide.detail.timeslots.untagged": "{untagged} स्लॉट पर दिन/रात नहीं लगा है, इसलिए वे दोनों शिफ़्ट में दिखते हैं",
    "guide.detail.timeslots.ok": "{count} स्लॉट, हर एक पर शिफ़्ट लगी हुई",
    "guide.step.categories.title": "अपनी खर्च मद बनाएँ",
    "guide.step.categories.why": "हर शिफ़्ट का और लाभ-हानि का खर्च इन्हीं मदों में बँटता है।",
    "guide.detail.categories.some": "{count} खर्च मद",
    "guide.detail.categories.none": "अभी कोई खर्च मद नहीं",
    "guide.step.employees.title": "अपना स्टाफ़ जोड़ें",
    "guide.step.employees.why": "बिक्री और नकद उसी सेल्समैन के नाम चढ़ता है जिसने वह नोज़ल चलाई।",
    "guide.detail.employees.some": "{count} चालू कर्मचारी",
    "guide.detail.employees.none": "अभी कोई कर्मचारी नहीं",
    "guide.step.customers.title": "उधार ग्राहक और उनकी गाड़ियाँ जोड़ें",
    "guide.step.customers.why": "सिर्फ़ तभी ज़रूरी है जब आप उधार पर तेल देते हैं। एक ग्राहक की कई गाड़ियाँ हो सकती हैं।",
    "guide.detail.customers.some": "{count} उधार ग्राहक",
    "guide.detail.customers.none": "अभी कोई नहीं — पहली उधार बिक्री के समय जोड़ लें",
    "guide.step.firstshift.title": "अपनी पहली शिफ़्ट बनाएँ",
    "guide.step.firstshift.why": "शिफ़्ट ही दिन की बही है: रीडिंग, वसूली, उधार, खर्च और नकद।",
    "guide.detail.firstshift.some": "{count} शिफ़्ट बनी हुई",
    "guide.detail.firstshift.none": "अभी कोई शिफ़्ट नहीं",
    "guide.step.lockshift.title": "बही शुरू करने के लिए एक शिफ़्ट लॉक करें",
    "guide.step.lockshift.why": "लॉक करने पर शिफ़्ट पक्की हो जाती है और बहीखाते में चढ़ जाती है।",
    "guide.detail.lockshift.some": "{count} शिफ़्ट लॉक, {entries} जर्नल एंट्री चढ़ीं",
    "guide.detail.lockshift.none": "अभी कुछ लॉक नहीं हुआ — बहीखाता पहली लॉक शिफ़्ट से शुरू होता है",
    "guide.step.opening.title": "अपने शुरुआती बकाया (ओपनिंग बैलेंस) चढ़ाएँ",
    "guide.step.opening.why": "इसके बिना बैलेंस शीट ज़ीरो से शुरू होगी और आपकी असली पूँजी कम दिखेगी।",
    "guide.detail.opening.some": "{count} मैन्युअल एंट्री चढ़ीं",
    "guide.detail.opening.none": "हाथ का नकद, ग्राहकों पर पहले से बकाया, और टंकी में पहले से पड़ा तेल",
    "guide.step.dipcharts.title": "टंकियों का डिप चार्ट डालें",
    "guide.step.dipcharts.why": "डिप की रीडिंग को लीटर में बदलता है, जिससे स्टॉक का अंतर निकलता है।",
    "guide.detail.dipcharts.noTanks": "पहले टंकी जोड़ें",
    "guide.detail.dipcharts.some": "{total} में से {done} टंकी का कैलिब्रेशन चार्ट डला है",
    "guide.step.bank.title": "अपना बैंक खाता जोड़ें",
    "guide.step.bank.why": "बैंक जमा लिखने और कार्ड/UPI सेटलमेंट मिलाने के लिए ज़रूरी है।",
    "guide.detail.bank.some": "{count} खाता",
    "guide.detail.bank.none": "अभी कोई नहीं",
    "guide.step.licences.title": "अपने लाइसेंस और उनकी अंतिम तारीख़ लिखें",
    "guide.step.licences.why": "लाइसेंस खत्म होने या नोज़ल की मुहर न होने पर पंप बंद हो सकता है।",
    "guide.detail.licences.some": "{count} लाइसेंस दर्ज",
    "guide.detail.licences.none": "PESO, नाप-तौल मुहर, फ़ायर और प्रदूषण NOC",
    "guide.step.products.title": "ऑयल और दूसरा सामान जोड़ें",
    "guide.step.products.why": "तेल का मार्जिन तय है; असली कमाई ऑयल में है।",
    "guide.detail.products.some": "{count} सामान",
    "guide.detail.products.none": "अभी कोई नहीं",

    // ---- page shell ----
    "guide.title": "सेटअप गाइड",
    "guide.subtitle":
      "पंप को सेट करने से लेकर पहली शिफ़्ट चलाने तक की पूरी बात — साथ में यह भी कि यहाँ अब तक क्या-क्या हो चुका है।",
    "guide.linkBooks": "बहीखाता",
    "guide.tabProgress": "आपकी प्रगति",
    "guide.tabGuide": "गाइड",
    "guide.tabFirstShift": "पहली शिफ़्ट",
    "guide.checking": "देख रहे हैं कि इस पंप पर क्या-क्या सेट हो चुका है…",
    "guide.progressLoadFailed": "आपकी सेटअप प्रगति नहीं आ पाई",
    "guide.progressReadFailed": "आपकी सेटअप प्रगति पढ़ी नहीं जा सकी",
    "guide.tabsStillWork":
      "लिखी हुई गाइड और पहली शिफ़्ट का तरीका फिर भी चलता है — ऊपर के टैब देखें।",

    // ---- checklist ----
    "guide.statusDone": "हो गया",
    "guide.statusAttention": "देखना होगा",
    "guide.statusTodo": "बाकी है",
    "guide.doThisNext": "अगला यही करें",
    "guide.optional": "वैकल्पिक",
    "guide.open": "खोलें",
    "guide.go": "जाएँ",
    "guide.pumpIsSetUp": "आपका पंप सेट हो चुका है",
    "guide.whereSetupStands": "सेटअप कहाँ तक पहुँचा",
    "guide.readFromYourData":
      "{pump} — यह आपके अपने पंप के डेटा से पढ़ा गया है, कोई बनी-बनाई सूची नहीं।",
    "guide.neededDone": "{total} ज़रूरी कदमों में से {done} हो गए",
    "guide.optionalDone": " · {total} वैकल्पिक में से {done} हो गए",
    "guide.nothingPending": "शिफ़्ट के लिए जो चाहिए वह सब मौजूद है। कुछ बाकी नहीं।",
    "guide.goToShifts": "सीधे शिफ़्ट रिपोर्ट पर जाएँ और आज की शिफ़्ट खोलें।",
    "guide.openShiftsWhenReady": "अगली शिफ़्ट दर्ज करनी हो तब शिफ़्ट रिपोर्ट खोलें।",
    "guide.createAShift": "शिफ़्ट बनाएँ",
    "guide.nextStep": "अगला कदम",
    "guide.openIt": "इसे खोलें",
    "guide.onePartlyDone": "एक कदम आधा-अधूरा है",
    "guide.manyPartlyDone": "{count} कदम आधे-अधूरे हैं",
    "guide.warningsNotFailures":
      "ये चेतावनी हैं, गलती नहीं — पंप फिर भी चलेगा, पर इन्हें ठीक कर लेने से आँकड़े ज़्यादा सही बैठेंगे।",
    "guide.cashHandoverMode": "नकद जमा का तरीका:",
    "guide.cashModePooled": "एक कैशियर — सेल्समैन अपना कैश एक कैशियर को देते हैं",
    "guide.cashModePerAttendant": "हर सेल्समैन अलग — हर सेल्समैन अपना कैश खुद जमा करता है",
    "guide.neededFirstShift": "पहली शिफ़्ट से पहले ज़रूरी",
    "guide.neededFirstShiftDesc": "इनके बिना शिफ़्ट ठीक से दर्ज नहीं हो पाएगी।",
    "guide.worthDoingSoon": "जल्दी कर लें तो अच्छा",
    "guide.worthDoingSoonDesc":
      "वैकल्पिक। इनमें से कुछ भी छोड़ दें तो भी पंप चलता रहेगा — बस आँकड़े और बेहतर मिलते हैं।",

    // ---- written guide: part 1 ----
    "guide.part1Title": "भाग 1 — पंप का सेटअप (एक ही बार)",
    "guide.part1Desc": "यह एक बार कर लें। इसके बाद हर शिफ़्ट में बस कुछ मिनट लगेंगे।",
    "guide.p1s1Title": "पंप की जानकारी",
    "guide.p1s1Body":
      "{pumpSetup} में पंप का नाम, पता, शहर और राज्य भरें। उधार ग्राहकों को जो खाता विवरण देते हैं, उस पर यही छपता है।",
    "guide.p1s2Title": "टंकियाँ",
    "guide.p1s2Body":
      "हर ज़मीन के नीचे की टंकी की एक अलग एंट्री बनाएँ, साथ में उसमें कौन-सा फ़्यूल है — HSD, MS, MS Power, CNG। स्टॉक, डिप और हर टैंकर लोड टंकी-दर-टंकी चलता है, इसलिए डीज़ल की दो टंकियाँ दो एंट्री हैं, एक नहीं।",
    "guide.p1s3Title": "हर टंकी की नोज़ल",
    "guide.p1s3Body":
      "हर नोज़ल जोड़ें और उसे उसी टंकी से बाँधें जिससे वह तेल खींचती है। बिक्री नोज़ल की मीटर रीडिंग से नापी जाती है, इसलिए जिस टंकी पर कोई नोज़ल नहीं, उस पर बिक्री कभी नहीं दिखेगी। हर नोज़ल को वही कोड दें जिस नाम से आपका स्टाफ़ उसे बुलाता है।",
    "guide.p1s4Title": "आज के फ़्यूल रेट",
    "guide.p1s4Body":
      "{rates} में हर फ़्यूल का आज का रेट डालें। बेचे गए लीटर गुणा रेट ही बिक्री की रकम है, इसलिए बिना रेट वाले फ़्यूल की कीमत नहीं निकल सकती। कंपनी रेट बदले तो वह बदलाव {pricing} में दर्ज करें।",
    "guide.p1s5Title": "ग्राहक आपको पैसा किस तरह देते हैं",
    "guide.p1s5Body":
      "{pumpSetup} में अपने पेमेंट चैनल लिखें — नकद, कार्ड मशीन, UPI, बैंक जमा। कम से कम एक चैनल पर CASH का निशान होना ज़रूरी है, क्योंकि गल्ला उसी के सामने गिना जाता है। कार्ड और UPI का मिलान बाद में अलग से होता है — बैंक में असल में कितना आया, उसके सामने।",
    "guide.p1s6Title": "शिफ़्ट के टाइम स्लॉट, दिन या रात के निशान के साथ",
    "guide.p1s6Body":
      "अगर आप पैसा हिस्सों में गिनते हैं — सुबह 6 से 10, 10 से 2, और आगे — तो वे स्लॉट बनाएँ और हर एक पर दिन या रात का निशान लगाएँ। रात वाला स्लॉट फिर दिन की शिफ़्ट में कभी नहीं दिखेगा। बिना निशान वाला स्लॉट दोनों शिफ़्ट में दिखता है, जो आमतौर पर आप नहीं चाहते।",
    "guide.p1s7Title": "खर्च की मद",
    "guide.p1s7Body":
      "{expenses} में अपनी खर्च की मदें बनाएँ — बिजली, तनख्वाह, चाय, मरम्मत, जनरेटर का डीज़ल। शिफ़्ट का हर खर्च इन्हीं में से किसी एक के नीचे जाता है, और लाभ-हानि भी इन्हीं के हिसाब से बनती है।",
    "guide.p1s8Title": "स्टाफ़",
    "guide.p1s8Body":
      "{employees} में अपने सेल्समैन और कैशियर जोड़ें। बिक्री और नकद उसी सेल्समैन के नाम चढ़ते हैं जिसने वह नोज़ल चलाई, इसलिए नाम पहली शिफ़्ट से पहले मौजूद होने चाहिए।",
    "guide.restIsOptional":
      "आगे का सब वैकल्पिक है। छोड़ दें तो भी पंप चलता रहेगा — पर हर एक से कुछ न कुछ फ़ायदा है।",
    "guide.p1s9Title": "उधार ग्राहक और उनकी गाड़ियाँ",
    "guide.p1s9Body":
      "अगर आप उधार पर तेल देते हैं तो ग्राहक को {credit} में जोड़ें। एक ही ग्राहक की कई गाड़ियाँ हो सकती हैं — बारह ट्रक वाला ट्रांसपोर्टर एक खाता है जिसमें बारह गाड़ी नंबर हैं, और हर उधार बिक्री में ग्राहक और गाड़ी दोनों का नाम आता है।",
    "guide.p1s10Title": "टंकी के डिप चार्ट",
    "guide.p1s10Body":
      "{wetStock} में हर टंकी का डिप चार्ट डालें। चार्ट सेंटीमीटर की डिप रीडिंग को लीटर में बदल देता है, और किताब बनाम डिप का अंतर निकालने के लिए यही चाहिए।",
    "guide.p1s11Title": "बैंक खाता",
    "guide.p1s11Body":
      "{cash} में अपना खाता जोड़ें ताकि बैंक जमा दर्ज हो सके और कार्ड व UPI का सेटलमेंट उसी के सामने मिलाया जा सके।",
    "guide.p1s12Title": "लाइसेंस और उनकी देय तिथि",
    "guide.p1s12Body":
      "{compliance} में PESO, स्टैम्पिंग, फ़ायर और प्रदूषण NOC उनकी समाप्ति तारीख़ के साथ दर्ज करें। लाइसेंस खत्म हो जाए या नोज़ल की स्टैम्पिंग न हो तो धंधा रुक सकता है।",
    "guide.p1s13Title": "ऑयल और बाकी गैर-फ़्यूल सामान",
    "guide.p1s13Body":
      "इन्हें {products} में जोड़ें। फ़्यूल का मार्जिन कंपनी तय करती है; असली मार्जिन ऑयल में ही है।",

    // ---- written guide: part 2 ----
    "guide.part2Title": "भाग 2 — शिफ़्ट चलाना, उसी क्रम में जिसमें स्क्रीन काम आती हैं",
    "guide.part2Desc": "शिफ़्ट खोलने से लेकर लॉक करने तक। यही रोज़ का काम है।",
    "guide.p2s1Title": "शिफ़्ट बनाएँ",
    "guide.p2s1Body":
      "{shifts} में तारीख़ चुनें और बताएँ कि दिन की शिफ़्ट है या रात की। शुरू करने के लिए बस इतना ही हाथ से भरना है।",
    "guide.p2s2Title": "क्या-क्या अपने आप भर जाता है",
    "guide.p2s2Body": "नई शिफ़्ट खाली नहीं खुलती। इतना आगे ले आती है:",
    "guide.p2s2Item1Label": "शुरुआती मीटर रीडिंग",
    "guide.p2s2Item1": " — पिछली शिफ़्ट की अंतिम रीडिंग।",
    "guide.p2s2Item2Label": "टंकी का स्टॉक",
    "guide.p2s2Item2": " — पिछली शिफ़्ट का अंतिम स्टॉक इस शिफ़्ट का शुरुआती स्टॉक बन जाता है।",
    "guide.p2s2Item3Label": "खर्च के शुरुआती बैलेंस",
    "guide.p2s2Item3": " — इसी तरह आगे चले आते हैं।",
    "guide.p2s2Item4Label": "स्टाफ़",
    "guide.p2s2Item4a": " — किसने कौन-सी नोज़ल चलाई, यह पिछली ",
    "guide.p2s2Item4b": "उसी तरह की",
    "guide.p2s2Item4c":
      " शिफ़्ट से उठाया जाता है। दिन की शिफ़्ट पिछली दिन वाली शिफ़्ट से नकल करती है, कल रात वाली से नहीं। जो आज ड्यूटी पर नहीं है, उसे बदल दें।",
    "guide.p2s3Title": "अंतिम मीटर रीडिंग",
    "guide.p2s3Body1": "शिफ़्ट खत्म होने पर हर नोज़ल की अंतिम रीडिंग डालें। बिक्री ऐसे निकलती है: ",
    "guide.p2s3Formula": "अंतिम − शुरुआती − जाँच के लीटर",
    "guide.p2s3Body2":
      " — यानी जाँच के दौरान जो तेल माप में निकालकर वापस डाला, वह बिक्री में नहीं गिना जाता।",
    "guide.p2s4Title": "टंकी की डिप और स्टॉक",
    "guide.p2s4Body":
      "हर टंकी की डिप दर्ज करें। डिप चार्ट डला हो तो रीडिंग लीटर में बदल जाती है, और फिर शिफ़्ट का मिलान इससे हो जाता है कि किताब के हिसाब से कितना तेल होना चाहिए था।",
    "guide.p2s5Title": "आया हुआ टैंकर लोड",
    "guide.p2s5Body":
      "शिफ़्ट के दौरान टैंकर आया हो तो लोड दर्ज करें — किस टंकी में गया और कितना। यह अलग से {tankers} में भी दिखता है।",
    "guide.p2s6Title": "वसूली — चैनल और टाइम स्लॉट के हिसाब से",
    "guide.p2s6Body":
      "जो पैसा आया वह पेमेंट चैनल के हिसाब से भरें — नकद, कार्ड, UPI, बैंक जमा — और अगर आप स्लॉट इस्तेमाल करते हैं तो टाइम स्लॉट के हिसाब से भी। यहाँ सिर्फ़ इसी तरह की शिफ़्ट के लिए बने स्लॉट दिखेंगे।",
    "guide.p2s7Title": "उधार बिक्री",
    "guide.p2s7Body":
      "हर उधार बिक्री में ग्राहक और गाड़ी का नाम डालें। आगे चलकर ग्राहक का खाता विवरण और उसका बकाया इन्हीं से बनता है।",
    "guide.p2s8Title": "शिफ़्ट में किए गए खर्च",
    "guide.p2s8Body": "हर खर्च अपनी किसी एक खर्च मद के नीचे, रकम के साथ।",
    "guide.p2s9Title": "नाप-तौल की नोज़ल जाँच",
    "guide.p2s9Body":
      "हर नोज़ल पर 5 लीटर के माप में जितने लीटर निकाले, वे दर्ज करें। वे लीटर बिक्री में से घटा दिए जाते हैं, और इंस्पेक्टर पूछे तो रिकॉर्ड मौजूद रहता है।",
    "guide.p2s10Title": "नकद: शिफ़्ट के बीच जमा, और आख़िर में हिसाब",
    "guide.p2s10Body1a": "स्टाफ़ को आख़िर तक कैश अपने पास रखने की ज़रूरत नहीं। वे शिफ़्ट के ",
    "guide.p2s10During": "बीच में",
    "guide.p2s10Body1b":
      " ही जमा कर सकते हैं, और हर जमा में ठीक समय और किसने लिया — कैशियर ने या ऑफ़िस की तिजोरी में — दोनों दर्ज होते हैं।",
    "guide.p2s10Body2": "शिफ़्ट के आख़िर में हर सेल्समैन का अपेक्षित नकद यह होता है:",
    "guide.p2s10Formula": "उसकी नोज़ल की बिक्री − उसका दिया उधार − उसके लिए गए डिजिटल पेमेंट",
    "guide.p2s10Body3":
      "कमी को नुकसान मानकर छोड़ा नहीं जाता। वह उस सेल्समैन पर बकाया बन जाती है और उसके नाम के सामने दिखती रहती है।",
    "guide.p2s10Note1":
      "सेल्समैन ने गल्ले से जो खर्च किए, वे उसके हिसाब के साथ जानकारी के लिए दिखाए जाते हैं, पर अपेक्षित नकद में से ",
    "guide.p2s10NotDeducted": "घटाए नहीं जाते",
    "guide.p2s10Note2":
      "। यह जानबूझकर है: वसूली खर्च घटाने से पहले वाली दर्ज होती है, इसलिए दोबारा घटाने से वही पैसा दो बार गिना जाएगा।",
    "guide.p2s11Title": "पहले सबमिट करें, फिर लॉक",
    "guide.p2s11Body1": "सबमिट करने से शिफ़्ट पूरी मानकर सेव हो जाती है। उसके बाद ",
    "guide.p2s11Lock": "लॉक करें",
    "guide.p2s11Body2": " — असली काम लॉक करने पर ही होता है। लॉक करने से:",
    "guide.p2s11Item1": "शिफ़्ट जम जाती है, आँकड़े फिर हिल नहीं सकते,",
    "guide.p2s11Item2": "हर उधार ग्राहक का बकाया अपडेट हो जाता है,",
    "guide.p2s11Item3": "शिफ़्ट डबल-एंट्री बहीखाते में चढ़ जाती है।",
    "guide.p2s11Body3":
      "यह वापस भी हो सकता है: अनलॉक करने पर उलटी एंट्री चढ़ती हैं जो पहली वाली को काट देती हैं। कुछ भी मिटाया नहीं जाता, इसलिए क्या चढ़ा और क्या काटा गया, उसका पूरा रिकॉर्ड बना रहता है।",

    // ---- written guide: part 3 ----
    "guide.part3Title": "भाग 3 — उसके बाद: कहाँ देखना है",
    "guide.part3Desc": "शिफ़्ट लॉक होने लगें, तो रोज़ इन्हीं स्क्रीन पर रहना होता है।",
    "guide.p3Reports":
      "किसी भी अवधि की बिक्री और खर्च का विश्लेषण — दिन, फ़्यूल, नोज़ल, सेल्समैन, चैनल और खर्च मद के हिसाब से।",
    "guide.p3Books": "ट्रायल बैलेंस, लाभ-हानि, बैलेंस शीट, और किस पर कितना बकाया है।",
    "guide.p3Cash":
      "अभी नकद असल में कहाँ है, और कार्ड व UPI का सेटलमेंट — बैंक में असल में कितना आया, उसके सामने मिलाया हुआ।",
    "guide.p3Receivables": "ग्राहकों के बिल और खाता विवरण, और बाउंस हुए चेक।",
    "guide.p3WetStock":
      "किताब का स्टॉक बनाम डिप का स्टॉक — वही अंतर जो लीकेज या गलत रीडिंग की ख़बर देता है।",
    "guide.p3Compliance": "लाइसेंस की समाप्ति तारीख़ें और स्टाफ़ की रोज़ की हाजिरी।",
    "guide.twoThings": "बहीखाते के बारे में दो बातें",
    "guide.ledgerStartsLabel": "बहीखाता आपकी पहली लॉक की हुई शिफ़्ट से शुरू होता है।",
    "guide.ledgerStartsBody":
      " उससे पहले की शिफ़्ट खातों में पीछे जाकर नहीं चढ़ाई जातीं। चाहते हैं कि किताब आपकी मौजूदा जमा-पूँजी और बकाया के साथ खुले, तो शुरुआती बैलेंस खुद {booksNew} से चढ़ाएँ।",
    "guide.onDemandLabel":
      "बैंक जमा, स्टाफ़ एडवांस और बैंक भेजा गया नकद बहीखाते में तभी चढ़ते हैं जब आप कहें।",
    "guide.onDemandBody":
      " यह चढ़ाना आप खुद {books} से चलाते हैं। बार-बार चलाना सुरक्षित है — दो बार चलाने से एंट्री दोगुनी नहीं होतीं।",

    // ---- first-shift walkthrough ----
    "guide.walkTitle": "पहली शिफ़्ट कदम-दर-कदम",
    "guide.walkDesc":
      "बारह कदम, उसी क्रम में जिसमें आप असल में स्क्रीन इस्तेमाल करेंगे। अपनी रफ़्तार से चलें — यह पेज याद रखता है कि आप कहाँ रुके थे।",
    "guide.stepOf": "कदम {n} / {total}",
    "guide.startOver": "फिर से शुरू करें",
    "guide.lastStep": "आख़िरी कदम",
    "guide.whatToEnter": "क्या भरना है",
    "guide.walkDone":
      "बस यही पूरा चक्र है। इसके बाद हर शिफ़्ट ऐसी ही होगी, और उसका ज़्यादातर हिस्सा अपने आप भरा हुआ मिलेगा।",
    "guide.allSteps": "सभी कदम",
    "guide.allStepsDesc": "सीधे किसी भी कदम पर जाएँ।",
    "guide.placeKept":
      "आप कहाँ रुके थे, यह सिर्फ़ इसी ब्राउज़र में रखा जाता है। सेव न हो पाए तो हर बार कदम 1 से शुरू हो जाएगा।",

    "guide.w1Screen": "पंप सेटअप",
    "guide.w1Title": "देख लें कि पंप की जानकारी सही है",
    "guide.w1Link": "पंप सेटअप खोलें",
    "guide.w1e1": "पंप का नाम, पता, शहर और राज्य।",
    "guide.w1e2": "ज़मीन के नीचे की हर टंकी, साथ में उसका फ़्यूल।",
    "guide.w1e3": "हर नोज़ल, उसी टंकी से जुड़ी हुई जिससे वह तेल खींचती है।",
    "guide.w1e4": "आपके पेमेंट चैनल — कम से कम एक पर CASH का निशान।",
    "guide.w1e5": "टाइम स्लॉट, अगर आप हिस्सों में गिनते हैं, हर एक पर दिन या रात का निशान।",
    "guide.w1tip":
      "जिस टंकी पर कोई नोज़ल नहीं, उस पर बिक्री कभी नहीं दिखेगी — इसलिए देख लें कि हर टंकी पर कम से कम एक नोज़ल है।",

    "guide.w2Screen": "फ़्यूल रेट",
    "guide.w2Title": "हर फ़्यूल के सामने आज का रेट डालें",
    "guide.w2Link": "फ़्यूल रेट खोलें",
    "guide.w2e1": "आपकी टंकियों में जो फ़्यूल है, हर एक का आज का बिक्री रेट।",
    "guide.w2tip": "लीटर गुणा रेट ही बिक्री की रकम है। बिना रेट वाले फ़्यूल की कीमत नहीं निकलती।",

    "guide.w3Screen": "खर्च मद",
    "guide.w3Title": "अपनी खर्च की मदों के नाम रखें",
    "guide.w3Link": "खर्च मद खोलें",
    "guide.w3e1": "बिजली, तनख्वाह, चाय, मरम्मत, जनरेटर का डीज़ल — जिस पर भी आप असल में खर्च करते हैं।",

    "guide.w4Screen": "कर्मचारी",
    "guide.w4Title": "जो स्टाफ़ शिफ़्ट में लगेगा, उसे जोड़ें",
    "guide.w4Link": "कर्मचारी खोलें",
    "guide.w4e1": "हर सेल्समैन और कैशियर का नाम।",
    "guide.w4tip":
      "बिक्री और नकद नोज़ल वाले सेल्समैन के नाम चढ़ते हैं, इसलिए नाम पहले से मौजूद होने चाहिए।",

    "guide.w5Screen": "शिफ़्ट रिपोर्ट",
    "guide.w5Title": "शिफ़्ट बनाएँ",
    "guide.w5Link": "शिफ़्ट बनाएँ",
    "guide.w5e1": "तारीख़।",
    "guide.w5e2": "दिन या रात।",
    "guide.w5tip":
      "शुरुआती रीडिंग, टंकी का स्टॉक, खर्च के शुरुआती बैलेंस और स्टाफ़ पिछली उसी तरह की शिफ़्ट से भर जाते हैं। सबसे पहली शिफ़्ट में शुरुआती रीडिंग खुद डालनी होंगी।",

    "guide.w6Screen": "शिफ़्ट — नोज़ल",
    "guide.w6Title": "स्टाफ़ लगाएँ और अंतिम मीटर रीडिंग भरें",
    "guide.w6Link": "शिफ़्ट रिपोर्ट खोलें",
    "guide.w6e1": "किसने कौन-सी नोज़ल चलाई — जो अपने आप आया है उसे ठीक कर लें।",
    "guide.w6e2": "शिफ़्ट खत्म होने पर हर नोज़ल की अंतिम रीडिंग।",
    "guide.w6tip": "बिक्री = अंतिम − शुरुआती − जाँच के लीटर।",

    "guide.w7Screen": "शिफ़्ट — स्टॉक",
    "guide.w7Title": "डिप और आया हुआ टैंकर लोड दर्ज करें",
    "guide.w7Link": "शिफ़्ट रिपोर्ट खोलें",
    "guide.w7e1": "हर टंकी की डिप रीडिंग, और अंतिम स्टॉक।",
    "guide.w7e2": "शिफ़्ट के दौरान आया कोई टैंकर लोड, और वह किस टंकी में गया।",

    "guide.w8Screen": "शिफ़्ट — आया पैसा",
    "guide.w8Title": "वसूली और उधार बिक्री भरें",
    "guide.w8Link": "शिफ़्ट रिपोर्ट खोलें",
    "guide.w8e1": "वसूली पेमेंट चैनल के हिसाब से, और स्लॉट इस्तेमाल करते हों तो टाइम स्लॉट के हिसाब से भी।",
    "guide.w8e2": "हर उधार बिक्री, ग्राहक और गाड़ी के नाम के साथ।",
    "guide.w8tip": "यहाँ सिर्फ़ इसी तरह की शिफ़्ट के लिए बने स्लॉट दिखते हैं।",

    "guide.w9Screen": "शिफ़्ट — गया पैसा और जाँच",
    "guide.w9Title": "खर्च और नोज़ल की जाँच भरें",
    "guide.w9Link": "शिफ़्ट रिपोर्ट खोलें",
    "guide.w9e1": "हर खर्च, अपनी किसी एक खर्च मद के नीचे।",
    "guide.w9e2": "हर नोज़ल पर नाप-तौल की जाँच में निकाले गए लीटर।",

    "guide.w10Screen": "शिफ़्ट — नकद",
    "guide.w10Title": "बीच शिफ़्ट की जमा दर्ज करें और हर सेल्समैन का हिसाब करें",
    "guide.w10Link": "शिफ़्ट रिपोर्ट खोलें",
    "guide.w10e1": "शिफ़्ट के बीच जो कैश जमा हुआ — समय और किसने लिया, दोनों दर्ज होते हैं।",
    "guide.w10e2": "आख़िर में हर सेल्समैन ने कितना नकद जमा किया।",
    "guide.w10tip":
      "अपेक्षित नकद = उसकी नोज़ल की बिक्री − उसका दिया उधार − उसके लिए गए डिजिटल पेमेंट। गल्ले से उसने जो खर्च किए वे दिखते तो हैं, पर घटाए नहीं जाते। कमी उस पर बकाया बन जाती है।",

    "guide.w11Screen": "शिफ़्ट — समापन",
    "guide.w11Title": "पहले सबमिट करें, फिर लॉक",
    "guide.w11Link": "शिफ़्ट रिपोर्ट खोलें",
    "guide.w11e1": "शिफ़्ट पूरी मानने के लिए सबमिट करें।",
    "guide.w11e2": "उसे जमा देने के लिए लॉक करें।",
    "guide.w11tip":
      "लॉक करने से ग्राहकों का बकाया अपडेट होता है और शिफ़्ट बहीखाते में चढ़ जाती है। अनलॉक करने पर उलटी एंट्री चढ़ती हैं; कुछ मिटाया नहीं जाता।",

    "guide.w12Screen": "बहीखाता और रिपोर्ट",
    "guide.w12Title": "देखें कि शिफ़्ट से खातों में क्या हुआ",
    "guide.w12Link": "बहीखाता खोलें",
    "guide.w12e1": "बहीखाते में ट्रायल बैलेंस, लाभ-हानि और बैलेंस शीट।",
    "guide.w12e2": "रिपोर्ट में बिक्री और खर्च का विश्लेषण।",
    "guide.w12tip":
      "बहीखाता आपकी पहली लॉक की हुई शिफ़्ट से शुरू होता है। बैंक जमा, स्टाफ़ एडवांस और बैंक भेजा गया नकद बहीखाते से तभी चढ़ते हैं जब आप कहें — बार-बार चलाना सुरक्षित है।",
  },
};
