import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { NewFlowchartForm } from "./new-flowchart-form";

export default async function FlowchartsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defense in depth — middleware already redirects unauthenticated
  // requests away from this route.
  if (!user) {
    redirect("/login");
  }

  const { data: flowcharts, error } = await supabase
    .from("flowcharts")
    .select("id, name, catalog_year, is_archived, created_at")
    .eq("is_archived", false)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your flowcharts</h1>
        <form action={signOut}>
          <button type="submit" className="text-sm underline">
            Sign out
          </button>
        </form>
      </div>

      <NewFlowchartForm />

      {flowcharts.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No flowcharts yet — create one above.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {flowcharts.map((f) => (
            <li
              key={f.id}
              className="rounded border border-black/10 px-4 py-3 dark:border-white/20"
            >
              <span className="font-medium">{f.name}</span>
              {f.catalog_year && (
                <span className="ml-2 text-sm text-zinc-500">
                  {f.catalog_year}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
