export interface CatalogCategory {
  id: string
  name: string
  description: string | null
  displayOrder: number
}

export interface CatalogProduct {
  id: string
  categoryId: string
  name: string
  description: string | null
  unitCode: string
  quantityStep: number
  available: boolean
}

export interface CustomerCatalog {
  categories: CatalogCategory[]
  products: CatalogProduct[]
}

export interface CatalogGateway {
  loadCatalog(): Promise<CustomerCatalog>
}

/** Safe application-level failure that never contains provider details. */
export class CatalogLoadError extends Error {
  constructor() {
    super('Unable to load catalog data.')
    this.name = 'CatalogLoadError'
  }
}
