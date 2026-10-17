"use client";

import { useActionState, type ReactNode } from "react";

type State = { ok?: boolean; message?: string } | undefined;

/** Form generik dengan feedback dari Server Action. */
export function ActionForm({
  action,
  children,
  submitLabel = "Simpan",
  className = "space-y-4",
  resetOnSuccess,
}: {
  action: (prev: State, fd: FormData) => Promise<State>;
  children: ReactNode;
  submitLabel?: string;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(async (prev, fd) => {
    const res = await action(prev, fd);
    return res;
  }, undefined);
  return (
    <form action={formAction} className={className} key={resetOnSuccess && state?.ok ? state.message : undefined}>
      {children}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Menyimpan..." : submitLabel}
        </button>
        {state?.message ? (
          <p role="status" className={`text-sm ${state.ok ? "text-pine" : "text-danger"}`}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
