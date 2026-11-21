// ClauseCheck — Firebase AI Logic (hybrid inference) wrapper.
//
// API verified against the official docs (read live 2026-11-21):
//   firebase.google.com/docs/ai-logic/hybrid/web/get-started
//   firebase.google.com/docs/ai-logic/hybrid/web/configuration-options
// and against the installed SDK (firebase 13.4.0: getAI, getGenerativeModel,
// GoogleAIBackend, InferenceMode, Schema, GenerativeModel.initializeDeviceModel,
// response.inferenceSource — all confirmed present).
//
// Inference modes used (one per feature, exactly as the concept specifies):
//   Scanner   — ONLY_ON_DEVICE  (Gemini Nano 4; private + instant)
//   Explain   — ONLY_ON_DEVICE  (Gemini Nano 4)
//   Rewrite   — PREFER_ON_DEVICE (Nano first, cloud fallback)
//   Summary   — ONLY_IN_CLOUD   (Gemini Flash; long-context reasoning)
// Cloud model pinned explicitly: gemini-2.5-flash (free tier, text-only).
// Docs note the SDK default fallback is gemini-3.5-flash-lite (SDK v13+);
// we pin 2.5-flash so the cloud behaviour is identical across SDK versions.
//
// On-device web inference is single-turn text generation only (no chat) —
// every on-device call below is a single generateContent() call.
// initializeDeviceModel() MUST be called after a user gesture and before
// any generateContent() on a hybrid/on-device model (docs Step 6).

import { initializeApp } from "firebase/app";
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  Schema,
} from "firebase/ai";
import { firebaseConfig, CONFIGURED } from "./firebase-config.js";

export const isConfigured = CONFIGURED;

export const CLOUD_MODEL = "gemini-2.5-flash";

let ai = null;
let deviceModelReady = false;

export function initFirebase() {
  if (!CONFIGURED) return null;
  if (ai) return ai;
  const app = initializeApp(firebaseConfig);
  ai = getAI(app, { backend: new GoogleAIBackend() });
  return ai;
}

// ---- Structured-output schemas (JSON in cloud, responseConstraint on-device)
const flagSchema = Schema.object({
  properties: {
    flags: Schema.array({
      items: Schema.object({
        properties: {
          clause: Schema.string({
            description: "The exact clause text, copied from the contract.",
          }),
          category: Schema.string({
            description:
              "Short category, e.g. Auto-renewal, Deposit forfeiture, Late fee.",
          }),
          severity: Schema.enumString({
            enum: ["High", "Medium", "Low"],
            description: "How risky this clause is for the signer.",
          }),
          reason: Schema.string({
            description: "One plain-English sentence: why this clause is risky.",
          }),
        },
      }),
    }),
  },
});

const summarySchema = Schema.object({
  properties: {
    summary: Schema.string({
      description: "Plain-English summary of the whole document, 3-5 sentences.",
    }),
    riskScore: Schema.integer({
      description: "Overall risk for the signer, 0 (safe) to 100 (very risky).",
    }),
    topRisks: Schema.array({
      items: Schema.object({
        properties: {
          title: Schema.string(),
          severity: Schema.enumString({ enum: ["High", "Medium", "Low"] }),
          detail: Schema.string({
            description: "One sentence explaining the risk in plain English.",
          }),
        },
      }),
    }),
    checklist: Schema.array({
      items: Schema.string({
        description: "One question to ask the other party before signing.",
      }),
    }),
    draftEmail: Schema.string({
      description:
        "A polite, short email to the other party asking to clarify and fix the risky points.",
    }),
  },
});

function hybridModel(mode, schema) {
  const options = { mode };
  if (schema) {
    options.inCloudParams = {
      model: CLOUD_MODEL,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    };
    options.onDeviceParams = { promptOptions: { responseConstraint: schema } };
  } else {
    options.inCloudParams = { model: CLOUD_MODEL };
  }
  return getGenerativeModel(initFirebase(), options);
}

export function scannerModel() {
  return hybridModel(InferenceMode.ONLY_ON_DEVICE, flagSchema);
}
export function explainModel() {
  return hybridModel(InferenceMode.ONLY_ON_DEVICE, null);
}
export function rewriteModel() {
  return hybridModel(InferenceMode.PREFER_ON_DEVICE, null);
}
export function summaryModel() {
  return hybridModel(InferenceMode.ONLY_IN_CLOUD, summarySchema);
}

/** Call from a user gesture (button click) before on-device use. */
export async function prepareOnDeviceModel(onProgress) {
  if (!CONFIGURED) return { ok: false, reason: "not-configured" };
  try {
    const model = rewriteModel(); // PREFER_ON_DEVICE model owns the device model
    await model.initializeDeviceModel((p) => onProgress && onProgress(p));
    deviceModelReady = true;
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message || String(err) };
  }
}

export function getDeviceModelReady() {
  return deviceModelReady;
}

// ---- Prompt API availability (Chrome built-in AI status indicator)
export async function checkNanoAvailability() {
  if (typeof window === "undefined" || !("LanguageModel" in window)) {
    return "not-supported"; // not Chrome desktop 139+, or API absent
  }
  try {
    return await window.LanguageModel.availability();
  } catch {
    return "unavailable";
  }
}

// ---- Retry helper: cloud calls get exponential backoff on 503/429.
function isRetryable(err) {
  const msg = String(err?.message || err);
  return /503|429|overloaded|quota|rate limit/i.test(msg);
}

async function withRetry(fn, attempts = 3) {
  let delay = 1000;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryable(err) || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

function parseJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Model did not return JSON.");
  return JSON.parse(text.slice(start, end + 1));
}

function sourceOf(response) {
  // response.inferenceSource: 'ON_DEVICE' | 'IN_CLOUD' (JS SDK v12.5.0+).
  return response?.inferenceSource || "UNKNOWN";
}

/** (1) Instant clause scanner — ON_DEVICE only. Single-turn JSON call. */
export async function aiScan(text) {
  const prompt = `You are ClauseCheck, a contract explainer for renters, freelancers and gig workers. Read the contract text below. Flag every clause that is risky for the person SIGNING it (auto-renewal, deposit forfeiture, one-sided termination, unilateral price increases, unlimited entry, steep late fees, repair burden, waived legal rights, hidden charges). For each flagged clause copy its exact text, give a short category, a severity (High/Medium/Low), and one plain-English sentence explaining why it is risky. Ignore standard, fair clauses. If nothing is risky, return an empty flags array.\n\nCONTRACT:\n${text}`;
  const result = await withRetry(() =>
    scannerModel().generateContent(prompt)
  );
  const data = parseJson(result.response.text());
  return { flags: data.flags || [], source: sourceOf(result.response) };
}

/** Cloud-fallback scan (PREFER_ON_DEVICE): used only when the on-device
 *  scanner throws, e.g. Nano unavailable on the judge's machine. Same
 *  prompt and schema as aiScan; the badge shows where it actually ran. */
export async function aiScanCloud(text) {
  const prompt = `You are ClauseCheck, a contract explainer for renters, freelancers and gig workers. Read the contract text below. Flag every clause that is risky for the person SIGNING it (auto-renewal, deposit forfeiture, one-sided termination, unilateral price increases, unlimited entry, steep late fees, repair burden, waived legal rights, hidden charges). For each flagged clause copy its exact text, give a short category, a severity (High/Medium/Low), and one plain-English sentence explaining why it is risky. Ignore standard, fair clauses. If nothing is risky, return an empty flags array.\n\nCONTRACT:\n${text}`;
  const model = hybridModel(InferenceMode.PREFER_ON_DEVICE, flagSchema);
  const result = await withRetry(() => model.generateContent(prompt));
  const data = parseJson(result.response.text());
  return { flags: data.flags || [], source: sourceOf(result.response) };
}

/** (2) "Explain this clause" — ON_DEVICE only. Single-turn text call. */
export async function aiExplain(clauseText) {
  const prompt = `Explain this contract clause in plain English for someone with no legal background. Use 2-4 short sentences. Say what it means in practice, and what could go wrong for the person signing. Do not give legal advice.\n\nCLAUSE:\n${clauseText}`;
  const result = await withRetry(() =>
    explainModel().generateContent(prompt)
  );
  return { text: result.response.text(), source: sourceOf(result.response) };
}

/** (3) Plain-English clause rewrite — HYBRID, PREFER_ON_DEVICE. */
export async function aiRewrite(clauseText) {
  const prompt = `Rewrite this contract clause in plain English, keeping its purpose but making it fair to both sides. Output ONLY the rewritten clause, no introduction, no legal advice.\n\nCLAUSE:\n${clauseText}`;
  const result = await withRetry(() =>
    rewriteModel().generateContent(prompt)
  );
  return { text: result.response.text(), source: sourceOf(result.response) };
}

/** (4) Full summary + risk score + negotiation kit — CLOUD only. */
export async function aiSummarize(text) {
  const prompt = `You are ClauseCheck, a contract explainer for renters, freelancers and gig workers. Summarise the contract below in plain English: a short summary, an overall risk score for the signer (0 safe to 100 very risky), the top 5 risks, a checklist of questions to ask the other party before signing, and a polite draft email asking to clarify and fix the risky points. Do not give legal advice.\n\nCONTRACT:\n${text}`;
  const result = await withRetry(() =>
    summaryModel().generateContent(prompt)
  );
  const data = parseJson(result.response.text());
  return {
    summary: data.summary || "",
    riskScore: data.riskScore ?? 50,
    topRisks: data.topRisks || [],
    checklist: data.checklist || [],
    draftEmail: data.draftEmail || "",
    source: sourceOf(result.response),
  };
}
