"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import { CopyButton, SubmitButton } from "@/components/client/buttons";
import {
  addNoteAction,
  changeStatusAction,
  generateDraftsAction,
  markContactedAction,
  saveDraftAction,
  setFollowUpAction,
  toggleFavoriteAction,
  type ActionState,
} from "../actions";

function Feedback({ state }: { state: ActionState }) {
  if (!state?.message) return null;
  return (
    <p role="status" className={`mt-2 text-xs ${state.ok ? "text-pine" : "text-danger"}`}>
      {state.message}
    </p>
  );
}

export function StatusForm({ leadId, current, options }: { leadId: string; current: string; options: { value: string; label: string }[] }) {
  const [state, action] = useActionState<ActionState, FormData>(changeStatusAction, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="leadId" value={leadId} />
      <label htmlFor="status" className="field-label">
        Pindahkan ke
      </label>
      <div className="flex gap-2">
        <select id="status" name="status" className="input" defaultValue="" required>
          <option value="" disabled>
            Pilih status
          </option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <SubmitButton className="btn btn-secondary" pendingText="...">
          Ubah
        </SubmitButton>
      </div>
      <Feedback state={state} />
      <input type="hidden" name="current" value={current} />
    </form>
  );
}

export function FollowUpForm({ leadId, value }: { leadId: string; value: string }) {
  const [state, action] = useActionState<ActionState, FormData>(setFollowUpAction, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="leadId" value={leadId} />
      <label htmlFor="followUp" className="field-label">
        Follow-up berikutnya (WIB)
      </label>
      <div className="flex gap-2">
        <input id="followUp" name="followUp" type="datetime-local" defaultValue={value} className="input" />
        <SubmitButton className="btn btn-secondary" pendingText="...">
          Simpan
        </SubmitButton>
      </div>
      {state?.errors?.followUp ? <p className="field-error">{state.errors.followUp}</p> : <Feedback state={state} />}
    </form>
  );
}

export function NoteForm({ leadId }: { leadId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(addNoteAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form action={action} ref={ref}>
      <input type="hidden" name="leadId" value={leadId} />
      <label htmlFor="note" className="sr-only">
        Catatan baru
      </label>
      <textarea id="note" name="body" rows={3} className="input" placeholder="Tulis catatan, mis. hasil obrolan atau kebutuhan yang dikonfirmasi" />
      {state?.errors?.body ? <p className="field-error">{state.errors.body}</p> : null}
      <div className="mt-2 flex justify-end">
        <SubmitButton className="btn btn-secondary btn-sm">Tambah catatan</SubmitButton>
      </div>
    </form>
  );
}

export function GenerateDraftsForm({ leadId, tone, label, className = "btn btn-primary" }: { leadId: string; tone?: string; label: string; className?: string }) {
  const [state, action] = useActionState<ActionState, FormData>(generateDraftsAction, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="leadId" value={leadId} />
      {tone ? <input type="hidden" name="tone" value={tone} /> : null}
      <SubmitButton className={className} pendingText="Menulis draft...">
        {label}
      </SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

export function DraftEditor({
  leadId,
  draftId,
  tone,
  toneLabel,
  body,
  isFavorite,
  usedAt,
  issues,
  revisionLabel,
}: {
  leadId: string;
  draftId: string;
  tone: string;
  toneLabel: string;
  body: string;
  isFavorite: boolean;
  usedAt: string | null;
  issues: string[];
  revisionLabel: string;
}) {
  const [text, setText] = useState(body);
  const [state, action] = useActionState<ActionState, FormData>(saveDraftAction, undefined);
  const dirty = text.trim() !== body.trim();
  return (
    <div className="border-b border-line p-4 last:border-b-0 sm:p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">{toneLabel}</h3>
          <span className="text-xs text-faint">{revisionLabel}</span>
          {usedAt ? <span className="text-xs text-pine">Sudah dipakai</span> : null}
        </div>
        <form action={toggleFavoriteAction}>
          <input type="hidden" name="draftId" value={draftId} />
          <button type="submit" className="btn btn-ghost btn-sm" aria-pressed={isFavorite} title={isFavorite ? "Hapus dari favorit" : "Simpan sebagai favorit"}>
            <Star size={14} aria-hidden className={isFavorite ? "fill-ochre text-ochre" : ""} />
            {isFavorite ? "Favorit" : "Jadikan favorit"}
          </button>
        </form>
      </div>
      <form action={action}>
        <input type="hidden" name="draftId" value={draftId} />
        <label htmlFor={`draft-${tone}`} className="sr-only">
          Draft {toneLabel}
        </label>
        <textarea id={`draft-${tone}`} name="body" rows={5} value={text} onChange={(e) => setText(e.target.value)} className="input leading-relaxed" />
        <div className="mt-1 flex justify-between text-xs text-faint">
          <span>{issues.length ? <span className="text-ochre">Perlu dicek: {issues.join("; ")}</span> : "Lolos pemeriksaan aturan DM"}</span>
          <span className="tabular">{text.length} karakter</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CopyButton text={text} />
          <SubmitButton className="btn btn-secondary btn-sm" pendingText="Menyimpan...">
            {dirty ? "Simpan editan" : "Simpan"}
          </SubmitButton>
          <span className="flex-1" />
        </div>
        <Feedback state={state} />
      </form>
      <div className="mt-2 flex flex-wrap items-start gap-2">
        <form action={markContactedAction}>
          <input type="hidden" name="leadId" value={leadId} />
          <input type="hidden" name="draftId" value={draftId} />
          <SubmitButton className="btn btn-ghost btn-sm">Tandai sudah saya kirim</SubmitButton>
        </form>
        <GenerateDraftsForm leadId={leadId} tone={tone} label="Tulis ulang versi ini" className="btn btn-ghost btn-sm" />
      </div>
    </div>
  );
}
