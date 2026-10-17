"use client";

import { useActionState, useRef } from "react";
import { changeStatusAction, type ActionState } from "../leads/actions";

export function QuickStatus({ leadId, options, label }: { leadId: string; options: { value: string; label: string }[]; label: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(changeStatusAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form action={action} ref={ref} className="relative z-10">
      <input type="hidden" name="leadId" value={leadId} />
      <label className="sr-only" htmlFor={`qs-${leadId}`}>
        Pindahkan {label}
      </label>
      <select
        id={`qs-${leadId}`}
        name="status"
        defaultValue=""
        disabled={pending}
        onChange={() => ref.current?.requestSubmit()}
        className="w-full rounded-sm border border-line bg-surface px-1.5 py-1 text-xs text-ink-2"
      >
        <option value="" disabled>
          {pending ? "Memindahkan..." : "Pindahkan ke..."}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {state && !state.ok && state.message ? <p className="mt-1 text-xs text-danger">{state.message}</p> : null}
    </form>
  );
}
