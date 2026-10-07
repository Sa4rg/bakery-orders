import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import type {
  ManagerCatalogCategory,
  ManagerCatalogProduct,
} from '../application/managerCatalogGateway'
import {
  categoryAdminInputSchema,
  productCreationInputSchema,
  type CategoryAdminInput,
  type ProductCreationInput,
} from '../domain/managerCatalogSchema'

interface CategoryFormProps {
  initialValue?: ManagerCatalogCategory
  pending: boolean
  onSave(value: CategoryAdminInput): Promise<void>
  onCancel(): void
}

export function CategoryForm({
  initialValue,
  pending,
  onSave,
  onCancel,
}: CategoryFormProps) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<CategoryAdminInput>({
      resolver: zodResolver(categoryAdminInputSchema),
      defaultValues: initialValue
        ? {
            name: initialValue.name,
            description: initialValue.description,
            active: initialValue.active,
            displayOrder: initialValue.displayOrder,
          }
        : {
            name: '',
            description: null,
            active: true,
            displayOrder: 0,
          },
    })
  const disabled = pending || isSubmitting

  return (
    <form noValidate onSubmit={handleSubmit(onSave)} aria-label={initialValue ? 'Edit category form' : 'Create category form'}>
      <div>
        <label htmlFor="manager-category-name">Category name</label>
        <input
          id="manager-category-name"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'manager-category-name-error' : undefined}
          {...register('name')}
        />
        {errors.name && <p id="manager-category-name-error">Enter a category name.</p>}
      </div>
      <div>
        <label htmlFor="manager-category-description">Category description</label>
        <textarea
          id="manager-category-description"
          {...register('description', { setValueAs: (value: string) => value === '' ? null : value })}
        />
      </div>
      <div>
        <label htmlFor="manager-category-display-order">Display order</label>
        <input
          id="manager-category-display-order"
          type="number"
          step="1"
          aria-invalid={errors.displayOrder ? true : undefined}
          aria-describedby={errors.displayOrder ? 'manager-category-order-error' : undefined}
          {...register('displayOrder', { valueAsNumber: true })}
        />
        {errors.displayOrder && <p id="manager-category-order-error">Enter a whole number that is zero or greater.</p>}
      </div>
      <div>
        <label>
          <input type="checkbox" {...register('active')} />
          Active
        </label>
      </div>
      <button type="submit" disabled={disabled}>{disabled ? 'Saving category…' : 'Save category'}</button>
      <button type="button" disabled={disabled} onClick={onCancel}>Cancel</button>
    </form>
  )
}

interface ProductFormProps {
  categories: readonly ManagerCatalogCategory[]
  initialValue?: ManagerCatalogProduct
  pending: boolean
  onSave(value: ProductCreationInput): Promise<void>
  onCancel(): void
}

export function ProductForm({
  categories,
  initialValue,
  pending,
  onSave,
  onCancel,
}: ProductFormProps) {
  const creation = initialValue === undefined
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<ProductCreationInput>({
      resolver: zodResolver(productCreationInputSchema),
      defaultValues: initialValue
        ? {
            categoryId: initialValue.categoryId,
            name: initialValue.name,
            description: initialValue.description,
            unitCode: initialValue.unitCode,
            quantityStep: initialValue.quantityStep,
            active: initialValue.active,
            available: initialValue.available,
          }
        : {
            categoryId: categories.find((category) => category.active)?.id ?? '',
            name: '',
            description: null,
            unitCode: '',
            quantityStep: 1,
            active: true,
            available: true,
          },
    })
  const disabled = pending || isSubmitting

  return (
    <form noValidate onSubmit={handleSubmit(onSave)} aria-label={creation ? 'Create product form' : 'Edit product form'}>
      <div>
        <label htmlFor="manager-product-category">Product category</label>
        <select
          id="manager-product-category"
          aria-invalid={errors.categoryId ? true : undefined}
          aria-describedby={errors.categoryId ? 'manager-product-category-error' : undefined}
          {...register('categoryId')}
        >
          <option value="">Select a category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}{category.active ? '' : ' (Inactive)'}
            </option>
          ))}
        </select>
        {errors.categoryId && <p id="manager-product-category-error">Choose a category.</p>}
      </div>
      <div>
        <label htmlFor="manager-product-name">Product name</label>
        <input
          id="manager-product-name"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'manager-product-name-error' : undefined}
          {...register('name')}
        />
        {errors.name && <p id="manager-product-name-error">Enter a product name.</p>}
      </div>
      <div>
        <label htmlFor="manager-product-description">Product description</label>
        <textarea
          id="manager-product-description"
          {...register('description', { setValueAs: (value: string) => value === '' ? null : value })}
        />
      </div>
      <div>
        <label htmlFor="manager-product-unit">Unit code</label>
        <input
          id="manager-product-unit"
          aria-invalid={errors.unitCode ? true : undefined}
          aria-describedby={errors.unitCode ? 'manager-product-unit-error' : undefined}
          {...register('unitCode')}
        />
        {errors.unitCode && <p id="manager-product-unit-error">Enter a unit code.</p>}
      </div>
      <div>
        <label htmlFor="manager-product-step">Quantity step</label>
        <input
          id="manager-product-step"
          type="number"
          step="any"
          aria-invalid={errors.quantityStep ? true : undefined}
          aria-describedby={errors.quantityStep ? 'manager-product-step-error' : undefined}
          {...register('quantityStep', { valueAsNumber: true })}
        />
        {errors.quantityStep && <p id="manager-product-step-error">Enter a quantity greater than zero.</p>}
      </div>
      <div>
        <label>
          <input type="checkbox" {...register('active')} />
          Active
        </label>
      </div>
      {creation && (
        <div>
          <label htmlFor="manager-product-initial-availability">Initial availability</label>
          <select
            id="manager-product-initial-availability"
            {...register('available', { setValueAs: (value: string) => value === 'true' })}
          >
            <option value="true">Available</option>
            <option value="false">Unavailable</option>
          </select>
          <p>Choose the starting value. Operational availability changes are handled separately.</p>
        </div>
      )}
      <button type="submit" disabled={disabled}>{disabled ? 'Saving product…' : 'Save product'}</button>
      <button type="button" disabled={disabled} onClick={onCancel}>Cancel</button>
    </form>
  )
}
