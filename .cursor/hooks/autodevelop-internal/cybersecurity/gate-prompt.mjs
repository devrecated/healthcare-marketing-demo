#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 */
import { asString, collectStrings, readHookInput, writeHookOutput } from '../lib.mjs'

const RISK =
  /(?:deploy(?:ing)?\s+prod|production\s+deploy|env:prod|deploy:prod|release:prod|release-prod|force[-\s]?push|git\s+push\s+-f|--force-with-lease|--no-verify|skip(?:ping)?\s+hooks|commit\s+\.env|check\s+in\s+\.env|record(?:ing)?\s+portal\s+videos?\s+on\s+prod)/i

try {
  const input = await readHookInput()
  const prompt = asString(
    input.prompt ||
      input.user_prompt ||
      input.userPrompt ||
      input.text ||
      collectStrings(input).find((value) => value.length > 8) ||
      '',
  )

  if (!RISK.test(prompt)) {
    writeHookOutput({})
  } else {
    writeHookOutput({
      continue: true,
      user_message:
        'High-risk intent noted. Production deploy, force-push, skipped hooks, committed secrets, and prod portal videos are gated: the shell hook will ask or deny. Prefer pnpm env:sandbox / deploy:stg; production needs an explicit confirm.',
    })
  }
} catch {
  writeHookOutput({})
}
