"use client";

import { useActionState } from "react";
import { manualRunAction, type RunState } from "./actions";

export function ManualRunButton() {
  const [state, action, pending] = useActionState<RunState, FormData>(manualRunAction, undefined);
  return (
    <form action={action} className="flex flex-col items-start gap-1 sm:items-end">
      <button type="submit" className="btn btn-primary" disabled={pending} aria-busy={pending}>
        {pending ? "Discovery berjalan..." : "Jalankan discovery sekarang"}
      </button>
      {state?.message ? (
        <p role="status" className={`max-w-sm text-xs ${state.ok ? "text-pine" : "text-danger"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
