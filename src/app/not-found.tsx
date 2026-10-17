import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold text-ink">Halaman tidak ditemukan</h1>
      <p className="mt-2 text-sm text-muted">Data mungkin sudah dihapus atau tautannya salah.</p>
      <Link href="/" className="btn btn-secondary mt-6">
        Kembali ke ringkasan
      </Link>
    </main>
  );
}
