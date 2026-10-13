import { describe, expect, it } from 'vitest'
import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import {
  CustomerCancellationError,
  CustomerCancellationValidationError,
} from '../application/customerCancellationGateway'
import { createSupabaseCustomerCancellationGateway } from './createSupabaseCustomerCancellationGateway'

const orderId =
  '90000000-0000-4000-8000-000000000001'

interface RpcCall {
  functionName: string
  args: unknown
}

interface RpcResult {
  data: unknown
  error: {
    message: string
  } | null
}

function createFakeSupabaseClient(
  result: RpcResult = {
    data: null,
    error: null,
  },
) {
  const calls: RpcCall[] = []

  const client = {
    async rpc(
      functionName: string,
      args: unknown,
    ) {
      calls.push({
        functionName,
        args,
      })

      return result
    },
  }

  return {
    client:
      client as unknown as SupabaseBrowserClient,
    calls,
  }
}

describe(
  'createSupabaseCustomerCancellationGateway',
  () => {
    it('maps the narrow cancellation command onto the trusted RPC', async () => {
      const { client, calls } =
        createFakeSupabaseClient()

      const gateway =
        createSupabaseCustomerCancellationGateway(
          client,
        )

      await gateway.cancelOrder({
        orderId,
        reason:
          '  Customer requirements changed.  ',
      })

      expect(calls).toEqual([
        {
          functionName:
            'cancel_customer_order',
          args: {
            p_order_id: orderId,
            p_reason:
              'Customer requirements changed.',
          },
        },
      ])
    })

    it('rejects invalid input before making a provider request', async () => {
      const { client, calls } =
        createFakeSupabaseClient()

      const gateway =
        createSupabaseCustomerCancellationGateway(
          client,
        )

      await expect(
        gateway.cancelOrder({
          orderId,
          reason: '   ',
        }),
      ).rejects.toBeInstanceOf(
        CustomerCancellationValidationError,
      )

      expect(calls).toHaveLength(0)
    })

    it('converts provider errors into a safe application failure', async () => {
      const { client } =
        createFakeSupabaseClient({
          data: null,
          error: {
            message:
              'SQLSTATE 42501 internal provider details',
          },
        })

      const gateway =
        createSupabaseCustomerCancellationGateway(
          client,
        )

      const failure =
        await gateway
          .cancelOrder({
            orderId,
            reason: 'Valid reason',
          })
          .catch(
            (error: unknown) => error,
          )

      expect(failure).toBeInstanceOf(
        CustomerCancellationError,
      )

      expect(String(failure)).not.toMatch(
        /42501|provider|SQLSTATE/i,
      )
    })
  },
)