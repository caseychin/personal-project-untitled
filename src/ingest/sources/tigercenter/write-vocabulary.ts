import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { ParsedVocabulary } from "@/ingest/sources/tigercenter/parse-vocabulary";

export async function writeVocabulary(client: SupabaseClient<Database>, vocabulary: ParsedVocabulary): Promise<void> {
  if (vocabulary.colleges.length > 0) {
    const { error } = await client
      .from("catalog_colleges")
      .upsert(
        vocabulary.colleges.map((c) => ({ code: c.code, name: c.name })),
        { onConflict: "code" },
      );
    if (error) throw error;
  }

  if (vocabulary.subjects.length > 0) {
    const { error } = await client.from("catalog_subjects").upsert(
      vocabulary.subjects.map((s) => ({ code: s.code, name: s.name, college_code: s.collegeCode })),
      { onConflict: "code" },
    );
    if (error) throw error;
  }

  if (vocabulary.attributes.length > 0) {
    const { error } = await client.from("catalog_attributes").upsert(
      vocabulary.attributes.map((a) => ({
        group_code: a.groupCode,
        group_name: a.groupName,
        value_code: a.valueCode,
        value_name: a.valueName,
      })),
      { onConflict: "group_code,value_code" },
    );
    if (error) throw error;
  }
}
