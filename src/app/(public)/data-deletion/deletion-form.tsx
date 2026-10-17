"use client";

import Link from "next/link";
import { useActionState } from "react";
import { submitDeletionRequest, type DeletionState } from "./actions";

export function DeletionForm() {
  const [state, action, pending] = useActionState<DeletionState, FormData>(submitDeletionRequest, undefined);

  if (state?.ok) {
    return (
      <div role="status" className="panel p-5">
        <p className="font-medium text-ink">Permintaan diterima / Request received</p>
        <p className="mt-2 text-sm text-ink-2">
          Kode konfirmasi / Confirmation code: <code className="rounded bg-sunken px-1.5 py-0.5 text-ink">{state.code}</code>
        </p>
        <p className="mt-2 text-sm text-ink-2">
          Simpan kode ini. Username Anda sudah dikecualikan dari pengumpulan data berikutnya. / Keep this code. Your username is already excluded from further collection.
        </p>
        <Link href={`/data-deletion/status?code=${encodeURIComponent(state.code)}`} className="btn btn-secondary mt-4">
          Cek status / Check status
        </Link>
      </div>
    );
  }

  const err = state && !state.ok ? (state.errors ?? {}) : {};
  return (
    <form action={action} className="panel space-y-4 p-5" noValidate>
      <div aria-hidden className="hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div>
        <label htmlFor="threadsUsername" className="field-label">
          Username Threads
        </label>
        <input id="threadsUsername" name="threadsUsername" required maxLength={31} className="input" placeholder="@username" aria-invalid={Boolean(err.threadsUsername)} />
        {err.threadsUsername ? <p className="field-error">{err.threadsUsername}</p> : null}
      </div>
      <div>
        <label htmlFor="contactEmail" className="field-label">
          Email untuk kabar status (opsional) / Email for status updates (optional)
        </label>
        <input id="contactEmail" name="contactEmail" type="email" maxLength={200} className="input" placeholder="email@example.com" aria-invalid={Boolean(err.contactEmail)} />
        {err.contactEmail ? <p className="field-error">{err.contactEmail}</p> : null}
      </div>
      <div>
        <label htmlFor="details" className="field-label">
          Keterangan (opsional) / Details (optional)
        </label>
        <textarea id="details" name="details" rows={3} maxLength={2000} className="input" placeholder="Mis. link postingan tertentu / e.g. a specific post link" />
      </div>
      {state && !state.ok && state.message ? (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Mengirim..." : "Kirim permintaan / Submit request"}
      </button>
    </form>
  );
}
