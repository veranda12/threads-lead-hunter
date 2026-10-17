"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { SubmitButton } from "@/components/client/buttons";
import { createPlanAction, createServiceAction, updatePlanAction, type PricingState } from "./actions";

const TYPES = [
  { value: "STARTING_FROM", label: "Mulai dari" },
  { value: "FIXED", label: "Harga tetap" },
  { value: "MONTHLY", label: "Langganan bulanan" },
  { value: "CUSTOM_QUOTE", label: "Custom quotation" },
];

type PlanValues = { id?: string; name: string; pricingType: string; priceMin: number | null; priceMax: number | null; notes: string | null; active: boolean };

function PlanFields({ values, idPrefix }: { values: PlanValues; idPrefix: string }) {
  const [type, setType] = useState(values.pricingType);
  const custom = type === "CUSTOM_QUOTE";
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <div className="lg:col-span-2">
        <label className="field-label" htmlFor={`${idPrefix}-name`}>
          Nama plan
        </label>
        <input id={`${idPrefix}-name`} name="name" defaultValue={values.name} required className="input" placeholder="mis. Paket dasar" />
      </div>
      <div>
        <label className="field-label" htmlFor={`${idPrefix}-type`}>
          Model harga
        </label>
        <select id={`${idPrefix}-type`} name="pricingType" value={type} onChange={(e) => setType(e.target.value)} className="input">
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label" htmlFor={`${idPrefix}-min`}>
          Harga min (Rp)
        </label>
        <input
          id={`${idPrefix}-min`}
          name="priceMin"
          inputMode="numeric"
          disabled={custom}
          defaultValue={values.priceMin ?? ""}
          className="input tabular"
          placeholder={custom ? "Tidak dipakai" : "Kosong = belum ditetapkan"}
        />
      </div>
      <div>
        <label className="field-label" htmlFor={`${idPrefix}-max`}>
          Harga max (Rp, opsional)
        </label>
        <input id={`${idPrefix}-max`} name="priceMax" inputMode="numeric" disabled={custom} defaultValue={values.priceMax ?? ""} className="input tabular" />
      </div>
      <div>
        <label className="field-label" htmlFor={`${idPrefix}-active`}>
          Status
        </label>
        <select id={`${idPrefix}-active`} name="active" defaultValue={values.active ? "on" : "off"} className="input">
          <option value="on">Aktif</option>
          <option value="off">Nonaktif</option>
        </select>
      </div>
      <div className="sm:col-span-2 lg:col-span-6">
        <label className="field-label" htmlFor={`${idPrefix}-notes`}>
          Catatan (opsional)
        </label>
        <input id={`${idPrefix}-notes`} name="notes" defaultValue={values.notes ?? ""} className="input" placeholder="mis. belum termasuk domain dan hosting" />
      </div>
    </div>
  );
}

export function AddPlanForm({ serviceId }: { serviceId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<PricingState, FormData>(async (prev, fd) => {
    const res = await createPlanAction(prev, fd);
    if (res?.ok) setOpen(false);
    return res;
  }, undefined);
  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        Tambah plan harga
      </button>
    );
  }
  return (
    <form action={action} className="mt-2 rounded-md border border-line bg-canvas p-3">
      <input type="hidden" name="serviceId" value={serviceId} />
      <PlanFields idPrefix={`new-${serviceId}`} values={{ name: "", pricingType: "STARTING_FROM", priceMin: null, priceMax: null, notes: null, active: true }} />
      <div className="mt-3 flex items-center gap-2">
        <SubmitButton className="btn btn-primary btn-sm">Simpan plan</SubmitButton>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Batal
        </button>
        {state && !state.ok ? <span className="text-xs text-danger">{state.message}</span> : null}
      </div>
    </form>
  );
}

export function EditPlanForm({ plan }: { plan: PlanValues & { id: string } }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<PricingState, FormData>(async (prev, fd) => {
    const res = await updatePlanAction(prev, fd);
    if (res?.ok) setOpen(false);
    return res;
  }, undefined);
  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        Edit
      </button>
    );
  }
  return (
    <form action={action} className="mt-2 w-full rounded-md border border-line bg-canvas p-3">
      <input type="hidden" name="id" value={plan.id} />
      <PlanFields idPrefix={`edit-${plan.id}`} values={plan} />
      <div className="mt-3 flex items-center gap-2">
        <SubmitButton className="btn btn-primary btn-sm">Simpan</SubmitButton>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Batal
        </button>
        {state && !state.ok ? <span className="text-xs text-danger">{state.message}</span> : null}
      </div>
    </form>
  );
}

export function AddServiceForm() {
  const [state, action] = useActionState<PricingState, FormData>(createServiceAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="panel grid gap-3 p-4 sm:grid-cols-[1fr_200px_1fr_auto] sm:items-end">
      <div>
        <label htmlFor="svc-name" className="field-label">
          Layanan baru
        </label>
        <input id="svc-name" name="name" required className="input" placeholder="mis. Sistem reservasi lapangan" />
      </div>
      <div>
        <label htmlFor="svc-cat" className="field-label">
          Kategori
        </label>
        <select id="svc-cat" name="category" className="input">
          <option value="WEBSITE">Website</option>
          <option value="ENTERPRISE_SOFTWARE">Software enterprise</option>
          <option value="TECHNICAL_SERVICE">Layanan teknis</option>
        </select>
      </div>
      <div>
        <label htmlFor="svc-desc" className="field-label">
          Deskripsi (opsional)
        </label>
        <input id="svc-desc" name="description" className="input" />
      </div>
      <SubmitButton>Tambah</SubmitButton>
      {state?.message ? <p className={`text-sm sm:col-span-4 ${state.ok ? "text-pine" : "text-danger"}`}>{state.message}</p> : null}
    </form>
  );
}
