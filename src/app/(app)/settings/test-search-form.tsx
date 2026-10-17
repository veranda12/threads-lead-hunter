"use client";

import { useActionState } from "react";
import { testKeywordSearchAction, type TestSearchState } from "./actions";

export function TestSearchForm({ approved }: { approved: boolean }) {
  const [state, action, pending] = useActionState<TestSearchState, FormData>(testKeywordSearchAction, undefined);
  return (
    <div className="border-t border-line pt-5">
      <h3 className="text-sm font-semibold text-ink">Uji keyword search</h3>
      <p className="mt-1 text-xs text-muted">
        Satu panggilan sungguhan ke <code>threads_keyword_search</code> dengan token yang tersimpan. Hasil hanya ditampilkan di sini dan tidak disimpan sebagai lead.
        {approved ? "" : " Sebelum App Review disetujui, Threads hanya mengembalikan postingan milik akun Anda sendiri."}
      </p>
      <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <label htmlFor="test-keyword" className="field-label">
            Keyword
          </label>
          <input id="test-keyword" name="keyword" defaultValue="website" required maxLength={100} className="input" />
        </div>
        <button type="submit" className="btn btn-secondary" disabled={pending} aria-busy={pending}>
          {pending ? "Mencari..." : "Jalankan uji"}
        </button>
      </form>
      {state ? (
        <div role="status" className="mt-3 text-sm">
          <p className={state.ok ? "text-pine" : "text-danger"}>{state.message}</p>
          {state.results && state.results.length > 0 ? (
            <ul className="mt-2 divide-y divide-line rounded-md border border-line">
              {state.results.map((r, i) => (
                <li key={i} className="px-3 py-2">
                  <p className="text-xs text-muted">
                    @{r.username ?? "?"}
                    {r.timestamp ? ` · ${r.timestamp}` : ""}
                    {r.permalink ? (
                      <>
                        {" · "}
                        <a href={r.permalink} target="_blank" rel="noopener noreferrer" className="link">
                          buka
                        </a>
                      </>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-ink-2">{r.text || "(tanpa teks)"}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
