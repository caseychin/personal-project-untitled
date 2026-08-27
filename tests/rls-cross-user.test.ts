import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

// Proves RLS actually blocks cross-user reads/writes on `flowcharts`, per
// CLAUDE.md's hard rule and the Task 1 acceptance bar. Runs against the real
// DEV Supabase project — no mocking, since the point is to verify the
// database's own access control, not application logic.
//
// Requires "Confirm email" to be OFF for the dev project's Auth settings
// (Dashboard -> Authentication -> Sign In / Providers -> Email), so signUp()
// returns a usable session immediately. No MCP tool exposes this setting —
// it's a manual, dev-only, one-time step (already done as of Task 1's PR).
//
// Uses only the anon/publishable key — never the service-role key (app/test
// code has no legitimate use for it per CLAUDE.md). Consequence: the two
// throwaway auth users created below are not deleted afterward (that needs
// the service-role key). They're clearly named, free-tier, dev-only, and
// harmless to accumulate — an accepted tradeoff, not an oversight.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function makeClient(): SupabaseClient<Database> {
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set (see .env.example)",
    );
  }
  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

const ts = Date.now();
const PASSWORD = "rls-test-password-not-real-123!";
const EMAIL_A = `rls-test-a-${ts}@example.com`;
const EMAIL_B = `rls-test-b-${ts}@example.com`;
const FLOWCHART_NAME = `RLS Test ${ts}`;

let clientA: SupabaseClient<Database>;
let clientB: SupabaseClient<Database>;
let flowchartId: string;

describe("RLS: cross-user flowchart isolation", () => {
  beforeAll(async () => {
    clientA = makeClient();
    clientB = makeClient();

    const { data: signUpA, error: errA } = await clientA.auth.signUp({
      email: EMAIL_A,
      password: PASSWORD,
    });
    if (errA || !signUpA.session) {
      throw new Error(
        `User A sign-up failed to return a session (is "Confirm email" still ON for the dev project?): ${errA?.message}`,
      );
    }

    const { data: signUpB, error: errB } = await clientB.auth.signUp({
      email: EMAIL_B,
      password: PASSWORD,
    });
    if (errB || !signUpB.session) {
      throw new Error(
        `User B sign-up failed to return a session: ${errB?.message}`,
      );
    }

    const userA = signUpA.user!;
    const { data: inserted, error: insertError } = await clientA
      .from("flowcharts")
      .insert({ name: FLOWCHART_NAME, user_id: userA.id })
      .select("id")
      .single();

    if (insertError || !inserted) {
      throw new Error(`User A could not create their own flowchart: ${insertError?.message}`);
    }
    flowchartId = inserted.id;
  });

  it("blocks user B from reading user A's flowchart", async () => {
    const { data, error } = await clientB
      .from("flowcharts")
      .select("id")
      .eq("id", flowchartId);

    expect(error).toBeNull();
    // RLS filters silently — a blocked read is an empty result, not an error.
    expect(data).toEqual([]);
  });

  it("blocks user B from updating user A's flowchart", async () => {
    const { data, error } = await clientB
      .from("flowcharts")
      .update({ name: "hijacked" })
      .eq("id", flowchartId)
      .select();

    expect(error).toBeNull();
    // .select() is required to observe affected-row-count at all; without it
    // PostgREST can't distinguish "RLS blocked it" from "it was a no-op".
    expect(data).toEqual([]);
  });

  it("blocks user B from deleting user A's flowchart", async () => {
    const { data, error } = await clientB
      .from("flowcharts")
      .delete()
      .eq("id", flowchartId)
      .select();

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("leaves the flowchart genuinely untouched, as seen by its owner", async () => {
    // Proves B's writes didn't happen at all, not just that B's own reads
    // came back empty.
    const { data, error } = await clientA
      .from("flowcharts")
      .select("id, name")
      .eq("id", flowchartId)
      .single();

    expect(error).toBeNull();
    expect(data?.name).toBe(FLOWCHART_NAME);

    // Cleanup: delete via the owning user's own session (respects RLS).
    const { error: deleteError } = await clientA
      .from("flowcharts")
      .delete()
      .eq("id", flowchartId);
    expect(deleteError).toBeNull();
  });
});
