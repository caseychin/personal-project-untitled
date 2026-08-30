import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/supabase";

export async function startRun(
  client: SupabaseClient<Database>,
  source: "programs_api" | "tigercenter",
): Promise<string> {
  const { data, error } = await client
    .from("ingest_runs")
    .insert({ source, status: "running" })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("Failed to create ingest_runs row");
  return data.id;
}

export async function finishRun(
  client: SupabaseClient<Database>,
  runId: string,
  result: { status: "succeeded" | "failed"; stats: Record<string, Json>; error?: string },
): Promise<void> {
  const { error } = await client
    .from("ingest_runs")
    .update({
      status: result.status,
      stats: result.stats,
      error: result.error,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (error) throw error;
}
