#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 *
 * Resolve Autodevelop product origins from env, then environments-policy.
 * Loopback is a local sandbox default only. A remote runtime never returns
 * localhost or 127.0.0.1. CLI prints key names and origins, not secrets.
 */
import { fileURLToPath } from "node:url";
import { loadPolicies } from "./policies-load.mjs";

export const ORIGIN_ENV_KEYS = {
  host: "AUTODEVELOP_HOST",
  api: "AUTODEVELOP_API_ORIGIN",
  tickets: "NEXT_PUBLIC_AUTODEVELOP_TICKETS_ORIGIN",
  try: "NEXT_PUBLIC_AUTODEVELOP_TRY_ORIGIN",
};

export const LOCAL_DEFAULTS = {
  host: "http://127.0.0.1:8787",
  api: "http://127.0.0.1:8789",
  tickets: "http://localhost:5174",
};

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const stripSlash = (value) => String(value || "").trim().replace(/\/$/, "");

export const isLoopbackOrigin = (value) => {
  const raw = stripSlash(value);
  if (!raw) return false;
  try {
    return LOOPBACK.has(new URL(raw).hostname);
  } catch {
    return false;
  }
};

/** Vercel (`VERCEL`), or an explicit hosted environment name. */
export const isRemoteRuntime = (env = process.env) => {
  if (String(env.VERCEL || "").trim()) return true;
  if (String(env.K_SERVICE || "").trim()) return true;
  const named = String(env.AUTODEVELOP_ENV || "").trim().toLowerCase();
  return named === "staging" || named === "production";
};

export const environmentId = (env = process.env, policy = {}) => {
  const named = String(env.AUTODEVELOP_ENV || "").trim();
  if (named) return named;
  if (String(env.VERCEL_ENV || "").trim() === "production") {
    return policy.defaultProductionName || "production";
  }
  if (String(env.VERCEL_ENV || "").trim() === "preview") return "preview";
  if (isRemoteRuntime(env)) return policy.defaultProductionName || "production";
  return "local";
};

const policyOrigins = (policy, id) => {
  const row = policy?.environments?.[id] || {};
  const origins = row.origins && typeof row.origins === "object" ? row.origins : {};
  return {
    host: stripSlash(origins.host || ""),
    api: stripSlash(origins.api || ""),
    tickets: stripSlash(origins.tickets || ""),
  };
};

const pickOrigin = ({ configured, fromPolicy, localDefault, remote }) => {
  const raw = stripSlash(configured) || stripSlash(fromPolicy);
  if (raw) return remote && isLoopbackOrigin(raw) ? "" : raw;
  if (remote) return "";
  return localDefault;
};

export const resolveOrigins = ({
  env = process.env,
  policy = {},
  environment = "",
} = {}) => {
  const id = environment || environmentId(env, policy);
  const remote = isRemoteRuntime(env) || (id !== "local" && id !== "");
  const fromPolicy = policyOrigins(policy, id);
  const tickets = pickOrigin({
    configured: env[ORIGIN_ENV_KEYS.tickets],
    fromPolicy: fromPolicy.tickets,
    localDefault: LOCAL_DEFAULTS.tickets,
    remote,
  });
  const tryOrigin = pickOrigin({
    configured: env[ORIGIN_ENV_KEYS.try],
    fromPolicy: fromPolicy.tickets,
    localDefault: tickets,
    remote,
  });
  return {
    environment: id,
    remote,
    host: pickOrigin({
      configured: env[ORIGIN_ENV_KEYS.host],
      fromPolicy: fromPolicy.host,
      localDefault: LOCAL_DEFAULTS.host,
      remote,
    }),
    api: pickOrigin({
      configured: env[ORIGIN_ENV_KEYS.api],
      fromPolicy: fromPolicy.api,
      localDefault: LOCAL_DEFAULTS.api,
      remote,
    }),
    tickets,
    try: tryOrigin,
  };
};

export const loadOrigins = (options = {}) => {
  const env = options.env || process.env;
  const loaded = options.policies || loadPolicies(options);
  const policy = loaded.policies?.["environments-policy"] || {};
  const origins = resolveOrigins({
    env,
    policy,
    environment: options.environment,
  });
  return {
    instance: loaded.instance,
    path: loaded.path,
    ...origins,
  };
};

export const summarizeOrigins = (loaded) => ({
  instance: loaded.instance,
  environment: loaded.environment,
  remote: loaded.remote,
  keys: ORIGIN_ENV_KEYS,
  origins: {
    host: loaded.host,
    api: loaded.api,
    tickets: loaded.tickets,
    try: loaded.try,
  },
});

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const loaded = loadOrigins();
  process.stdout.write(`${JSON.stringify(summarizeOrigins(loaded), null, 2)}\n`);
}
