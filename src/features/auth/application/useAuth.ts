import { useContext } from 'react'
import { AuthContext, type AuthContextValue } from './AuthContext'

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)

  if (value === null) {
    throw new Error('useAuth must be used within an AuthProvider.')
  }

  return value
}
