import type { SupabaseBrowserClient } from '../../../lib/supabase/client'
import { describe, expect, it } from 'vitest'
import { CatalogLoadError } from '../application/catalogGateway'
import { createSupabaseCatalogGateway } from './createSupabaseCatalogGateway'

interface QueryCall {
  table: string
  columns: string | null
  ordering: Array<{ column: string; ascending: boolean }>
}

interface QueryResult {
  data: unknown[] | null
  error: { message: string } | null
}

function createQueryClient(results: Record<string, QueryResult>) {
  const calls: QueryCall[] = []

  const client = {
    from(table: string) {
      const call: QueryCall = { table, columns: null, ordering: [] }
      calls.push(call)

      const query = {
        select(columns: string) {
          call.columns = columns
          return query
        },
        order(column: string, options: { ascending: boolean }) {
          call.ordering.push({ column, ascending: options.ascending })
          return query
        },
        then(
          onFulfilled: (result: QueryResult) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) {
          return Promise.resolve(results[table]).then(onFulfilled, onRejected)
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
    display_order: 1,
  },
  {
    id: 'category-bread',
    name: 'Bread',
    description: null,
    display_order: 0,
  },
]

const productRows = [
  {
    id: 'product-croissant',
    category_id: 'category-pastries',
    name: 'Chocolate Croissant',
    description: 'Filled with dark chocolate.',
    unit_code: 'UNIT',
    quantity_step: 1,
    available: false,
  },
]

function successfulResults(): Record<string, QueryResult> {
  return {
    categories: { data: categoryRows, error: null },
    products: { data: productRows, error: null },
  }
}

describe('createSupabaseCatalogGateway', () => {
  it('maps database rows into the customer catalog contract', async () => {
    const { client } = createQueryClient(successfulResults())
    const catalog = await createSupabaseCatalogGateway(client).loadCatalog()

    expect(catalog).toEqual({
      categories: [
        {
          id: 'category-pastries',
          name: 'Pastries',
          description: 'Sweet baked treats.',
          displayOrder: 1,
        },
        {
          id: 'category-bread',
          name: 'Bread',
          description: null,
          displayOrder: 0,
        },
      ],
      products: [
        {
          id: 'product-croissant',
          categoryId: 'category-pastries',
          name: 'Chocolate Croissant',
          description: 'Filled with dark chocolate.',
          unitCode: 'UNIT',
          quantityStep: 1,
          available: false,
        },
      ],
    })
  })

  it('uses explicit public columns and deterministic ordering without caller authorization identifiers', async () => {
    const { client, calls } = createQueryClient(successfulResults())
    const gateway = createSupabaseCatalogGateway(client)

    await gateway.loadCatalog()

    expect(calls).toEqual([
      {
        table: 'categories',
        columns: 'id, name, description, display_order',
        ordering: [
          { column: 'display_order', ascending: true },
          { column: 'name', ascending: true },
        ],
      },
      {
        table: 'products',
        columns:
          'id, category_id, name, description, unit_code, quantity_step, available',
        ordering: [{ column: 'name', ascending: true }],
      },
    ])
    expect(calls.some(({ columns }) => columns?.includes('*'))).toBe(false)
    expect(calls[1]?.columns).not.toMatch(
      /availability_updated_at|availability_updated_by|created_at|updated_at/,
    )
  })

  it('converts provider failures into a generic catalog load error', async () => {
    const { client } = createQueryClient({
      categories: { data: null, error: { message: 'internal SQL detail' } },
      products: { data: productRows, error: null },
    })

    const failure = await createSupabaseCatalogGateway(client)
      .loadCatalog()
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(CatalogLoadError)
    expect(failure).toMatchObject({ message: 'Unable to load catalog data.' })
    expect(String(failure)).not.toContain('internal SQL detail')
  })
})
