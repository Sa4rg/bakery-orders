import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import { describe, expect, it } from 'vitest'
import {
  ManagerCatalogError,
  ManagerCatalogValidationError,
} from '../application/managerCatalogGateway'
import { createSupabaseManagerCatalogGateway } from './createSupabaseManagerCatalogGateway'

const categoryUuid = '71000000-0000-4000-8000-000000000001'

interface QueryCall {
  table: string
  operation: 'select' | 'insert' | 'update'
  projection: string | null
  payload?: unknown
  filters: Array<{ column: string; value: unknown }>
  ordering: Array<{ column: string; ascending: boolean }>
}

interface QueryResult {
  data: unknown
  error: { message: string } | null
}

function createFakeSupabaseClient(results: Record<string, QueryResult> = {}) {
  const calls: QueryCall[] = []

  const client = {
    from(table: string) {
      const call: QueryCall = {
        table,
        operation: 'select',
        projection: null,
        filters: [],
        ordering: [],
      }
      calls.push(call)

      const query = {
        select(projection: string) {
          call.projection = projection
          return query
        },
        insert(payload: unknown) {
          call.operation = 'insert'
          call.payload = payload
          return query
        },
        update(payload: unknown) {
          call.operation = 'update'
          call.payload = payload
          return query
        },
        eq(column: string, value: unknown) {
          call.filters.push({ column, value })
          return query
        },
        order(column: string, options: { ascending: boolean }) {
          call.ordering.push({ column, ascending: options.ascending })
          return query
        },
        single() {
          return query
        },
        maybeSingle() {
          return query
        },
        then(
          onFulfilled: (result: QueryResult) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) {
          const key = `${table}:${call.operation}`
          const fallback: QueryResult =
            call.operation === 'select'
              ? { data: [], error: null }
              : { data: { id: 'generated-row-id' }, error: null }

          return Promise.resolve(results[key] ?? fallback).then(
            onFulfilled,
            onRejected,
          )
        },
      }

      return query
    },
  }

  return { client: client as unknown as SupabaseBrowserClient, calls }
}

const categoryRows = [
  {
    id: 'category-pastries',
    name: 'Pastries',
    description: 'Sweet baked treats.',
    active: true,
    display_order: 1,
  },
]

const productRows = [
  {
    id: 'product-croissant',
    category_id: 'category-pastries',
    name: 'Chocolate Croissant',
    description: 'Filled with chocolate.',
    unit_code: 'UNIT',
    quantity_step: 1,
    active: true,
    available: false,
  },
]

describe('createSupabaseManagerCatalogGateway', () => {
  it('loads a separate Manager read model with explicit non-audit projections', async () => {
    const { client, calls } = createFakeSupabaseClient({
      'categories:select': { data: categoryRows, error: null },
      'products:select': { data: productRows, error: null },
    })
    const catalog = await createSupabaseManagerCatalogGateway(client).loadManagerCatalog()

    expect(catalog).toEqual({
      categories: [
        {
          id: 'category-pastries',
          name: 'Pastries',
          description: 'Sweet baked treats.',
          active: true,
          displayOrder: 1,
        },
      ],
      products: [
        {
          id: 'product-croissant',
          categoryId: 'category-pastries',
          name: 'Chocolate Croissant',
          description: 'Filled with chocolate.',
          unitCode: 'UNIT',
          quantityStep: 1,
          active: true,
          available: false,
        },
      ],
    })
    expect(calls.map(({ table, projection }) => ({ table, projection }))).toEqual([
      {
        table: 'categories',
        projection: 'id, name, description, active, display_order',
      },
      {
        table: 'products',
        projection:
          'id, category_id, name, description, unit_code, quantity_step, active, available',
      },
    ])
    expect(calls.some(({ projection }) => projection?.includes('*'))).toBe(false)
    expect(calls[1]?.projection).not.toMatch(
      /availability_updated_at|availability_updated_by|image_path|created_at|updated_at/,
    )
  })

  it('whitelists Category create and update fields', async () => {
    const { client, calls } = createFakeSupabaseClient()
    const gateway = createSupabaseManagerCatalogGateway(client)
    const categoryInput = {
      name: '  Celebration Cakes  ',
      description: 'Made to order.',
      active: true,
      displayOrder: 2,
    }

    await expect(gateway.createCategory(categoryInput)).resolves.toBe(
      'generated-row-id',
    )
    await gateway.updateCategory('category-id', {
      name: 'Celebration Cakes',
      description: 'Updated description.',
      active: false,
      displayOrder: 3,
    })

    expect(calls[0]?.payload).toEqual({
      name: 'Celebration Cakes',
      description: 'Made to order.',
      active: true,
      display_order: 2,
    })
    expect(calls[1]?.payload).toEqual({
      name: 'Celebration Cakes',
      description: 'Updated description.',
      active: false,
      display_order: 3,
    })
    expect(calls[1]?.filters).toEqual([{ column: 'id', value: 'category-id' }])
    expect(calls[0]?.projection).toBe('id')
    expect(calls[1]?.projection).toBe('id')
  })

  it('requires Product availability at creation but never sends trusted or image fields', async () => {
    const { client, calls } = createFakeSupabaseClient()
    const gateway = createSupabaseManagerCatalogGateway(client)

    await expect(
      gateway.createProduct({
        categoryId: categoryUuid,
        name: 'Country Sourdough',
        description: null,
        unitCode: 'UNIT',
        quantityStep: 1,
        active: true,
        available: false,
      }),
    ).resolves.toBe('generated-row-id')

    expect(calls[0]?.payload).toEqual({
      category_id: categoryUuid,
      name: 'Country Sourdough',
      description: null,
      unit_code: 'UNIT',
      quantity_step: 1,
      active: true,
      available: false,
    })
    expect(calls[0]?.projection).toBe('id')
    expect(JSON.stringify(calls[0]?.payload)).not.toMatch(
      /image_path|availability_updated_at|availability_updated_by|created_at|updated_at|actorUserId|profileId|role/i,
    )
  })

  it('keeps Product update fields narrow and rejects availability mass assignment', async () => {
    const { client, calls } = createFakeSupabaseClient()
    const gateway = createSupabaseManagerCatalogGateway(client)

    await gateway.updateProduct('product-id', {
      categoryId: categoryUuid,
      name: 'Updated Product',
      description: null,
      unitCode: 'TRAY',
      quantityStep: 0.5,
      active: false,
    })

    const unsafeInput = {
      categoryId: categoryUuid,
      name: 'Updated Product',
      description: null,
      unitCode: 'UNIT',
      quantityStep: 1,
      active: true,
      available: true,
    }

    await expect(
      gateway.updateProduct('product-id', unsafeInput),
    ).rejects.toBeInstanceOf(ManagerCatalogValidationError)

    expect(calls[0]?.payload).toEqual({
      category_id: categoryUuid,
      name: 'Updated Product',
      description: null,
      unit_code: 'TRAY',
      quantity_step: 0.5,
      active: false,
    })
    expect(calls).toHaveLength(1)
  })

  it('validates category and Product invariants before making requests', async () => {
    const { client, calls } = createFakeSupabaseClient()
    const gateway = createSupabaseManagerCatalogGateway(client)

    await expect(
      gateway.createCategory({
        name: '   ',
        description: null,
        active: true,
        displayOrder: 0,
      }),
    ).rejects.toBeInstanceOf(ManagerCatalogValidationError)
    await expect(
      gateway.createCategory({
        name: 'Valid Category',
        description: null,
        active: true,
        displayOrder: -1,
      }),
    ).rejects.toBeInstanceOf(ManagerCatalogValidationError)
    await expect(
      gateway.createProduct({
        categoryId: categoryUuid,
        name: 'Valid Name',
        description: null,
        unitCode: '   ',
        quantityStep: 1,
        active: true,
        available: true,
      }),
    ).rejects.toBeInstanceOf(ManagerCatalogValidationError)
    await expect(
      gateway.createProduct({
        categoryId: categoryUuid,
        name: 'Valid Name',
        description: null,
        unitCode: 'UNIT',
        quantityStep: 0,
        active: true,
        available: true,
      }),
    ).rejects.toBeInstanceOf(ManagerCatalogValidationError)

    expect(calls).toHaveLength(0)
  })

  it('converts provider errors into safe application failures', async () => {
    const { client } = createFakeSupabaseClient({
      'categories:select': {
        data: null,
        error: { message: 'internal SQL details' },
      },
      'categories:insert': {
        data: null,
        error: { message: 'PostgREST policy detail' },
      },
    })
    const gateway = createSupabaseManagerCatalogGateway(client)

    const readFailure = await gateway.loadManagerCatalog().catch((error: unknown) => error)
    const writeFailure = await gateway
      .createCategory({
        name: 'Valid Category',
        description: null,
        active: true,
        displayOrder: 0,
      })
      .catch((error: unknown) => error)

    expect(readFailure).toBeInstanceOf(ManagerCatalogError)
    expect(writeFailure).toBeInstanceOf(ManagerCatalogError)
    expect(String(readFailure)).not.toMatch(/internal SQL details/)
    expect(String(writeFailure)).not.toMatch(/PostgREST policy detail/)
  })
})
