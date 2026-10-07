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
            {({ profile, signOut }) => (
              <ProtectedShell
                displayName={profile.displayName}
                role={profile.role}
                catalogGateway={bootstrap.catalogGateway}
                managerCatalogGateway={bootstrap.managerCatalogGateway}
                onSignOut={signOut}
              />
            )}
          </AuthGate>
        </AuthProvider>
      )}
    </main>
  )
}
