"use client";

import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Check, Copy } from "lucide-react";

export function SubmitButton({
  children,
  pendingText,
  className = "btn btn-primary",
  name,
  value,
}: {
  children: ReactNode;
  pendingText?: string;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value} aria-busy={pending}>
      {pending ? (pendingText ?? "Memproses...") : children}
    </button>
  );
}

export function CopyButton({ text, label = "Salin", className = "btn btn-secondary btn-sm" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setFailed(false);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          setFailed(true);
        }
      }}
    >
      {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      <span aria-live="polite">{copied ? "Tersalin" : failed ? "Gagal menyalin" : label}</span>
    </button>
  );
}

/** Tombol dua langkah untuk aksi destruktif, tanpa dialog browser. */
export function ConfirmSubmit({ children, confirmText = "Klik lagi untuk konfirmasi", className = "btn btn-danger btn-sm" }: { children: ReactNode; confirmText?: string; className?: string }) {
  const [armed, setArmed] = useState(false);
  const { pending } = useFormStatus();
  return (
    <button
      type={armed ? "submit" : "button"}
      className={className}
      disabled={pending}
      onClick={(e) => {
        if (!armed) {
          e.preventDefault();
          setArmed(true);
          setTimeout(() => setArmed(false), 4000);
        }
      }}
    >
      {pending ? "Memproses..." : armed ? confirmText : children}
    </button>
  );
}
