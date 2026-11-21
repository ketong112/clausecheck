// ClauseCheck — Firebase configuration.
//
// >>> SETUP REQUIRED: paste your Firebase web app config here. <<<
// 1. Go to the Firebase console (https://console.firebase.google.com)
//    and sign in as ketong.ardi@gmail.com.
// 2. Create a project (e.g. "clausecheck"), open AI Services > AI Logic,
//    click "Get started", choose the Gemini Developer API provider.
// 3. Register a Web app in the project, copy the firebaseConfig object,
//    and paste it below, replacing the placeholder values.
// 4. Rebuild (`npm run build`) and redeploy.
//
// Until real values are pasted, `CONFIGURED` stays false and ClauseCheck
// runs in DEMO MODE: every feature works end-to-end using a built-in
// rule-based local engine, clearly badged DEMO (never presented as AI).
// No data leaves the browser in demo mode.
export const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY_HERE",
  authDomain: "PASTE_YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "PASTE_YOUR_MESSAGING_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID",
};

// True only when a real config has been pasted in.
export const CONFIGURED =
  firebaseConfig.apiKey !== "PASTE_YOUR_API_KEY_HERE" &&
  firebaseConfig.projectId !== "PASTE_YOUR_PROJECT_ID";
