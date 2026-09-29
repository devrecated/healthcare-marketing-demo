#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findInstanceFile } from "./config-load.mjs";
import { normalizeEmail } from "./lib.mjs";

export const VERBAL_ACCEPTANCE_PREFIX = "Verbal acceptance confirmed by";

export const peoplePath = (root) => {
  const hit = findInstanceFile(root, "autodevelop", "people.json");
  return hit?.path || join(root, ".cursor", "skills", "<instance>", "autodevelop", "people.json");
};

export const readPeopleFile = (root) => {
  const path = peoplePath(root);
  if (!existsSync(path)) return { path, people: null };
  return { path, people: JSON.parse(readFileSync(path, "utf8")) };
};

export const validatePeople = (people) => {
  if (people == null) return [];
  if (typeof people !== "object") return ["people must be an object"];
  const errors = [];
  if (!Array.isArray(people.developers)) errors.push("people.developers must be an array");
  if (!Array.isArray(people.stakeholders)) errors.push("people.stakeholders must be an array");
  if (people.alwaysNotifyEmails != null && !Array.isArray(people.alwaysNotifyEmails)) {
    errors.push("people.alwaysNotifyEmails must be an array");
  }
  for (const [listName, list] of [
    ["developers", people.developers],
    ["stakeholders", people.stakeholders],
  ]) {
    if (!Array.isArray(list)) continue;
    list.forEach((person, index) => {
      if (!person?.name) errors.push(`${listName}[${index}].name is required`);
      if (!person?.email) errors.push(`${listName}[${index}].email is required`);
    });
  }
  return errors;
};

const emailsOf = (people) =>
  [...(people?.developers || []), ...(people?.stakeholders || [])]
    .map((person) => normalizeEmail(person.email))
    .filter(Boolean);

export const alwaysNotifyEmails = (people) => {
  const extra = (people?.alwaysNotifyEmails || []).map(normalizeEmail);
  const flagged = (people?.stakeholders || [])
    .filter((person) => person.alwaysNotify)
    .map((person) => normalizeEmail(person.email));
  return [...new Set([...extra, ...flagged].filter(Boolean))];
};

export const applyPeople = (config, people) => {
  if (!people) return config;
  const developers = people.developers || [];
  const stakeholders = people.stakeholders || [];
  const notify = alwaysNotifyEmails(people);
  const allowlist = [...new Set([...(config.mail?.allowlist || []).map(normalizeEmail), ...emailsOf(people), ...notify])];
  return {
    ...config,
    people: { developers, stakeholders, alwaysNotifyEmails: notify },
    stakeholders: [...stakeholders, ...developers],
    mail: { ...(config.mail || {}), allowlist },
  };
};

export const digestRecipients = (config) => {
  const fromStakeholders = (config.people?.stakeholders || []).map((person) => normalizeEmail(person.email));
  const notify = config.people?.alwaysNotifyEmails || [];
  return [...new Set([...fromStakeholders, ...notify].filter(Boolean))];
};

const needleOf = (loginOrEmail) => String(loginOrEmail || "").replace(/^@/, "").trim().toLowerCase();

const matchesPerson = (person, needle) =>
  normalizeEmail(person.email) === needle || String(person.github || "").toLowerCase() === needle;

export const findPerson = (config, loginOrEmail) => {
  const needle = needleOf(loginOrEmail);
  if (!needle) return null;
  const lists = [config.people?.stakeholders, config.people?.developers, config.stakeholders];
  for (const list of lists) {
    const hit = (list || []).find((person) => matchesPerson(person, needle));
    if (hit) return hit;
  }
  return null;
};

export const isDeveloper = (config, loginOrEmail) => {
  const needle = needleOf(loginOrEmail);
  return (config.people?.developers || []).some((person) => matchesPerson(person, needle));
};

export const isStakeholder = (config, loginOrEmail) => {
  const needle = needleOf(loginOrEmail);
  return (config.people?.stakeholders || []).some((person) => matchesPerson(person, needle));
};

export const boardUrl = (config) =>
  `https://github.com/orgs/${config.github.owner}/projects/${config.github.projectNumber}`;

export const boardTicketUrl = (config, databaseId) =>
  `${boardUrl(config)}/views/1?pane=issue&itemId=${databaseId}`;

export const verbalAcceptanceComment = ({ github, name, date = new Date() }) => {
  const login = String(github || "").replace(/^@/, "");
  const day = new Date(date).toISOString().slice(0, 10);
  return `${VERBAL_ACCEPTANCE_PREFIX} @${login} with ${name} on ${day}`;
};

export const hasVerbalAcceptance = (text) =>
  String(text || "").includes(VERBAL_ACCEPTANCE_PREFIX);
