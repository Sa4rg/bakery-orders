import { useState } from 'react'
import type { CatalogGateway } from '../features/catalog/application/catalogGateway'
import { CustomerCatalog } from '../features/catalog/components/CustomerCatalog'

interface ProtectedShellProps {
  displayName: string
  role: string
  catalogGateway: CatalogGateway
  onSignOut(): Promise<boolean>
}

/** Placeholder for authenticated, authorized users until feature routes exist. */
export function ProtectedShell({
  displayName,
  role,
  catalogGateway,
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
      <button type="button" onClick={() => void handleSignOut()}>
        Sign out
      </button>
      {signOutFailed && <p role="alert">Unable to sign out. Please try again.</p>}
    </section>
  )
}
