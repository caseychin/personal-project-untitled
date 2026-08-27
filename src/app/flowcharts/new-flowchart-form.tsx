import { createFlowchart } from "./actions";

export function NewFlowchartForm() {
  return (
    <form action={createFlowchart} className="flex gap-2">
      <input
        type="text"
        name="name"
        required
        placeholder="Flowchart name"
        className="rounded border border-black/10 px-3 py-2 text-sm dark:border-white/20"
      />
      <button
        type="submit"
        className="rounded bg-foreground px-4 py-2 text-sm text-background"
      >
        Create
      </button>
    </form>
  );
}
