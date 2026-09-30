// pricing screens. Keys are "pricing.*". See docs/hindi-glossary.md for the agreed wording.
//
// A rate revision revalues fuel the pump already owns. It is not cash in hand and no money
// moves today — that caveat has to survive translation, so the wording stays blunt.
export const pricing = {
  en: {
    "pricing.title": "Price Revision & Revaluation",
    "pricing.subtitle":
      "Rates move daily. The litres already in your tanks get revalued with them — a paper gain or loss, not cash.",
    "pricing.record": "Record price revision",
    "pricing.reviseRate": "Revise rate",

    // per-fuel cards
    "pricing.sellingRate": "selling rate / L",
    "pricing.since": " · since {when}",
    "pricing.avgCost": "Avg cost / L",
    "pricing.margin": "Margin / L",
    "pricing.inStock": "In stock",
    "pricing.stockAtRate": "Stock at rate",
    "pricing.noCostBasis":
      "{count} tank(s) have no cost basis yet — litres counted from the last shift's closing stock.",

    // period
    "pricing.period": "Period",
    "pricing.periodDesc": "Revaluation gain or loss recorded in this window, across all fuels.",
    "pricing.netReval": "Net stock revaluation",
    "pricing.revisionsPaper": "{count} revision(s) — paper value, not cash",

    // by fuel
    "pricing.byFuel": "Revaluation by fuel",
    "pricing.byFuelDesc":
      "How much of the period's result came from price movement rather than from selling fuel.",
    "pricing.col.fuel": "Fuel",
    "pricing.col.revisions": "Revisions",
    "pricing.col.opening": "Opening",
    "pricing.col.closing": "Closing",
    "pricing.col.low": "Low",
    "pricing.col.high": "High",
    "pricing.col.net": "Net gain / loss",
    "pricing.noRevisionsPeriod": "No price revisions recorded in this period.",

    // margin chart
    "pricing.marginTitle": "Margin per litre",
    "pricing.marginDesc": "Selling rate minus weighted-average cost, per day.",
    "pricing.marginSnapshot": " Cost is today's average cost basis applied across the range.",
    "pricing.noMargin": "No margin to chart yet — a rate and a tank cost basis are both needed.",
    "pricing.litresSold": "{label} — {litres} L sold",

    // history
    "pricing.history": "Revision history",
    "pricing.historyDesc": "Every recorded rate change, with the stock it revalued.",
    "pricing.fuel": "Fuel",
    "pricing.allFuels": "All fuels",
    "pricing.gains": "Gains {v}",
    "pricing.losses": "Losses {v}",
    "pricing.netBadge": "Net {v}",
    "pricing.col.effective": "Effective",
    "pricing.col.oldNew": "Old → New / L",
    "pricing.col.change": "Change / L",
    "pricing.col.stockAt": "Stock at revision",
    "pricing.col.gainLoss": "Gain / loss",
    "pricing.noRevisions": "No revisions yet. Record one when the company changes your rate.",

    // dialog
    "pricing.dialog.title": "Record price revision",
    "pricing.dialog.desc":
      "Sets the new selling rate and records what the change does to the fuel already in your tanks.",
    "pricing.currentRate": "Current rate (₹/L)",
    "pricing.notSet": "Not set",
    "pricing.newRate": "New rate (₹/L)",
    "pricing.effectiveFrom": "Effective from (optional — defaults to now)",
    "pricing.noRateSet":
      "No rate is set for {fuel} yet, so there is nothing to revise. Set the opening rate under Fuel Rates first.",
    "pricing.stockImpact":
      "You have {litres} L of {fuel} in stock. Enter a new rate to see what the change does to its value.",
    "pricing.sameRate": "That is the same as the current rate — nothing to revise.",
    "pricing.impact.adds":
      "You have {litres} L of {fuel} in stock. A {change} increase adds {amount} to the value of that stock.",
    "pricing.impact.takes":
      "You have {litres} L of {fuel} in stock. A {change} decrease takes {amount} from the value of that stock.",
    "pricing.paperNote":
      "This revalues fuel you already own — it is not cash in hand, and no money moves today.",
    "pricing.noInventoryState":
      "{count} tank(s) have no running inventory state; their litres come from the last shift's closing stock.",
    "pricing.recordBtn": "Record revision",
    "pricing.revised":
      "Rate revised. Stock revalued by {value} ({litres} L on hand).",
  },
  hi: {
    "pricing.title": "रेट बदलाव और स्टॉक की नई वैल्यू",
    "pricing.subtitle":
      "रेट रोज़ बदलते हैं। आपकी टंकियों में पड़े लीटर की वैल्यू भी उनके साथ बदल जाती है — यह कागज़ी फ़ायदा या नुकसान है, नकद नहीं।",
    "pricing.record": "रेट बदलाव दर्ज करें",
    "pricing.reviseRate": "रेट बदलें",

    "pricing.sellingRate": "बिक्री रेट / L",
    "pricing.since": " · {when} से",
    "pricing.avgCost": "औसत लागत / L",
    "pricing.margin": "मार्जिन / L",
    "pricing.inStock": "स्टॉक में",
    "pricing.stockAtRate": "रेट पर स्टॉक की वैल्यू",
    "pricing.noCostBasis":
      "{count} टंकी की लागत अभी दर्ज नहीं है — लीटर पिछली शिफ़्ट के अंतिम स्टॉक से गिने गए हैं।",

    "pricing.period": "अवधि",
    "pricing.periodDesc": "इस अवधि में दर्ज स्टॉक वैल्यू का फ़ायदा या नुकसान, सभी ईंधन मिलाकर।",
    "pricing.netReval": "स्टॉक वैल्यू में कुल बदलाव",
    "pricing.revisionsPaper": "{count} रेट बदलाव — कागज़ी वैल्यू, नकद नहीं",

    "pricing.byFuel": "ईंधन के हिसाब से वैल्यू बदलाव",
    "pricing.byFuelDesc":
      "इस अवधि के नतीजे का कितना हिस्सा तेल बेचने से नहीं, बल्कि रेट बदलने से आया।",
    "pricing.col.fuel": "ईंधन",
    "pricing.col.revisions": "बदलाव",
    "pricing.col.opening": "शुरुआती",
    "pricing.col.closing": "अंतिम",
    "pricing.col.low": "सबसे कम",
    "pricing.col.high": "सबसे ज़्यादा",
    "pricing.col.net": "कुल फ़ायदा / नुकसान",
    "pricing.noRevisionsPeriod": "इस अवधि में कोई रेट बदलाव दर्ज नहीं हुआ।",

    "pricing.marginTitle": "प्रति लीटर मार्जिन",
    "pricing.marginDesc": "बिक्री रेट में से औसत लागत घटाकर, रोज़ का हिसाब।",
    "pricing.marginSnapshot": " लागत आज की औसत लागत मानी गई है, पूरी अवधि के लिए।",
    "pricing.noMargin": "चार्ट के लिए अभी मार्जिन नहीं है — रेट और टंकी की लागत दोनों चाहिए।",
    "pricing.litresSold": "{label} — {litres} L बिके",

    "pricing.history": "रेट बदलाव का इतिहास",
    "pricing.historyDesc": "दर्ज हुआ हर रेट बदलाव, और उससे स्टॉक की वैल्यू में कितना फ़र्क़ पड़ा।",
    "pricing.fuel": "ईंधन",
    "pricing.allFuels": "सभी ईंधन",
    "pricing.gains": "फ़ायदा {v}",
    "pricing.losses": "नुकसान {v}",
    "pricing.netBadge": "कुल {v}",
    "pricing.col.effective": "लागू",
    "pricing.col.oldNew": "पुराना → नया / L",
    "pricing.col.change": "बदलाव / L",
    "pricing.col.stockAt": "उस समय स्टॉक",
    "pricing.col.gainLoss": "फ़ायदा / नुकसान",
    "pricing.noRevisions": "अभी कोई बदलाव दर्ज नहीं। कंपनी रेट बदले तो यहाँ दर्ज करें।",

    "pricing.dialog.title": "रेट बदलाव दर्ज करें",
    "pricing.dialog.desc":
      "नया बिक्री रेट सेट होता है, और टंकियों में पहले से पड़े तेल पर इसका असर दर्ज होता है।",
    "pricing.currentRate": "मौजूदा रेट (₹/L)",
    "pricing.notSet": "सेट नहीं है",
    "pricing.newRate": "नया रेट (₹/L)",
    "pricing.effectiveFrom": "कब से लागू (ज़रूरी नहीं — खाली छोड़ें तो अभी से)",
    "pricing.noRateSet":
      "{fuel} का अभी कोई रेट सेट नहीं है, इसलिए बदलने को कुछ नहीं है। पहले ईंधन रेट में शुरुआती रेट डालें।",
    "pricing.stockImpact":
      "आपके पास {litres} L {fuel} स्टॉक में है। नया रेट डालें, फिर देखें कि उसकी वैल्यू पर क्या असर पड़ेगा।",
    "pricing.sameRate": "यह मौजूदा रेट के बराबर ही है — बदलने को कुछ नहीं।",
    "pricing.impact.adds":
      "आपके पास {litres} L {fuel} स्टॉक में है। {change} की बढ़ोतरी से उस स्टॉक की वैल्यू में {amount} जुड़ेंगे।",
    "pricing.impact.takes":
      "आपके पास {litres} L {fuel} स्टॉक में है। {change} की कमी से उस स्टॉक की वैल्यू में से {amount} घटेंगे।",
    "pricing.paperNote":
      "इससे आपके पास पहले से मौजूद तेल की वैल्यू बदलती है — यह हाथ में आया नकद नहीं है, और आज कोई पैसा इधर-उधर नहीं होता।",
    "pricing.noInventoryState":
      "{count} टंकी का स्टॉक अभी चालू नहीं है; उनके लीटर पिछली शिफ़्ट के अंतिम स्टॉक से लिए गए हैं।",
    "pricing.recordBtn": "बदलाव दर्ज करें",
    "pricing.revised":
      "रेट बदल गया। स्टॉक की वैल्यू {value} बदली ({litres} L स्टॉक में)।",
  },
};
