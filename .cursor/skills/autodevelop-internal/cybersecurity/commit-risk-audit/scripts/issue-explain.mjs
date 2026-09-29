/**
 * Copyright (c) 2026 Devrecated
 *
 * Stakeholder copy for findings. Business-first, then the fix.
 * Deterministic — no names. Used by PDF/CSV/markdown.
 */

const BY_RULE = {
  "express/unprotected-route": {
    why: "This HTTP route shipped without authentication on the handler, beside the route, or on a parent mount. Anyone who can reach the URL can invoke the action.",
    should:
      "Authenticate globally and whitelist public paths. Mount role middleware on the parent (for example router.use(\"/admin\", adminAuthMiddleware, admin)) or pass middleware beside the route.",
  },
  "functions/onrequest-unauth": {
    why: "A Firebase HTTPS function accepts callers without verifying identity. The Admin SDK bypasses Firestore rules, so a missing check is a full data/action hole.",
    should: "Verify the Firebase ID token (or callable context.auth) and enforce the caller’s role on the server before any privileged work.",
  },
  "express/unvalidated-input": {
    why: "Request body, query, or params are used without a schema. Attackers can send unexpected shapes and trigger logic or injection bugs.",
    should: "Validate at the API boundary with Zod, Joi, celebrate, or express-validator (in the file, imported *Validation, or a sibling schema).",
  },
  "express/cors-star": {
    why: "CORS allows any website origin. A malicious page in a user’s browser can call the API with that user’s cookies or tokens.",
    should: "Allow only known portal/uploader origins. Do not use origin: '*' or origin: true with credentials.",
  },
  "express/trust-proxy-true": {
    why: "trust proxy = true trusts every X-Forwarded-For hop. Clients can spoof IPs used for rate limits and audit logs.",
    should: "Set trust proxy to the exact hop count (or the load-balancer CIDR), not true.",
  },
  "express/jwt-no-algs": {
    why: "jwt.verify without an algorithms allowlist can accept a token signed with a weaker or unexpected algorithm (algorithm confusion).",
    should: "Always pass { algorithms: [\"RS256\"] } (or the exact algorithms this service issues).",
  },
  "react/no-danger": {
    why: "Raw HTML was injected into the page. If any of that string is user- or email-controlled, this is a cross-site scripting (XSS) hole.",
    should: "Sanitize with DOMPurify.sanitize (or do not use dangerouslySetInnerHTML). Prefer plain text or a vetted renderer.",
  },
  "react/no-innerhtml": {
    why: "innerHTML / document.write can execute attacker-controlled markup in the browser.",
    should: "Use React text nodes or a sanitizer. Never assign unsanitized strings to innerHTML.",
  },
  "react/no-array-index-key": {
    why: "Array index as a React key breaks list identity when items reorder, causing wrong rows to keep state.",
    should: "Use a stable id from the model (vehicle id, application id), not the loop index.",
  },
  "typescript/no-explicit-any": {
    why: "Explicit any / double assertions hide real type errors. Bugs slip into inventory, financing, and role checks.",
    should: "Use types from the shared models package. Narrow unions instead of any.",
  },
  "eslint/ban-ts-comment": {
    why: "A lint or typecheck suppression means the compiler was silenced. The next change will not be checked.",
    should: "Fix the type. If a suppression is unavoidable, scope it to one line and explain why.",
  },
  "no-console": {
    why: "console.log left on a production path can leak tokens, PII, or just noise in hosted logs.",
    should: "Use the structured logger. Never log ID tokens, passwords, or raw PII.",
  },
  "security/detect-eval": {
    why: "eval / new Function run arbitrary strings as code. User input here is remote code execution.",
    should: "Delete it. Parse with JSON.parse or a real interpreter you control. Never eval user input.",
  },
  "security/detect-child-process": {
    why: "A shell command was built from a string. User-controlled pieces become command injection.",
    should: "Use execFile/spawn with an argument array. Never interpolate untrusted strings into a shell line.",
  },
  "security/detect-sql-concat": {
    why: "SQL built with string concatenation is injection. A crafted value can read or change other rows.",
    should: "Use parameterized queries or the Firestore SDK. Never concatenate user input into a query string.",
  },
  "security/localstorage-token": {
    why: "An auth token in localStorage is readable by any XSS on the origin. Stolen tokens impersonate the user.",
    should: "Keep Firebase session in the official Auth persistence. Do not write token/jwt/password keys to localStorage.",
  },
  "firestore/open-allow": {
    why: "A Firestore/Storage rule allows access when the condition is true. That collection is world-readable or writable.",
    should: "Require request.auth and ownership/role (client_id, bank_id, uid). Ship the same rule to staging and production.",
  },
  "slop/ai-narrative-comment": {
    why: "Narrative or stub comments add no business behavior and often mark unreviewed generated code.",
    should: "Delete the comment or replace it with a decision that a future reader cannot infer from the types.",
  },
  "slop/section-divider": {
    why: "Decorative divider comments clutter the file and are a common generated-code tell.",
    should: "Remove them. Use real functions and files to structure the work.",
  },
  "slop/ai-attribution": {
    why: "The source file attributes itself to an AI tool. That is not a quality proof, but it is a review-risk signal.",
    should: "Remove the attribution. Review the change as if a human authored it.",
  },
  "slop/comment-density": {
    why: "A high ratio of narrative comments to code usually means the change was dumped, not designed.",
    should: "Keep comments that record a non-obvious constraint. Delete step-by-step narration.",
  },
  "ui/inline-style-soup": {
    why: "Hardcoded colors and px spacing ignore the design system. Screens look inconsistent and are expensive to restyle.",
    should: "Use the MUI theme (theme.palette, spacing, breakpoints). Do not paste raw #hex / px into sx.",
  },
  "ui/oversized-component": {
    why: "Hundreds of lines in one view file are hard to review, test, or reuse. Bugs hide in the dump.",
    should: "Extract cards, hooks, and dialogs. Views stay composition; logic lives in src/hooks.",
  },
  "quality/empty-catch": {
    why: "An empty catch swallows failures. Users see success while writes or auth quietly fail.",
    should: "Log through the logger and surface an error to the caller. Do not leave catch {} empty.",
  },
  "quality/commented-out-code": {
    why: "Commented-out code is not reviewed and goes stale. Readers cannot tell if it is required.",
    should: "Delete it. Git keeps history.",
  },
  "quality/redundant-helper": {
    why: "The same helper was declared more than once in one diff. Duplicates drift and double the bug surface.",
    should: "Keep one helper and import it.",
  },
};

const BY_CATEGORY = {
  secrets: {
    why: "A secrets-like file (.env, service account JSON, pem, credentials) was committed. Keys in git are stolen keys.",
    should: "Remove the file from git history if it shipped. Use Secret Manager and pnpm env:sandbox / env:prod. Rotate anything that landed.",
  },
  security: {
    why: "This change introduces a security defect (XSS, injection, token storage, or an open check).",
    should: "Apply the AppSec baseline: validate at the boundary, no unsanitized HTML, no eval/exec on user input, no tokens in logs.",
  },
  api_auth: {
    why: "An API or Cloud Function endpoint is missing deny-by-default auth, validation, or CORS hardening.",
    should: "Authenticate on the parent mount, validate input with a schema, and keep CORS on known origins.",
  },
  react: {
    why: "This UI change creates an XSS surface or a React identity bug that shows the wrong row’s data.",
    should: "Sanitize HTML or do not inject it. Use stable model ids as keys.",
  },
  firestore_rules: {
    why: "A feature reached staging or production without a matching Firestore/Storage rule, or it opened an allow.",
    should: "Update both staging and production rules. Match the collection above wildcards. Require auth + ownership.",
  },
  models: {
    why: "Feature code did not update the shared models package. Other screens, the API, and converters will drift and ship bugs.",
    should: "Add or extend the type in the shared models package and import it. Do not re-declare domain shapes in the app.",
  },
  breaking: {
    why: "A model changed without a Firestore converter (or a new model file has no converter). Reads/writes will silently drop or mistranslate fields.",
    should: "Add a FirestoreDataConverter with toFirestore/fromFirestore field mapping and use .withConverter on the collection.",
  },
  lint: {
    why: "The change violates TypeScript/ESLint hygiene (any, suppressions, leftover console). These are quality defects, not production auth holes.",
    should: "Restore types from the shared models package, remove suppressions, and drop console.log from production paths.",
  },
  slop: {
    why: "The change shows careless or unreviewed dump patterns (narrative comments, AI attribution, empty catches).",
    should: "Rewrite for the actual business rule. Remove narration. This is not proof a model wrote the code.",
  },
  ui: {
    why: "The view is cluttered or oversized. Operators will see inconsistent screens; reviewers cannot find the real change.",
    should: "Use theme tokens and extract components/hooks. Keep views thin.",
  },
  quality: {
    why: "The commit is unusually large, skips tests, or leaves dead code. Review quality drops and bugs hide.",
    should: "Split the change, restore tests, and delete commented-out code.",
  },
  cross_feature: {
    why: "One commit couples unrelated product areas without a shared type. Fixes in one domain will break another.",
    should: "Put the shared contract in the models package and keep feature diffs focused.",
  },
};

const DEFAULT = {
  why: "This finding is a review heuristic from the commit-risk audit. It may increase defect or security risk.",
  should: "Open the GitHub line, confirm the context, and apply the house standard for that category.",
};

export function explainFinding(r) {
  const rule = r?.rule_id && BY_RULE[r.rule_id];
  const cat = r?.category && BY_CATEGORY[r.category];
  const why = rule?.why || cat?.why || DEFAULT.why;
  const should = rule?.should || cat?.should || DEFAULT.should;
  return { why, should };
}

export function severityLabel(severity) {
  if (severity === "critical") return "Critical";
  if (severity === "high") return "High";
  if (severity === "medium") return "Medium";
  return "Low";
}

export function envLabel(r) {
  const stg = r?.on_master;
  const prod = r?.on_release;
  if (stg && prod) return "Reached staging and production";
  if (prod) return "Reached production";
  if (stg) return "Reached staging";
  return "Not on master/release";
}
