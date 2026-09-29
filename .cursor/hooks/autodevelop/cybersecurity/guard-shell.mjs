#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 */
import { asString, collectStrings, readHookInput, writeHookOutput } from '../lib.mjs'
import { loadConfig, workspaceRootFromHook } from '../../../skills/autodevelop-internal/scripts/config-load.mjs'

const SECRET_PATH =
  /(?:^|[\s'"=/])(?:\.env(?:\.[A-Za-z0-9._-]*)?|tests\/\.env|tests\/portal\/\.auth(?:\/\S*)?|serviceAccount\.json|firebase-admin[^/\s]*\.json|service\.json|\S*\.pem)(?:\s|$|["'])/i

const MODELS_TGZ = /packages\/models\/[^/\s]*\.tgz/i
const FIREBASE_CACHE = /(?:^|[\s'"=/])\.firebase(?:\/|\s|$)/i
const GIT_STAGE = /\bgit\s+(?:add|commit|rm(?:\s+--cached)?)\b/i
const FORCE_PUSH =
  /\bgit\s+push\b[\s\S]*(?:--force(?:-with-lease)?(?:\s|$)|(?:^|\s)-f(?:\s|$))/i
const NO_VERIFY = /\bgit\s+(?:commit|push)\b[\s\S]*--no-verify\b/i

const PROD_SCRIPT =
  /\b(?:env:prod|deploy:prod|release:prod|release-prod|deploy:docs:prod|docs-release-prod|docs-deploy-prod)\b/i
const PROD_API = /\bgcloud\s+run\s+deploy\s+\S+-prod\b/i

const forbiddenIds = (root) => {
  try {
    return loadConfig({ root, allowExample: false }).config?.forbiddenProjects || []
  } catch {
    return []
  }
}

const mentionsForbidden = (command, root) =>
  forbiddenIds(root).some((id) => id && command.includes(id))
const PORTAL_VIDEOS =
  /\b(?:test:portal:videos|superadmin-videos\.spec|mutating\s+demo)\b/i

const SHELL_SPLIT = /(?:&&|\|\||;|\n|\|(?!\|))/
const BARE_FIREBASE =
  /^(?:sudo\s+)?(?:npx\s+|pnpm\s+exec\s+|pnpm\s+dlx\s+|npm\s+exec\s+|yarn\s+(?:dlx\s+)?)?firebase\s+deploy\b/i
const BARE_GCLOUD = /^(?:sudo\s+)?gcloud\s+run\s+deploy\b/i
const HOSTING_CHANNEL = /hosting:channel:(deploy|delete)/i
const LIVE_CHANNEL = /(?:channelId|--channel)\s*[:=]?\s*live\b|hosting:channel:\w+\s+live\b/i

const previewConfig = (root) => {
  try {
    return loadConfig({ root, allowExample: false }).config
  } catch {
    return null
  }
}

const denyHostingChannel = (command, root) => {
  if (!HOSTING_CHANNEL.test(command)) return null
  if (LIVE_CHANNEL.test(command)) {
    return deny(
      'Blocked: do not deploy or delete the live Hosting channel.',
      'A project hook denied hosting:channel live.',
    )
  }
  const config = previewConfig(root)
  if (!config) {
    return deny(
      'Blocked: hosting channel commands need a valid instance config.',
      'A project hook denied hosting:channel because instance config did not load.',
    )
  }
  const forbidden = config.forbiddenProjects || []
  if (forbidden.some((id) => id && command.includes(id))) {
    return deny(
      'Blocked: hosting channel deploy/delete cannot target a forbidden Firebase project.',
      'A project hook denied hosting:channel on a forbidden project.',
    )
  }
  const allowed = config.preview?.firebaseProject
  if (!allowed || !command.includes(allowed)) {
    return deny(
      `Blocked: hosting channel deploy/delete must pass --project ${allowed || '(preview.firebaseProject)'}.`,
      'A project hook denied hosting:channel without the preview Firebase project.',
    )
  }
  return null
}

const deny = (userMessage, agentMessage) => ({
  permission: 'deny',
  user_message: userMessage,
  agent_message: agentMessage,
})

const ask = (userMessage, agentMessage) => ({
  permission: 'ask',
  user_message: userMessage,
  agent_message: agentMessage,
})

const isBareDeploy = (command) =>
  command.split(SHELL_SPLIT).some((segment) => {
    const s = segment.trim()
    return BARE_FIREBASE.test(s) || BARE_GCLOUD.test(s)
  })

const decide = (command, root) => {
  if (!command.trim()) return { permission: 'allow' }

  const channel = denyHostingChannel(command, root)
  if (channel) return channel

  if (FORCE_PUSH.test(command) || NO_VERIFY.test(command)) {
    return deny(
      'Blocked: do not force-push or skip git hooks. Use a normal push without --force / --no-verify.',
      'A project hook denied git --force or --no-verify.',
    )
  }

  if (GIT_STAGE.test(command)) {
    if (SECRET_PATH.test(command)) {
      return deny(
        'Blocked: do not stage secrets. Use pnpm env:sandbox / pnpm env:prod and Secret Manager.',
        'A project hook denied git add/commit of .env, service accounts, or auth state.',
      )
    }
    if (MODELS_TGZ.test(command)) {
      return deny(
        'Blocked: do not commit packages/models/*.tgz. CI copies the built tarball into services/functions/models.tgz.',
        'A project hook denied staging packages/models tarballs.',
      )
    }
    if (FIREBASE_CACHE.test(command)) {
      return deny(
        'Blocked: do not commit .firebase/ hosting cache. Leave that directory untracked.',
        'A project hook denied staging .firebase cache files.',
      )
    }
  }

  if (PORTAL_VIDEOS.test(command) && (mentionsForbidden(command, root) || PROD_SCRIPT.test(command))) {
    return deny(
      'Blocked: portal demo videos cannot run with a production env or deploy command. Use pnpm env:sandbox, then record-docs-media.',
      'A project hook denied portal videos combined with a production command.',
    )
  }

  if (mentionsForbidden(command, root) || PROD_SCRIPT.test(command) || PROD_API.test(command)) {
    return ask(
      'Confirm production action. Prefer pnpm env:sandbox / pnpm deploy:stg unless this is an intentional prod release via pnpm env:prod and pnpm deploy:*.',
      'A project hook asks before production env or deploy commands.',
    )
  }

  if (isBareDeploy(command)) {
    return ask(
      'Confirm raw deploy. Use this repository’s documented deploy scripts instead of a bare firebase or gcloud deploy.',
      'A project hook asks before undeclared firebase or gcloud deploy commands.',
    )
  }

  return { permission: 'allow' }
}

try {
  const input = await readHookInput()
  const command = asString(
    input.command || input.cmd || collectStrings(input).find((s) => /\s/.test(s)),
  )
  writeHookOutput(decide(command, workspaceRootFromHook(input)))
} catch {
  writeHookOutput({ permission: 'allow' })
}
