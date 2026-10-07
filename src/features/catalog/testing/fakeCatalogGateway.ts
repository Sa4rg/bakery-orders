import type {
  CatalogGateway,
  CustomerCatalog,
} from '../application/catalogGateway'

export type CatalogLoadOutcome =
  | CustomerCatalog
  | Error
  | Promise<CustomerCatalog>

export function createFakeCatalogGateway(
  outcomes: CatalogLoadOutcome[],
) {
  let loadCalls = 0

  const gateway: CatalogGateway = {
    async loadCatalog() {
      loadCalls += 1
      const outcome = outcomes.shift()

      if (outcome === undefined) {
        throw new Error('No fake catalog outcome was configured.')
      }

      if (outcome instanceof Error) {
        throw outcome
      }

      return outcome
    },
  }

  return {
    gateway,
    get loadCalls() {
      return loadCalls
    },
  }
}
