import { createClient } from '@supabase/supabase-js'

// Admin client using service role key - bypasses RLS
// Use this ONLY in server-side API routes that need to bypass RLS
// NEVER expose the service role key to the client
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  if (!supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set in environment variables')
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
