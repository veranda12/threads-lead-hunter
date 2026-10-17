"use client";

import { useActionState } from "react";
import { importPostAction, type ActionState } from "../actions";

export function ImportForm({ aiConfigured }: { aiConfigured: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(importPostAction, undefined);
  const err = state?.errors ?? {};
  return (
    <form action={action} className="panel space-y-5 p-5" noValidate>
      <div>
        <label htmlFor="url" className="field-label">
          URL postingan
        </label>
        <input
          id="url"
          name="url"
          type="url"
          required
          className="input"
          placeholder="https://www.threads.com/@username/post/ABC123"
          aria-invalid={Boolean(err.url)}
          aria-describedby="url-hint"
        />
        <p id="url-hint" className={err.url ? "field-error" : "field-hint"}>
          {err.url ?? "Username dan ID postingan diambil dari URL. Hanya domain threads.com dan threads.net."}
        </p>
      </div>

      <div>
        <label htmlFor="text" className="field-label">
          Teks postingan
        </label>
        <textarea id="text" name="text" rows={7} required className="input" placeholder="Salin teks postingan apa adanya" aria-invalid={Boolean(err.text)} />
        {err.text ? <p className="field-error">{err.text}</p> : null}
      </div>

      <div>
        <label htmlFor="postedAtLocal" className="field-label">
          Waktu posting (WIB, opsional)
        </label>
        <input id="postedAtLocal" name="postedAtLocal" type="datetime-local" className="input sm:max-w-xs" aria-invalid={Boolean(err.postedAtLocal)} />
        <p className={err.postedAtLocal ? "field-error" : "field-hint"}>
          {err.postedAtLocal ?? "Kosongkan bila tidak tahu. Lead tanpa waktu posting berstatus freshness tidak diketahui dan tidak masuk daftar Fresh."}
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm text-ink-2">
        <input type="checkbox" name="analyzeNow" defaultChecked={aiConfigured} disabled={!aiConfigured} className="mt-0.5" />
        <span>
          Langsung analisis dengan AI
          {!aiConfigured ? <span className="block text-xs text-muted">AI tidak bisa dijalankan dari server ini. Lead disimpan sebagai pending dan dianalisis oleh worker atau run berikutnya.</span> : null}
        </span>
      </label>

      {state?.message ? (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Menyimpan..." : "Simpan dan buka"}
        </button>
      </div>
    </form>
  );
}
