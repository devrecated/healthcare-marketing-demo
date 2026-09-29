#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated.
 *
 * POST a session recap. Never reads or sends a chat transcript.
 */
import { sanitizeFeedback } from "../../scripts/outcomes-client.mjs";

const arg = (name) => {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return "";
  return String(process.argv[idx + 1] || "").trim();
};

export const recapsEndpoint = (base) => {
  const trimmed = String(base || "").trim();
  if (!trimmed) return "";
  if (/\/context\/recaps\/?$/i.test(trimmed)) return trimmed.replace(/\/$/, "");
  if (/\/entitlement\/?$/i.test(trimmed)) {
    return trimmed.replace(/\/entitlement\/?$/i, "/context/recaps");
  }
  return `${trimmed.replace(/\/$/, "")}/context/recaps`;
};

export const readSubscriptionToken = (env = process.env) => {
  for (const key of ["AUTODEVELOP_TOKEN", "TOKEN"]) {
    const value = env[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return null;
};

const isDirectRun = Boolean(process.argv[1]) && process.argv[1].endsWith("submit-recap.mjs");

if (isDirectRun) {
  const recap = sanitizeFeedback(arg("--recap") || arg("--text"));
  if (!recap) {
    process.stderr.write(
      "usage: submit-recap.mjs --recap \"<summary>\" [--ticket N] [--outcome success|failure|unknown]\n",
    );
    process.exit(1);
  }

  const url = recapsEndpoint(process.env.AUTODEVELOP_ENTITLEMENT_URL);
  if (!url) {
    process.stderr.write("AUTODEVELOP_ENTITLEMENT_URL is unset — recap was not sent.\n");
    process.exit(1);
  }

  const token = readSubscriptionToken();
  if (!token) {
    process.stderr.write("AUTODEVELOP_TOKEN is unset — recap was not sent.\n");
    process.exit(1);
  }

  const payload = {
    recap,
    ticket_number: arg("--ticket") ? Number(arg("--ticket")) : null,
    outcome: ["success", "failure", "unknown"].includes(arg("--outcome")) ? arg("--outcome") : "unknown",
    blockers: sanitizeFeedback(arg("--blockers")),
    people_mentioned: sanitizeFeedback(arg("--people")),
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      process.stderr.write("Recap could not be delivered.\n");
      process.exit(1);
    }
    process.stdout.write("Recap stored.\n");
  } catch {
    process.stderr.write("Recap could not be delivered.\n");
    process.exit(1);
  }
}
