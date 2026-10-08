import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import { describe, expect, it } from 'vitest'
import {
  ProductAvailabilityError,
  ProductAvailabilityValidationError,
} from '../application/productAvailabilityGateway'
import { createSupabaseProductAvailabilityGateway } from './createSupabaseProductAvailabilityGateway'

const productId = '83000000-0000-4000-8000-000000000001'

interface RpcCall {
  functionName: string
  args: unknown
}

interface RpcResult {
  data: boolean
  error: { message: string } | null
}

function createFakeSupabaseClient(
  result: RpcResult = { data: false, error: null },
) {
  const calls: RpcCall[] = []

  const client = {
    rpc(functionName: string, args: unknown) {
      calls.push({ functionName, args })
      return Promise.resolve(result)
    },
  }

  return {
    client: client as unknown as SupabaseBrowserClient,
    calls,
  }
}

describe('createSupabaseProductAvailabilityGateway', () => {
  it('calls only the trusted availability RPC with the allowed inputs', async () => {
    const { client, calls } = createFakeSupabaseClient()
    const gateway = createSupabaseProductAvailabilityGateway(client)

    const persistedAvailability = await gateway.setAvailability(productId, false)

    expect(persistedAvailability).toBe(false)

    expect(calls).toEqual([
      {
        functionName: 'set_product_availability',
        args: {
          p_product_id: productId,
          p_available: false,
        },
      },
    ])

    expect(JSON.stringify(calls[0]?.args)).not.toMatch(
      /actor|user_id|profile|role|timestamp|availability_updated_at|availability_updated_by/i,
    )
  })

  it('rejects an invalid Product id before calling Supabase', async () => {
    const { client, calls } = createFakeSupabaseClient()
    const gateway = createSupabaseProductAvailabilityGateway(client)

    await expect(
      gateway.setAvailability('not-a-uuid', true),
    ).rejects.toBeInstanceOf(ProductAvailabilityValidationError)

    expect(calls).toHaveLength(0)
  })

  it('rejects a non-boolean availability value before calling Supabase', async () => {
    const { client, calls } = createFakeSupabaseClient()
    const gateway = createSupabaseProductAvailabilityGateway(client)

    await expect(
      gateway.setAvailability(
        productId,
        null as unknown as boolean,
      ),
    ).rejects.toBeInstanceOf(ProductAvailabilityValidationError)

    expect(calls).toHaveLength(0)
  })

  it('converts provider failures into a safe application error', async () => {
    const { client } = createFakeSupabaseClient({
      data: false,
      error: {
        message:
          'PostgREST SQL detail: Product availability change is not allowed.',
      },
    })

    const gateway = createSupabaseProductAvailabilityGateway(client)

    const failure = await gateway
      .setAvailability(productId, false)
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ProductAvailabilityError)
    expect(failure).toMatchObject({
      message: 'Unable to change Product availability.',
    })

    expect(String(failure)).not.toContain('PostgREST')
    expect(String(failure)).not.toContain(
      'Product availability change is not allowed.',
    )
  })
})