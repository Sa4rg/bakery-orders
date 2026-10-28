import { AuthProvider } from '../features/auth/application/AuthProvider'
import { AuthGate } from '../features/auth/components/AuthGate'
import type { AppBootstrap } from './bootstrap'
import { ProtectedShell } from './ProtectedShell'

interface AppProps {
  bootstrap: AppBootstrap
}

export default function App({ bootstrap }: AppProps) {
  return (
    <main>
      <h1>Bakery Orders</h1>

      {bootstrap.status === 'misconfigured' ? (
        <section role="alert">
          <p>The application is not configured.</p>
          <p>Set the following environment variables and rebuild:</p>
          <ul>
            {bootstrap.variables.map((variable) => (
              <li key={variable}>
                <code>{variable}</code>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <AuthProvider gateway={bootstrap.authGateway}>
          <AuthGate>
            {({ profile, memberships, signOut }) => (
              <ProtectedShell
                displayName={profile.displayName}
                role={profile.role}
                memberships={memberships}
                catalogGateway={bootstrap.catalogGateway}
                managerCatalogGateway={bootstrap.managerCatalogGateway}
                productAvailabilityGateway={bootstrap.productAvailabilityGateway}
                createOrderGateway={bootstrap.createOrderGateway}
                customerCancellationGateway={bootstrap.customerCancellationGateway}
                kitchenProductionCommandGateway={bootstrap.kitchenProductionCommandGateway}
                managerBlockedOrdersGateway={bootstrap.managerBlockedOrdersGateway}
                kitchenOrderQueryGateway={bootstrap.kitchenOrderQueryGateway}
                createKitchenQueueSynchronizer={bootstrap.createKitchenQueueSynchronizer}
                onSignOut={signOut}
              />
            )}
          </AuthGate>
        </AuthProvider>
      )}
    </main>
  )
}
