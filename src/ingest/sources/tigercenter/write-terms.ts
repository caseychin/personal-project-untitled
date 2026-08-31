import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { TermIR } from "@/ingest/types";

export async function writeTerms(client: SupabaseClient<Database>, terms: TermIR[]): Promise<void> {
  if (terms.length === 0) return;
  const { error } = await client.from("catalog_terms").upsert(
    terms.map((term) => ({
      code: term.code,
      description: term.description,
      season: term.season,
      academic_year: term.academicYear,
      is_active: term.isActive,
    })),
    { onConflict: "code" },
  );
  if (error) throw error;
}
