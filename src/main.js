// ClauseCheck — UI wiring.
// Flow: paste contract -> Scan (on-device) -> Explain / Rewrite any clause
// -> Full summary + negotiation kit (cloud). Results are saved locally
// (localStorage); no account, no upload. Every AI answer shows its
// inference-source badge (ON_DEVICE / IN_CLOUD / DEMO).

import { SAMPLE_CONTRACT } from "./sample-contract.js";
import {
  demoScan,
  demoExplain,
  demoRewrite,
  demoSummary,
  splitClauses,
} from "./demo-engine.js";
import {
  isConfigured,
  aiScan,
  aiScanCloud,
  aiExplain,
  aiRewrite,
  aiSummarize,
  checkNanoAvailability,
  prepareOnDeviceModel,
} from "./ai.js";

const $ = (id) => document.getElementById(id);
const HISTORY_KEY = "clausecheck.history.v1";

let currentText = "";
let currentFlags = [];
let currentClauses = [];
let currentSummary = null;
let lastScanSource = null;

// ---------- badges ----------
function badgeEl(source) {
  const map = {
    ON_DEVICE: ["badge on-device", "ON_DEVICE · Gemini Nano (on-device)"],
    IN_CLOUD: ["badge in-cloud", "IN_CLOUD · Gemini Flash (cloud)"],
    DEMO: ["badge demo", "DEMO · local rule preview (no AI yet)"],
    UNKNOWN: ["badge unknown", "SOURCE UNKNOWN"],
  };
  const [cls, label] = map[source] || map.UNKNOWN;
  const el = document.createElement("span");
  el.className = cls;
  el.textContent = label;
  return el;
}

// ---------- model status ----------
async function refreshNanoStatus() {
  const pill = $("nanoStatus");
  if (!isConfigured) {
    pill.textContent = "Demo mode — paste Firebase config to enable AI";
    pill.className = "pill demo";
    return;
  }
  const status = await checkNanoAvailability();
  const labels = {
    available: "Gemini Nano: ready on this device",
    downloading: "Gemini Nano: downloading model…",
    downloadable: "Gemini Nano: ready to download",
    unavailable: "Gemini Nano: not available — cloud fallback will be used",
    "not-supported": "Gemini Nano: not supported in this browser",
  };
  pill.textContent = labels[status] || `Gemini Nano: ${status}`;
  pill.className = "pill " + (status === "available" ? "ok" : "warn");
}

$("btnPrepareNano").addEventListener("click", async () => {
  const btn = $("btnPrepareNano");
  btn.disabled = true;
  btn.textContent = "Preparing on-device model…";
  const res = await prepareOnDeviceModel((p) => {
    $("nanoProgress").textContent = `Download progress: ${Math.round(p * 100)}%`;
  });
  if (res.ok) {
    $("nanoProgress").textContent = "On-device model ready.";
    await refreshNanoStatus();
  } else {
    $("nanoProgress").textContent =
      res.reason === "not-configured"
        ? "Add your Firebase config first (see README)."
        : `Could not prepare on-device model: ${res.reason}`;
  }
  btn.disabled = false;
  btn.textContent = "Prepare on-device model";
});

// ---------- input ----------
$("btnSample").addEventListener("click", () => {
  $("contractInput").value = SAMPLE_CONTRACT;
  currentText = SAMPLE_CONTRACT;
});
$("btnClear").addEventListener("click", () => {
  $("contractInput").value = "";
  $("scanResults").innerHTML = "";
  $("explainPanel").hidden = true;
  $("summarySection").hidden = true;
  $("scanStatus").textContent = "";
  currentText = "";
  currentFlags = [];
  currentSummary = null;
});

// ---------- scan ----------
function severityChip(sev) {
  const el = document.createElement("span");
  el.className = "sev sev-" + sev.toLowerCase();
  el.textContent = sev;
  return el;
}

function renderFlags(flags, source) {
  const box = $("scanResults");
  box.innerHTML = "";
  const head = document.createElement("div");
  head.className = "result-head";
  const title = document.createElement("h3");
  title.textContent =
    flags.length === 0
      ? "No risky clauses found"
      : `${flags.length} risky clause${flags.length > 1 ? "s" : ""} flagged`;
  head.append(title, badgeEl(source));
  box.appendChild(head);

  if (flags.length === 0) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent =
      "Nothing in this text matched the risky-clause patterns. Read the numbers (fees, days, amounts) once more before signing.";
    box.appendChild(p);
    return;
  }
  for (const f of flags) {
    const card = document.createElement("article");
    card.className = "flag-card";
    const top = document.createElement("div");
    top.className = "flag-top";
    top.append(severityChip(f.severity));
    const cat = document.createElement("strong");
    cat.textContent = f.category || f.clauseTitle || "Risky clause";
    top.appendChild(cat);
    card.appendChild(top);
    const quote = document.createElement("blockquote");
    quote.textContent = f.clauseText || f.clause || "";
    card.appendChild(quote);
    const reason = document.createElement("p");
    reason.textContent = f.reason;
    card.appendChild(reason);
    const actions = document.createElement("div");
    actions.className = "row";
    const bExplain = document.createElement("button");
    bExplain.className = "btn small";
    bExplain.textContent = "Explain this clause";
    bExplain.addEventListener("click", () => explainClause(f.clauseText || f.clause));
    const bRewrite = document.createElement("button");
    bRewrite.className = "btn small ghost";
    bRewrite.textContent = "Rewrite in plain English";
    bRewrite.addEventListener("click", () => rewriteClause(f.clauseText || f.clause));
    actions.append(bExplain, bRewrite);
    card.appendChild(actions);
    box.appendChild(card);
  }
}

async function runScan() {
  const text = $("contractInput").value.trim();
  if (text.length < 50) {
    $("scanStatus").textContent = "Paste a contract first (at least a few sentences), or load the sample.";
    return;
  }
  currentText = text;
  currentSummary = null;
  $("summarySection").hidden = true;
  $("explainPanel").hidden = true;
  $("scanStatus").textContent = "Scanning…";
  $("btnScan").disabled = true;
  try {
    if (!isConfigured) {
      const { clauses, flags } = demoScan(text);
      currentClauses = clauses;
      currentFlags = flags;
      lastScanSource = "DEMO";
      renderFlags(flags, "DEMO");
      $("scanStatus").textContent = `Demo scan complete: ${flags.length} flag(s). This is a rule-based preview — add Firebase config for real AI.`;
    } else {
      try {
        const res = await aiScan(text);
        currentFlags = res.flags;
        currentClauses = splitClauses(text);
        lastScanSource = res.source;
        renderFlags(res.flags, res.source);
        $("scanStatus").textContent = `Scan complete: ${res.flags.length} flag(s) — answered ${res.source === "ON_DEVICE" ? "on-device" : "in the cloud"}.`;
      } catch (err) {
        // ONLY_ON_DEVICE threw (Nano unavailable): offer the cloud route.
        currentClauses = splitClauses(text);
        $("scanStatus").textContent = "";
        const box = $("scanResults");
        box.innerHTML = "";
        const warn = document.createElement("div");
        warn.className = "notice";
        warn.innerHTML =
          "<strong>On-device scan unavailable on this device.</strong> " +
          "Gemini Nano needs Chrome 139+ on desktop with the Prompt API flag enabled " +
          "(chrome://flags/#prompt-api-for-gemini-nano-multimodal-input) and the model downloaded. " +
          "You can still scan via the cloud fallback.";
        const retry = document.createElement("button");
        retry.className = "btn";
        retry.textContent = "Scan in cloud instead";
        retry.addEventListener("click", async () => {
          retry.disabled = true;
          retry.textContent = "Scanning in cloud…";
          try {
            const res = await aiScanCloud(text);
            currentFlags = res.flags;
            lastScanSource = res.source;
            renderFlags(res.flags, res.source);
            $("scanStatus").textContent = `Cloud scan complete: ${res.flags.length} flag(s).`;
          } catch (e2) {
            $("scanStatus").textContent = `Cloud scan failed: ${e2.message}`;
          }
        });
        box.append(warn, retry);
      }
    }
    saveHistory();
  } catch (err) {
    $("scanStatus").textContent = `Scan failed: ${err.message}`;
  } finally {
    $("btnScan").disabled = false;
  }
}
$("btnScan").addEventListener("click", runScan);

// ---------- explain / rewrite ----------
async function explainClause(clauseText) {
  const panel = $("explainPanel");
  panel.hidden = false;
  $("explainText").textContent = "Explaining…";
  $("explainBadge").innerHTML = "";
  $("rewriteText").textContent = "";
  $("rewriteBadge").innerHTML = "";
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  try {
    if (!isConfigured) {
      $("explainText").textContent = demoExplain(clauseText);
      $("explainBadge").appendChild(badgeEl("DEMO"));
    } else {
      const res = await aiExplain(clauseText);
      $("explainText").textContent = res.text;
      $("explainBadge").appendChild(badgeEl(res.source));
    }
  } catch (err) {
    $("explainText").textContent = `Could not explain this clause: ${err.message}`;
  }
}

async function rewriteClause(clauseText) {
  const panel = $("explainPanel");
  panel.hidden = false;
  $("rewriteText").textContent = "Rewriting…";
  $("rewriteBadge").innerHTML = "";
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  try {
    if (!isConfigured) {
      $("rewriteText").textContent = demoRewrite(clauseText);
      $("rewriteBadge").appendChild(badgeEl("DEMO"));
    } else {
      const res = await aiRewrite(clauseText);
      $("rewriteText").textContent = res.text;
      $("rewriteBadge").appendChild(badgeEl(res.source));
    }
  } catch (err) {
    $("rewriteText").textContent = `Could not rewrite this clause: ${err.message}`;
  }
}

// ---------- summary + negotiation kit ----------
function renderSummary(data, source) {
  currentSummary = data;
  const sec = $("summarySection");
  sec.hidden = false;
  $("summaryBadge").innerHTML = "";
  $("summaryBadge").appendChild(badgeEl(source));
  $("summaryText").textContent = data.summary;
  const score = Math.max(0, Math.min(100, Math.round(data.riskScore)));
  $("riskScore").textContent = `${score} / 100`;
  const bar = $("riskBarFill");
  bar.style.width = `${score}%`;
  bar.className =
    "risk-fill " + (score >= 60 ? "high" : score >= 35 ? "med" : "low");
  $("riskLabel").textContent =
    score >= 60
      ? "High risk — negotiate the flagged points before signing."
      : score >= 35
        ? "Moderate risk — ask for the flagged points in writing."
        : "Low risk — read the numbers once more, then it looks reasonable.";
  const risks = $("topRisks");
  risks.innerHTML = "";
  (data.topRisks || []).forEach((r) => {
    const li = document.createElement("li");
    li.append(severityChip(r.severity), document.createTextNode(" "));
    const b = document.createElement("strong");
    b.textContent = r.title + ": ";
    li.append(b, document.createTextNode(r.detail || ""));
    risks.appendChild(li);
  });
  const checks = $("checklist");
  checks.innerHTML = "";
  (data.checklist || []).forEach((c) => {
    const li = document.createElement("li");
    li.textContent = c;
    checks.appendChild(li);
  });
  $("draftEmail").value = data.draftEmail || "";
  saveHistory();
  sec.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

$("btnSummarize").addEventListener("click", async () => {
  const text = $("contractInput").value.trim();
  if (text.length < 50) {
    $("summaryStatus").textContent = "Paste a contract first, or load the sample.";
    return;
  }
  currentText = text;
  $("summaryStatus").textContent = "Asking the cloud model for a full summary…";
  $("btnSummarize").disabled = true;
  try {
    if (!isConfigured) {
      renderSummary(demoSummary(text), "DEMO");
      $("summaryStatus").textContent = "Demo summary (rule-based preview).";
    } else {
      const res = await aiSummarize(text);
      renderSummary(res, res.source);
      $("summaryStatus").textContent = "Summary complete.";
    }
  } catch (err) {
    $("summaryStatus").textContent = `Summary failed: ${err.message}`;
  } finally {
    $("btnSummarize").disabled = false;
  }
});

$("btnCopyEmail").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("draftEmail").value);
    $("btnCopyEmail").textContent = "Copied!";
    setTimeout(() => ($("btnCopyEmail").textContent = "Copy email"), 2000);
  } catch {
    $("draftEmail").select();
    document.execCommand("copy");
  }
});

// ---------- history (localStorage only) ----------
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory() {
  if (!currentText) return;
  // De-dupe by document text: re-saving the same analysis updates it
  // in place instead of piling up duplicate entries.
  const items = loadHistory().filter((e) => e.text !== currentText);
  const entry = {
    id: Date.now(),
    date: new Date().toISOString(),
    title: (currentClauses[0]?.title || currentText.slice(0, 60)) + "…",
    flags: currentFlags.length,
    riskScore: currentSummary ? Math.round(currentSummary.riskScore) : null,
    source: lastScanSource,
    text: currentText,
    summary: currentSummary,
  };
  items.unshift(entry);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 20)));
  renderHistory();
}

function renderHistory() {
  const list = $("historyList");
  list.innerHTML = "";
  const items = loadHistory();
  if (items.length === 0) {
    list.innerHTML = '<li class="muted">No saved analyses yet. They are stored only in this browser.</li>';
    return;
  }
  for (const item of items) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "history-item";
    btn.textContent = `${new Date(item.date).toLocaleString()} — ${item.title} (${item.flags} flags${item.riskScore !== null ? `, risk ${item.riskScore}` : ""})`;
    btn.addEventListener("click", () => {
      $("contractInput").value = item.text;
      currentText = item.text;
      currentClauses = splitClauses(item.text);
      if (item.summary) renderSummary(item.summary, item.source || "DEMO");
    });
    li.appendChild(btn);
    list.appendChild(li);
  }
}

$("btnClearHistory").addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});

// ---------- boot ----------
if (!isConfigured) {
  $("demoBanner").hidden = false;
}
renderHistory();
refreshNanoStatus();
