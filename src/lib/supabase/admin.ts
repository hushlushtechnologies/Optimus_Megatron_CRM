import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * DANGER: bypasses Row Level Security entirely.
 *
 * The `server-only` import above is what enforces that. Before Sprint 11 this
 * warning was a comment, which a build cannot read: importing this file into a
 * Client Component compiled happily and shipped the service-role key to the
 * browser. Now it fails the build instead.
 */
export function createAdminClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
