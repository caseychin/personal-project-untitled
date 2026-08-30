// Service-role Supabase client for ingestion scripts only. Never imported
// by app code (src/app, src/lib) — the service role key bypasses RLS
// entirely, which is exactly why CLAUDE.md restricts it to ingestion.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export function createServiceClient(): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set (see .env.ingest.example). " +
        "Ingestion scripts load .env.ingest, not .env.",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
