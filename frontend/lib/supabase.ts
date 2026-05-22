import { createBrowserClient } from '@supabase/ssr'
import type { AuthChangeEvent } from '@supabase/supabase-js'

type SupabaseClientType = ReturnType<typeof createBrowserClient>

let _client: SupabaseClientType | null = null

export function createClient(): SupabaseClientType {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Redirect to login whenever the session is fully gone (token revoked, expired, signed out).
    _client.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === 'SIGNED_OUT' && typeof window !== 'undefined') {
        const isAuthPage = ['/login', '/signup', '/'].some((p) => window.location.pathname === p)
        if (!isAuthPage) window.location.replace('/login')
      }
    })
  }
  return _client
}
