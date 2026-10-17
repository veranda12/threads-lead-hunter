"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="panel mx-auto max-w-lg p-6">
      <h1 className="text-lg font-semibold text-ink">Halaman gagal dimuat</h1>
      <p className="mt-2 text-sm text-ink-2">
        Terjadi error di server. Cek koneksi database dan log server.{error.digest ? ` Kode: ${error.digest}` : ""}
      </p>
      <button type="button" onClick={reset} className="btn btn-secondary mt-4">
        Coba lagi
      </button>
    </div>
  );
}
