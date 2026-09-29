#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 */
import { asString, collectStrings, readHookInput, writeHookOutput } from '../lib.mjs'

const pathFromInput = (input) => {
  const toolInput = input.tool_input || input.toolInput || input.arguments || {}
  const candidates = [
    toolInput.path,
    toolInput.file_path,
    toolInput.filePath,
    toolInput.target_file,
    input.file_path,
    input.path,
  ]
  return asString(candidates.find((value) => typeof value === 'string' && value))
}

const contentFromInput = (input) => {
  const toolInput = input.tool_input || input.toolInput || input.arguments || {}
  return [
    asString(toolInput.contents),
    asString(toolInput.new_string),
    asString(toolInput.content),
    asString(input.content),
  ]
    .filter(Boolean)
    .join('\n')
}

const allPaths = (input) => {
  const primary = pathFromInput(input)
  const extra = collectStrings(input).filter(
    (value) =>
      /[\\/]/.test(value) &&
      /\.(ts|tsx|js|jsx|rules|mdc)$/.test(value) &&
      value.length < 400,
  )
  return [...new Set([primary, ...extra].filter(Boolean))]
}

const normalize = (filePath) => filePath.replace(/\\/g, '/')

const isModelNotConverter = (filePath) =>
  /packages\/models\//.test(filePath) && !/packages\/models\/converters\//.test(filePath)

const isStgRules = (filePath) => /firebase\/([^/]*stg[^/]*|staging)\/.*\.rules$/.test(filePath)
const isProdRules = (filePath) => /firebase\/([^/]*prod[^/]*|production)\/.*\.rules$/.test(filePath)

const remindersFor = (paths, content) => {
  const notes = []
  const hasConverter = paths.some((p) => /packages\/models\/converters\//.test(p))
  if (paths.some(isModelNotConverter) && !hasConverter) {
    notes.push(
      'New or changed shared-models types need a Firestore converter under packages/models/converters and a hook — do not map snapshot.data() in views.',
    )
  }

  const stg = paths.some(isStgRules)
  const prod = paths.some(isProdRules)
  if (stg !== prod && (stg || prod)) {
    notes.push(
      'Update both staging and production Firebase rules (and Storage rules if files change). Do not edit only one env.',
    )
  }

  const viewPath = paths.find((p) => /web\/app\/src\/views\//.test(p))
  if (
    viewPath &&
    (/from ['"]firebase\/firestore['"]/.test(content) || /\.data\(\)\s+as\b/.test(content)) &&
    !/withConverter/.test(content)
  ) {
    notes.push(
      'Keep Firestore I/O in web/app/src/hooks with withConverter. Views should consume hooks, not ad hoc snapshot.data().',
    )
  }

  const axiosPath = paths.find((p) => /web\/app\/src\//.test(p))
  if (
    axiosPath &&
    !/web\/app\/src\/core\/api\/axiosClient\.ts$/.test(axiosPath) &&
    /axios\.create\(/.test(content)
  ) {
    notes.push(
      'Use web/app/src/core/api/axiosClient.ts. Do not add a second authenticated Axios client.',
    )
  }

  const routePath = paths.find((p) => /services\/api\/src\/routes\//.test(p))
  if (routePath && /router\.use\(\s*['"]\/[^'"]+['"]/.test(content)) {
    const exempt = /['"]\/(?:public|health|ready)(?:\/|['"])/.test(content) || /webhook/i.test(content)
    const hasAuth = /AuthMiddleware/.test(content)
    if (!exempt && !hasAuth) {
      notes.push(
        'Mount privileged API routes with *AuthMiddleware (see services/api/src/routes/portal/index.ts). Public and webhook paths are the exception.',
      )
    }
  }

  return notes
}

try {
  const input = await readHookInput()
  const paths = allPaths(input).map(normalize)
  const content = contentFromInput(input)
  const notes = remindersFor(paths, content)
  if (notes.length === 0) {
    writeHookOutput({})
  } else {
    writeHookOutput({ additional_context: notes.slice(0, 3).join(' ') })
  }
} catch {
  writeHookOutput({})
}
