import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { ImmersionEntity } from "@/ingest/types";

export async function writeImmersionEntity(
  client: SupabaseClient<Database>,
  immersion: ImmersionEntity,
): Promise<{ programId: string }> {
  const { data, error } = await client
    .from("catalog_programs")
    .upsert(
      {
        slug: immersion.slug,
        catalog_year: immersion.catalogYear,
        name: immersion.name,
        type: "immersion",
        total_credits: immersion.totalCredits,
        source: "programs_api",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slug,catalog_year" },
    )
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("catalog_programs upsert returned no row");
  return { programId: data.id };
}
