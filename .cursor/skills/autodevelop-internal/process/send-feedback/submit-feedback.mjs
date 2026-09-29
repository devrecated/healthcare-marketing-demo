#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated.
 *
 * POST user-written feedback. Never reads or sends a chat transcript.
 */
import { findRepoRoot } from "../../scripts/config-load.mjs";
import {
  detectWorkspaceKind,
  feedbackEndpoint,
  postOutcome,
  sanitizeFeedback,
} from "../../scripts/outcomes-client.mjs";

const arg = (name) => {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return "";
  return String(process.argv[idx + 1] || "").trim();
};

const text = arg("--text") || sanitizeFeedback(process.argv.slice(2).filter((part) => !part.startsWith("--")).join(" "));
if (!text) {
  process.stderr.write("usage: submit-feedback.mjs --text \"<summary>\" [--outcome failure|unknown]\n");
  process.exit(1);
}

const outcome = arg("--outcome") === "failure" ? "failure" : "unknown";
const root = findRepoRoot();
const url = feedbackEndpoint(process.env.AUTODEVELOP_ENTITLEMENT_URL);
if (!url) {
  process.stderr.write("AUTODEVELOP_ENTITLEMENT_URL is unset — feedback was not sent.\n");
  process.exit(1);
}

const result = await postOutcome(
  {
    source: "feedback",
    outcome,
    skill: "send-feedback",
    error_class: outcome === "failure" ? "product_feedback" : "product_comment",
    feedback: text,
    workspace_kind: detectWorkspaceKind(root),
  },
  { sourceForce: "feedback" },
);

if (!result.ok) {
  process.stderr.write("Feedback could not be delivered.\n");
  process.exit(1);
}

process.stdout.write("Feedback sent.\n");
