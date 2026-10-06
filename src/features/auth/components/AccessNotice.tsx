import { useState, type ReactNode } from 'react'

interface AccessNoticeProps {
  heading: string
  children: ReactNode
  /** Announces the message assertively, for failures. */
  isAlert?: boolean
  onSignOut(): Promise<boolean>
}

/** Terminal screen for authenticated users who cannot use the application. */
export function AccessNotice({
  heading,
  children,
  isAlert = false,
  onSignOut,
}: AccessNoticeProps) {
  const [signOutFailed, setSignOutFailed] = useState(false)

  async function handleSignOut() {
    setSignOutFailed(false)

    if (!(await onSignOut())) {
      setSignOutFailed(true)
    }
  }

  return (
    <section>
      <h2>{heading}</h2>
      <p role={isAlert ? 'alert' : undefined}>{children}</p>
      <button type="button" onClick={() => void handleSignOut()}>
        Sign out
      </button>
      {signOutFailed && <p role="alert">Unable to sign out. Please try again.</p>}
    </section>
  )
}
