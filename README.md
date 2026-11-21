# ClauseCheck — Read the fine print before you sign

A single-page web app for renters, freelancers and gig workers. Paste any
contract text and get: risky clauses flagged with severity (**on-device**,
Gemini Nano 4), any clause explained in plain English (**on-device**), a
plain-English clause rewrite (**hybrid**, prefer on-device), and a
full-document summary + risk score + negotiation checklist + draft email
(**cloud**, Gemini Flash). Every AI answer shows an `ON_DEVICE` /
`IN_CLOUD` badge read from the Firebase AI Logic SDK's
`response.inferenceSource`.

Built for the **Firebase #BuildHybridAI 2026** hackathon (Web/Chrome track)
with Firebase AI Logic. Text-only, free tier, no billing required.

> **ClauseCheck explains — it does not give legal advice.**

## Quick start

```bash
npm install
npm run dev      # local dev server
npm run build    # production build -> dist/
npm run preview  # serve the production build locally
```

## Firebase setup (required for real AI)

Until a Firebase config is added, the app runs in **Demo mode**: the full
flow works end-to-end using a built-in rule-based local engine, and every
result is badged DEMO (never presented as AI). To enable real hybrid AI:

1. Go to the [Firebase console](https://console.firebase.google.com) and
   sign in as ketong.ardi@gmail.com.
2. Create a project (e.g. `clausecheck`).
3. Open **AI Services > AI Logic**, click **Get started**, choose the
   **Gemini Developer API** provider (free, no billing), and finish the
   guided setup (it enforces App Check for AI Logic).
4. Register a **Web app** in the project and copy the `firebaseConfig`
   object.
5. Paste the values into `src/firebase-config.js`, replacing the
   `PASTE_YOUR_…` placeholders.
6. `npm run build` and deploy `dist/` (see below).

## On-device model (Gemini Nano) — demo machine

On-device inference needs Chrome 139+ on desktop:

1. Enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`.
2. Restart Chrome.
3. Open DevTools console and run `await LanguageModel.availability();`
   (expect `available`, `downloading` or `downloadable`; if `downloadable`,
   run `await LanguageModel.create();` to start the download).
4. In the app, click **Prepare on-device model** (a user gesture is
   required before the first on-device call).

Without Nano, every feature still works via the cloud fallback
(`PREFER_ON_DEVICE` modes) — the badge shows where each answer ran.

## Deploy

- **Firebase Hosting (preferred, free tier):** once the project exists,
  `npx firebase-tools init hosting` (choose `dist` as the public directory,
  single-page app: yes), then `npx firebase-tools deploy --only hosting`.
- **GitHub Pages (fallback):** the build uses a relative base (`./`), so
  `dist/` can be published as-is to any static host or Pages project site.

## How the hybrid split works

| Feature | Inference mode | Model |
| --- | --- | --- |
| Instant clause scanner | `ONLY_ON_DEVICE` | Gemini Nano 4 |
| Explain this clause | `ONLY_ON_DEVICE` | Gemini Nano 4 |
| Plain-English rewrite | `PREFER_ON_DEVICE` | Nano, cloud fallback |
| Summary + risk score + negotiation kit | `ONLY_IN_CLOUD` | `gemini-2.5-flash` |

On-device web inference is single-turn text generation only (no chat) —
all on-device features are single-turn prompts. Cloud calls retry with
exponential backoff on 503/429. Analyses are saved in `localStorage`
only — no account, no upload.

## License

Apache 2.0 (see LICENSE).
