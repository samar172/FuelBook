// Opening balances — what the business already had on the day it started using
// FuelBook. Most pumps start mid-year, so this is the screen that makes the
// books true from day one.
export const opening = {
  en: {
    "opening.title": "Opening Balances",
    "opening.subtitle":
      "What the business already had on the day you started using FuelBook. Most pumps start mid-year, so fill this in once and the books will be right from day one.",
    "opening.asOn": "As on",
    "opening.asOnHelp": "The day before you start recording shifts here.",
    "opening.alreadyPosted":
      "Opening balances are already posted for {date}. Editing here replaces them — the old entry is reversed, nothing is counted twice.",
    "opening.cash": "Cash in hand",
    "opening.cashHelp": "Notes and coins in the drawer and the office safe.",
    "opening.bank": "Bank balances",
    "opening.bankEmpty": "No bank accounts yet. Add one under Cash & Bank.",
    "opening.customers": "What customers already owe you",
    "opening.customersHelp": "Udhaar outstanding on the day you start. Leave a customer blank if they owe nothing.",
    "opening.customersEmpty": "No credit customers yet.",
    "opening.fuel": "Fuel already in your tanks",
    "opening.fuelHelp":
      "Litres in each tank and what that fuel cost you. This sets the cost basis, so your first sale shows a real profit instead of counting the fuel as free.",
    "opening.fuelEmpty": "No tanks yet. Add them under Pump Setup.",
    "opening.litres": "Litres",
    "opening.value": "Value at cost",
    "opening.perLitre": "{rate}/L",
    "opening.products": "Lubes and other stock",
    "opening.productsEmpty": "No products yet.",
    "opening.quantity": "Quantity",
    "opening.staffAdvances": "Advances given to staff",
    "opening.staffShortages": "Cash shortages staff still owe",
    "opening.staffEmpty": "No staff yet.",
    "opening.payable": "What you owe the oil company",
    "opening.payableHelp": "Unpaid tanker bills on the day you start.",
    "opening.summary": "Summary",
    "opening.totalAssets": "What the business owns",
    "opening.totalLiabilities": "What the business owes",
    "opening.capital": "Your capital in the business",
    "opening.capitalHelp":
      "This is the balancing figure — simply what you already had in the business. It is not something you type in.",
    "opening.capitalNegative":
      "This is negative, which means the pump started owing more than it held. Unusual, but allowed.",
    "opening.save": "Post opening balances",
    "opening.saved": "Opening balances posted",
    "opening.ownerOnly": "Only the owner can post opening balances.",
    "opening.tradedWarning":
      "This pump has already recorded shifts. Opening balances still work, but enter them as on the day BEFORE your first shift so nothing is counted twice.",
    "opening.nothingEntered": "Nothing entered yet — fill in whatever the business already had.",
  },
  hi: {
    "opening.title": "शुरुआती बकाया (ओपनिंग बैलेंस)",
    "opening.subtitle":
      "जिस दिन आपने FuelBook चलाना शुरू किया, उस दिन कारोबार में जो कुछ पहले से था। ज़्यादातर पंप साल के बीच में शुरू करते हैं, इसलिए यह एक बार भर दें और बही पहले दिन से सही रहेगी।",
    "opening.asOn": "किस तारीख़ तक",
    "opening.asOnHelp": "यहाँ शिफ़्ट लिखना शुरू करने से एक दिन पहले की तारीख़।",
    "opening.alreadyPosted":
      "{date} के शुरुआती बकाया पहले से चढ़े हुए हैं। यहाँ बदलने पर वही बदल जाएँगे — पुरानी एंट्री पलट दी जाती है, कुछ भी दो बार नहीं गिना जाता।",
    "opening.cash": "हाथ का नकद",
    "opening.cashHelp": "गल्ले और ऑफ़िस की तिजोरी में रखे नोट और सिक्के।",
    "opening.bank": "बैंक में जमा",
    "opening.bankEmpty": "अभी कोई बैंक खाता नहीं। नकद और बैंक में जाकर जोड़ें।",
    "opening.customers": "ग्राहकों पर पहले से बकाया",
    "opening.customersHelp": "शुरू करने के दिन तक का उधार। जिस ग्राहक पर कुछ बाकी नहीं, उसे खाली छोड़ दें।",
    "opening.customersEmpty": "अभी कोई उधार ग्राहक नहीं।",
    "opening.fuel": "टंकी में पहले से पड़ा तेल",
    "opening.fuelHelp":
      "हर टंकी में कितने लीटर हैं और वह तेल आपको कितने का पड़ा। इससे लागत तय होती है, ताकि पहली बिक्री पर असली मुनाफ़ा दिखे और तेल मुफ़्त का न गिना जाए।",
    "opening.fuelEmpty": "अभी कोई टंकी नहीं। पंप सेटअप में जाकर जोड़ें।",
    "opening.litres": "लीटर",
    "opening.value": "लागत के हिसाब से कीमत",
    "opening.perLitre": "{rate}/लीटर",
    "opening.products": "ऑयल और दूसरा स्टॉक",
    "opening.productsEmpty": "अभी कोई सामान नहीं।",
    "opening.quantity": "मात्रा",
    "opening.staffAdvances": "कर्मचारियों को दिया गया एडवांस",
    "opening.staffShortages": "कर्मचारियों पर नकद की कमी बाकी",
    "opening.staffEmpty": "अभी कोई कर्मचारी नहीं।",
    "opening.payable": "तेल कंपनी को देना है",
    "opening.payableHelp": "शुरू करने के दिन तक टैंकर के बिना चुकाए बिल।",
    "opening.summary": "सारांश",
    "opening.totalAssets": "कारोबार के पास क्या है",
    "opening.totalLiabilities": "कारोबार पर क्या देना है",
    "opening.capital": "कारोबार में आपकी पूँजी",
    "opening.capitalHelp":
      "यह मिलान का आँकड़ा है — यानी जो कुछ आपके पास पहले से था। इसे भरना नहीं पड़ता, यह अपने आप निकलता है।",
    "opening.capitalNegative":
      "यह माइनस में है, यानी शुरू में पंप के पास जितना था उससे ज़्यादा देना था। ऐसा कम होता है, पर चल जाता है।",
    "opening.save": "शुरुआती बकाया चढ़ाएँ",
    "opening.saved": "शुरुआती बकाया चढ़ गए",
    "opening.ownerOnly": "शुरुआती बकाया सिर्फ़ मालिक चढ़ा सकते हैं।",
    "opening.tradedWarning":
      "इस पंप की शिफ़्ट पहले से दर्ज हैं। शुरुआती बकाया फिर भी चलेंगे, पर तारीख़ पहली शिफ़्ट से एक दिन पहले की रखें ताकि कुछ दो बार न गिना जाए।",
    "opening.nothingEntered": "अभी कुछ नहीं भरा — कारोबार के पास जो पहले से था, वह भर दें।",
  },
};
