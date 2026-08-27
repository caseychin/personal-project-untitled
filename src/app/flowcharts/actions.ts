"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createFlowchart(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const name = (formData.get("name") as string | null)?.trim();
  if (!name) {
    return;
  }

  // user_id comes from the server-side session, never from the client, so a
  // spoofed value in the form can't even be attempted.
  const { error } = await supabase
    .from("flowcharts")
    .insert({ name, user_id: user.id });

  if (error) {
    throw error;
  }

  revalidatePath("/flowcharts");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
