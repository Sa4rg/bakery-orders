import { useState } from 'react'
import type { CatalogGateway } from '../features/catalog/application/catalogGateway'
import type { CreateOrderGateway } from '../features/orders/application/createOrderGateway'
import { CustomerOrderBuilder } from '../features/orders/components/CustomerOrderBuilder'
import type { CustomerCancellationGateway } from '../features/orders/application/customerCancellationGateway'
import type { ManagerCatalogGateway } from '../features/catalog/application/managerCatalogGateway'
import { ManagerCatalogAdministration } from '../features/catalog/components/ManagerCatalog'
import type { ProductAvailabilityGateway } from '../features/catalog/application/productAvailabilityGateway'
import { KitchenCatalogAvailability } from '../features/catalog/components/KitchenCatalogAvailability'
import type { AppRole, ActiveBusinessMembership } from '../features/auth/domain/access'
import type { KitchenProductionCommandGateway } from '../features/production/application/kitchenProductionCommandGateway'
import type { KitchenOrderQueryFilters, KitchenOrderQueryGateway } from '../features/production/application/kitchenOrderQueryGateway'
import type { KitchenQueueSynchronizer } from '../features/production/application/kitchenQueueSynchronization'
import { KitchenProductionBoard } from '../features/production/components/KitchenProductionBoard'

interface ProtectedShellProps {
  displayName: string
  role: AppRole
  memberships: ActiveBusinessMembership[]
  catalogGateway: CatalogGateway
  managerCatalogGateway: ManagerCatalogGateway
  productAvailabilityGateway: ProductAvailabilityGateway
  createOrderGateway: CreateOrderGateway
  customerCancellationGateway: CustomerCancellationGateway
  kitchenProductionCommandGateway: KitchenProductionCommandGateway
  kitchenOrderQueryGateway: KitchenOrderQueryGateway
  createKitchenQueueSynchronizer(filters?: KitchenOrderQueryFilters): KitchenQueueSynchronizer
  onSignOut(): Promise<boolean>
}

/** Placeholder for authenticated, authorized users until feature routes exist. */
export function ProtectedShell({
  displayName,
  role,
  memberships,
  catalogGateway,
  managerCatalogGateway,
  productAvailabilityGateway,
  createOrderGateway,
  customerCancellationGateway,
  kitchenProductionCommandGateway,
  kitchenOrderQueryGateway,
  createKitchenQueueSynchronizer,
  onSignOut,
}: ProtectedShellProps) {
  const [signOutFailed, setSignOutFailed] = useState(false)

  async function handleSignOut() {
    setSignOutFailed(false)

    if (!(await onSignOut())) {
      setSignOutFailed(true)
    }
  }

  const customerBusinessId =
    role === 'CUSTOMER' &&
    memberships.length === 1
      ? memberships[0]?.businessId ?? null
      : null

  return (
    <section aria-labelledby="shell-heading">
      <h2 id="shell-heading">Your session</h2>
      <p>Application foundation ready.</p>
      <dl>
        <dt>Name</dt>
        <dd>{displayName}</dd>
        <dt>Role</dt>
        <dd>{role}</dd>
      </dl>
      {role === 'CUSTOMER' &&
        (customerBusinessId === null ? (
          <p role="alert">
            Unable to determine your establishment for
            ordering.
          </p>
        ) : (
          <CustomerOrderBuilder
            catalogGateway={catalogGateway}
            createOrderGateway={
              createOrderGateway
            }
            customerCancellationGateway={customerCancellationGateway}
            businessId={customerBusinessId}
          />
        )
      )}
      {role === 'KITCHEN' && (
        <KitchenProductionBoard
          commandGateway={kitchenProductionCommandGateway}
          queryGateway={kitchenOrderQueryGateway}
          createKitchenQueueSynchronizer={createKitchenQueueSynchronizer}
        />
      )}
      {role === 'KITCHEN' && (
        <KitchenCatalogAvailability
          catalogGateway={catalogGateway}
          availabilityGateway={productAvailabilityGateway}
        />
      )}
      {role === 'MANAGER' && (
        <ManagerCatalogAdministration
          gateway={managerCatalogGateway}
          availabilityGateway={productAvailabilityGateway}
        />
      )}
      <button type="button" onClick={() => void handleSignOut()}>
        Sign out
      </button>
      {signOutFailed && <p role="alert">Unable to sign out. Please try again.</p>}
    </section>
  )
}
