import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

import type { ProviderId } from '../../shared/provider-registry'

export interface ProviderKeyValidationResult {
  ok: boolean
  provider: ProviderId
  validatedAt: string | null
  error?: string
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function validateProviderKey(
  provider: ProviderId,
  apiKey: string
): Promise<ProviderKeyValidationResult> {
  const signal = AbortSignal.timeout(10_000)
  try {
    if (provider === 'openai') {
      const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: false })
      await client.models.list({ signal })
    } else if (provider === 'anthropic') {
      const client = new Anthropic({ apiKey })
      await client.models.list({ limit: 1 }, { signal })
    } else {
      return {
        ok: false,
        provider,
        validatedAt: null,
        error: 'Gemini key validation is not available yet.'
      }
    }

    return { ok: true, provider, validatedAt: new Date().toISOString() }
  } catch (error) {
    return {
      ok: false,
      provider,
      validatedAt: null,
      error: messageFromError(error)
    }
  }
}
