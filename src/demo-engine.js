// ClauseCheck — Demo-mode engine.
//
// A deterministic, rule-based local analyser. It is ONLY used when no real
// Firebase config has been pasted yet (see firebase-config.js), so the full
// demo flow can be exercised end-to-end before setup. Every result it
// produces is badged DEMO in the UI and is never presented as AI output.
// When Firebase is configured, this engine is not used for AI features.
//
// Rules are keyword heuristics over well-known risky clause patterns
// (auto-renewal, deposit forfeiture, unilateral increases, unlimited
// entry, steep penalties, one-sided termination, waived rights).

const RULES = [
  {
    id: "auto-renewal",
    category: "Auto-renewal",
    severity: "High",
    patterns: [/automatically renew/i, /auto-renew/i, /shall automatically/i],
    reason: "Locks you into another full term unless you opt out months ahead.",
    explain:
      "This clause renews the contract by itself. If you forget to give notice in time (here, 90 days early), you are bound for another full term on the same conditions — even if you planned to move out.",
    rewrite:
      "This agreement ends on the stated end date. It only renews if both sides agree in writing at least 30 days before the end date.",
  },
  {
    id: "deposit-forfeiture",
    category: "Deposit forfeiture",
    severity: "High",
    patterns: [/non-refundable/i, /forfeit/i, /sole discretion/i],
    reason: "You can lose your whole deposit even for ordinary wear or early exit.",
    explain:
      "Your deposit is the money you get back when you leave, minus fair deductions for damage you caused. This wording lets the other side keep all of it — and decide the deductions alone, with no limit.",
    rewrite:
      "The deposit is refundable. Within 14 days after you move out, the other side returns it minus itemised deductions for damage beyond normal wear, with receipts.",
  },
  {
    id: "unilateral-increase",
    category: "Unilateral price increase",
    severity: "High",
    patterns: [/may increase the rent/i, /no right to object/i, /introduce additional charges/i],
    reason: "The price can go up at any time, with no cap and no way to refuse.",
    explain:
      "This lets one side change the price whenever it wants, by any amount, and says you cannot object. Your monthly cost is not fixed — it can rise with only a few days' notice.",
    rewrite:
      "The price is fixed for the agreed term. Any change needs both sides to agree in writing at least 60 days ahead, and is capped at the local inflation rate.",
  },
  {
    id: "late-fee",
    category: "Late fee",
    severity: "Medium",
    patterns: [/late fee/i, /per day shall apply/i, /% of the monthly rent per day/i],
    reason: "A daily percentage fee grows very fast — a few days late can cost a full month.",
    explain:
      "A 5% fee per day means a 10-day delay costs 50% of a month's rent on top of the rent itself. Small delays become very expensive, very quickly.",
    rewrite:
      "If payment is more than 7 days late, a one-time late fee of up to 5% of the monthly amount applies. No daily compounding.",
  },
  {
    id: "repair-burden",
    category: "Repair burden",
    severity: "Medium",
    patterns: [/responsible for all repairs/i, /including structural repairs/i],
    reason: "Makes you pay for structural problems you did not cause.",
    explain:
      "Normally the owner pays for structural problems (roof, structure, main plumbing) and you pay for small day-to-day upkeep. This clause pushes all of it onto you, whatever the cause.",
    rewrite:
      "The owner handles structural and major repairs. You handle minor day-to-day upkeep and report problems promptly.",
  },
  {
    id: "unlimited-entry",
    category: "Unlimited access",
    severity: "High",
    patterns: [/enter the property at any time/i, /without prior notice/i],
    reason: "Removes your privacy — entry any time, with no notice at all.",
    explain:
      "Your home is private. This clause allows entry at any hour with no warning, for any stated reason. Fair agreements require advance notice (usually 24 hours) except for genuine emergencies.",
    rewrite:
      "Entry needs at least 24 hours' written notice, at reasonable hours, except in an emergency such as fire or a burst pipe.",
  },
  {
    id: "one-sided-termination",
    category: "One-sided termination",
    severity: "High",
    patterns: [/may terminate .* at any time/i, /penalty equal to three/i, /7 days written notice for any reason/i],
    reason: "One side can walk away in 7 days; you pay 3 months to do the same.",
    explain:
      "The exit rules are not equal. One side can end the agreement in a week for any reason, while you must pay a three-month penalty plus lose your deposit to leave early.",
    rewrite:
      "Either side may end the agreement early with 30 days' written notice. The early-exit fee is at most one month's payment, and the deposit is returned separately under the deposit clause.",
  },
  {
    id: "waived-rights",
    category: "Waived legal rights",
    severity: "Medium",
    patterns: [/waives the right/i, /exclusively by arbitration/i, /no right to bring/i],
    reason: "Gives up your right to go to court, forcing arbitration elsewhere.",
    explain:
      "This sends all disputes to private arbitration in a far-away city and blocks you from going to court. Arbitration can be costly, and the location alone makes small claims impractical.",
    rewrite:
      "Disputes are first settled by discussion, then mediation. Either side may use the courts where the property is located.",
  },
  {
    id: "extra-charges",
    category: "Hidden charges",
    severity: "Medium",
    patterns: [/additional charges/i, /management fee/i],
    reason: "Extra fees can be added later on short notice.",
    explain:
      "Beyond the headline price, this adds fees that can be created or changed later with only a week's notice — so the real monthly cost is uncertain.",
    rewrite:
      "All fees are listed in this agreement. No new fee can be added during the term without both sides agreeing in writing.",
  },
];

export function splitClauses(text) {
  // Split on numbered headings / blank lines; keep a readable label.
  const parts = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 20);
  return parts.map((body, i) => {
    const firstLine = body.split("\n")[0].trim();
    const title = /^[0-9]+\./.test(firstLine)
      ? firstLine.replace(/^[0-9]+\.\s*/, "")
      : firstLine.length < 60
        ? firstLine
        : `Clause ${i + 1}`;
    return { index: i, title, body };
  });
}

export function demoScan(text) {
  const clauses = splitClauses(text);
  const flags = [];
  for (const clause of clauses) {
    for (const rule of RULES) {
      if (rule.patterns.some((re) => re.test(clause.body))) {
        flags.push({
          clauseIndex: clause.index,
          clauseTitle: clause.title,
          clauseText: clause.body,
          category: rule.category,
          severity: rule.severity,
          reason: rule.reason,
          ruleId: rule.id,
        });
        break; // one flag per clause: the strongest matching rule
      }
    }
  }
  // If nothing matched, return one Low informational flag per longest clause.
  return { clauses, flags };
}

export function demoExplain(clauseText) {
  const rule = RULES.find((r) => r.patterns.some((re) => re.test(clauseText)));
  if (!rule) {
    return "This clause looks standard: it states a duty or a definition without an obvious penalty, automatic charge, or one-sided right. Read it once more for any numbers (fees, days, amounts) and check what happens if either side breaks it.";
  }
  return rule.explain;
}

export function demoRewrite(clauseText) {
  const rule = RULES.find((r) => r.patterns.some((re) => re.test(clauseText)));
  if (!rule) return clauseText;
  return rule.rewrite;
}

export function demoSummary(text) {
  const { flags } = demoScan(text);
  const high = flags.filter((f) => f.severity === "High").length;
  const medium = flags.filter((f) => f.severity === "Medium").length;
  const riskScore = Math.min(100, Math.round(10 + high * 8 + medium * 4 + flags.length));
  const topRisks = flags.slice(0, 5).map((f) => ({
    title: f.category,
    severity: f.severity,
    detail: f.reason,
  }));
  const checklist = flags.map(
    (f) => `Ask about "${f.category}": ${f.reason} What would a fair version look like?`
  );
  checklist.push("Confirm the exact amounts, dates, and notice periods in writing before signing.");
  checklist.push("Ask for a copy of the final signed agreement and keep it safe.");
  const draftEmail = `Subject: A few questions about the agreement before I sign\n\nHi,\n\nThank you for sending the agreement. Before I sign, I would like to clarify a few points:\n\n${flags
    .map((f, i) => `${i + 1}. ${f.category} — ${f.reason}`)
    .join("\n")}\n\nCould we agree on fair wording for these points? I am happy to sign once they are clarified in writing.\n\nThank you,\n[Your name]`;
  const summary = `This document contains ${flags.length} flagged clause(s): ${high} high-severity and ${medium} medium-severity. The main concerns are ${topRisks
    .map((r) => r.title.toLowerCase())
    .join(", ") || "none found"}. Overall risk score: ${riskScore}/100 — ${
    riskScore >= 60
      ? "high: negotiate the flagged points before signing."
      : riskScore >= 35
        ? "moderate: ask for the flagged points to be clarified in writing."
        : "low: read the numbers once more, then it looks reasonable to sign."
  }`;
  return { summary, riskScore, topRisks, checklist, draftEmail };
}
