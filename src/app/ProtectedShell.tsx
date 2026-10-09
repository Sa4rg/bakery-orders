import { useState } from 'react'
import type { CatalogGateway } from '../features/catalog/application/catalogGateway'
import { CustomerCatalog } from '../features/catalog/components/CustomerCatalog'
import type { ManagerCatalogGateway } from '../features/catalog/application/managerCatalogGateway'
import { ManagerCatalogAdministration } from '../features/catalog/components/ManagerCatalog'
import type { ProductAvailabilityGateway } from '../features/catalog/application/productAvailabilityGateway'
import { KitchenCatalogAvailability } from '../features/catalog/components/KitchenCatalogAvailability'
import type { AppRole } from '../features/auth/domain/access'

interface ProtectedShellProps {
  displayName: string
  role: AppRole
  catalogGateway: CatalogGateway
  managerCatalogGateway: ManagerCatalogGateway
  productAvailabilityGateway: ProductAvailabilityGateway
  onSignOut(): Promise<boolean>
}

/** Placeholder for authenticated, authorized users until feature routes exist. */
export function ProtectedShell({
  displayName,
  role,
  catalogGateway,
  managerCatalogGateway,
  productAvailabilityGateway,
  onSignOut,
}: ProtectedShellProps) {
  const [signOutFailed, setSignOutFailed] = useState(false)

  async function handleSignOut() {
    setSignOutFailed(false)

    if (!(await onSignOut())) {
      setSignOutFailed(true)
    }
  }

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
      {role === 'CUSTOMER' && <CustomerCatalog gateway={catalogGateway} />}
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
