"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { SubmitButton } from "@/components/client/buttons";
import { addKeywordAction, updateKeywordAction, type KeywordState } from "./actions";

const CATEGORY_OPTIONS = [
  { value: "WEBSITE", label: "Website" },
  { value: "ENTERPRISE_SOFTWARE", label: "Software enterprise" },
  { value: "GENERAL", label: "Umum" },
  { value: "TECHNICAL", label: "Teknis" },
];

export function AddKeywordForm() {
  const [state, action] = useActionState<KeywordState, FormData>(addKeywordAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label htmlFor="phrase" className="field-label">
          Keyword baru
        </label>
        <input id="phrase" name="phrase" required maxLength={100} className="input" placeholder="mis. butuh aplikasi kasir" />
      </div>
      <div className="sm:w-52">
        <label htmlFor="category" className="field-label">
          Kategori
        </label>
        <select id="category" name="category" className="input" defaultValue="WEBSITE">
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <SubmitButton>Tambah</SubmitButton>
      {state?.message ? (
        <p role="status" className={`text-sm sm:self-center ${state.ok ? "text-pine" : "text-danger"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function EditKeyword({ id, phrase, category }: { id: string; phrase: string; category: string }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState<KeywordState, FormData>(async (prev, fd) => {
    const res = await updateKeywordAction(prev, fd);
    if (res?.ok) setEditing(false);
    return res;
  }, undefined);
  if (!editing) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
        Edit
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="sr-only" htmlFor={`p-${id}`}>
        Keyword
      </label>
      <input id={`p-${id}`} name="phrase" defaultValue={phrase} className="input w-48" />
      <label className="sr-only" htmlFor={`c-${id}`}>
        Kategori
      </label>
      <select id={`c-${id}`} name="category" defaultValue={category} className="input w-40">
        {CATEGORY_OPTIONS.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      <SubmitButton className="btn btn-primary btn-sm">Simpan</SubmitButton>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
        Batal
      </button>
      {state && !state.ok ? <span className="text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}
