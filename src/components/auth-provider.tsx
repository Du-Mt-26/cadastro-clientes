'use client'

import { SessionProvider } from 'next-auth/react'
import type { ReactNode } from 'react'

export function AuthProvider({ children }: { children: ReactNode }) {
  return <SessionProvider refetchInterval={5 * 60}>{children}</SessionProvider>
}
