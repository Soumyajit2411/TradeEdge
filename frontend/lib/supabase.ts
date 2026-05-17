import { createBrowserClient } from '@supabase/ssr'

type SupabaseClientType = ReturnType<typeof createBrowserClient>

let _client: SupabaseClientType | null = null

export function createClient(): SupabaseClientType {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
  }
  return _client
}
