import type {
  CategoryAdminInput,
  ProductCreationInput,
  ProductUpdateInput,
} from '../domain/managerCatalogSchema'

export interface ManagerCatalogCategory {
  id: string
  name: string
  description: string | null
  active: boolean
  displayOrder: number
}

export interface ManagerCatalogProduct {
  id: string
  categoryId: string
  name: string
  description: string | null
  unitCode: string
  quantityStep: number
  active: boolean
  available: boolean
}

export interface ManagerCatalog {
  categories: ManagerCatalogCategory[]
  products: ManagerCatalogProduct[]
}

export interface ManagerCatalogGateway {
  loadManagerCatalog(): Promise<ManagerCatalog>
  createCategory(input: CategoryAdminInput): Promise<string>
  updateCategory(id: string, input: CategoryAdminInput): Promise<void>
  createProduct(input: ProductCreationInput): Promise<string>
  updateProduct(id: string, input: ProductUpdateInput): Promise<void>
}

export class ManagerCatalogError extends Error {
  constructor() {
    super('Unable to complete the catalog operation.')
    this.name = 'ManagerCatalogError'
  }
}

export class ManagerCatalogValidationError extends Error {
  constructor() {
    super('Catalog input is invalid.')
    this.name = 'ManagerCatalogValidationError'
  }
}
