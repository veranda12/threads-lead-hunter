import type { ReactNode } from "react";
import Link from "next/link";
import { THREADS_SEARCH_FIELDS } from "@/lib/providers/threads-api";

export type PolicyConfig = {
  controllerName: string;
  contactEmail: string;
  contactAddress: string;
  effectiveDate: string;
  retentionUnqualifiedDays: number | null;
  retentionRawPayloadDays: number | null;
  retentionClosedLeadDays: number | null;
  deletionResponseDays: number | null;
  appUrl: string;
  aiProvider: "anthropic" | "ollama";
  https: boolean;
};

export type Lang = "id" | "en";

function Missing({ lang }: { lang: Lang }) {
  return (
    <mark className="rounded-sm bg-ochre-soft px-1 text-ochre">{lang === "id" ? "[belum ditetapkan oleh pengelola]" : "[not yet set by the operator]"}</mark>
  );
}

function V({ value, lang }: { value: string | number | null | undefined; lang: Lang }) {
  if (value === null || value === undefined || value === "") return <Missing lang={lang} />;
  return <>{value}</>;
}

function Days({ n, lang }: { n: number | null; lang: Lang }) {
  if (n === null) return <Missing lang={lang} />;
  return <>{lang === "id" ? `${n} hari` : `${n} days`}</>;
}

const FIELD_LABELS: Record<Lang, Record<string, string>> = {
  id: {
    id: "ID media postingan",
    text: "teks postingan",
    media_type: "jenis media (teks, gambar, video)",
    permalink: "permalink (URL publik postingan)",
    timestamp: "waktu posting",
    username: "username Threads penulis",
    shortcode: "shortcode postingan",
  },
  en: {
    id: "post media ID",
    text: "post text",
    media_type: "media type (text, image, video)",
    permalink: "permalink (public URL of the post)",
    timestamp: "publish timestamp",
    username: "author's Threads username",
    shortcode: "post shortcode",
  },
};

export type Section = { id: string; title: string; body: ReactNode };

export function policySections(lang: Lang, c: PolicyConfig): Section[] {
  const fields = THREADS_SEARCH_FIELDS.map((f) => FIELD_LABELS[lang][f] ?? f);
  const email = c.contactEmail ? (
    <a className="link" href={`mailto:${c.contactEmail}`}>
      {c.contactEmail}
    </a>
  ) : (
    <Missing lang={lang} />
  );
  const deletionLink = (
    <Link className="link" href="/data-deletion">
      {c.appUrl}/data-deletion
    </Link>
  );

  if (lang === "en") {
    return [
      {
        id: "about",
        title: "1. About this application",
        body: (
          <>
            <p>
              Threads Lead Hunter is an internal tool operated by <V value={c.controllerName} lang={lang} /> (&ldquo;the operator&rdquo;), a software engineer offering website and
              custom software development services. It finds recent public Threads posts in which people say they need a website, an application, or a developer, analyzes whether
              the post is a genuine service request, and helps the operator prepare a reply that the operator sends personally.
            </p>
            <p>The application is not a public service. It has exactly one user account: the operator&rsquo;s. People whose posts appear in search results do not have accounts here.</p>
          </>
        ),
      },
      {
        id: "data",
        title: "2. Data we collect",
        body: (
          <>
            <p>
              <strong>From the official Threads API.</strong> The application uses the Keyword Search endpoint with the <code>threads_basic</code> and{" "}
              <code>threads_keyword_search</code> permissions. For public posts that match the operator&rsquo;s search keywords and were published within the last 6 hours, it stores only
              these fields: {fields.join(", ")}.
            </p>
            <p>
              It does not collect profile photos, follower lists, private messages, email addresses, phone numbers, location, or media files. Posts without a valid timestamp or older
              than 6 hours are not stored as leads; only their media ID and the rejection reason are kept in the run log.
            </p>
            <p>
              <strong>The operator&rsquo;s own Threads account.</strong> When the operator connects Threads via OAuth, the application stores the operator&rsquo;s Threads user ID,
              username, and access token. The access token is encrypted with AES-256-GCM before it is written to the database.
            </p>
            <p>
              <strong>Manual import.</strong> The operator can paste the URL and text of a public Threads post they found themselves. These records are labeled as manual imports. No
              scraping or private API is used.
            </p>
            <p>
              <strong>Data deletion requests.</strong> The Threads username, optional email address, optional message, request time, and IP address submitted through the deletion form.
            </p>
            <p>
              <strong>Operational data.</strong> Login sessions of the operator (IP address and browser user agent), an audit log of administrative actions, and API usage counters.
            </p>
          </>
        ),
      },
      {
        id: "purpose",
        title: "3. How we use the data",
        body: (
          <ul>
            <li>To identify posts that express a real need for website or software development services and rank them by relevance.</li>
            <li>To draft a personalized message suggestion that the operator may edit and send manually.</li>
            <li>To keep a private follow-up record (status, notes, follow-up date) for conversations the operator chooses to start.</li>
          </ul>
        ),
      },
      {
        id: "no-auto",
        title: "4. No automated messaging or posting",
        body: (
          <p>
            The application never sends direct messages, replies, likes, follows, or posts on anyone&rsquo;s behalf. It does not request publishing or messaging permissions. Every message
            is copied and sent manually by the operator inside the Threads app, and only after the operator has read the original post.
          </p>
        ),
      },
      {
        id: "ai",
        title: c.aiProvider === "ollama" ? "5. AI processing on the operator's own device" : "5. AI processing with the Claude API",
        body: c.aiProvider === "ollama" ? (
          <>
            <p>
              Posts that pass a keyword pre-filter are analyzed by an open-weight language model running locally with Ollama on the operator&rsquo;s own computer, to classify intent
              and draft message suggestions. The data processed is the post text, author username, post timestamp, and the matched keyword. Post content is not sent to any third-party
              AI provider. Posts rejected by the pre-filter are not analyzed. Post content is treated as untrusted input; instructions inside a post are ignored.
            </p>
            <p>AI output is a suggestion; the operator decides whether to contact anyone.</p>
          </>
        ) : (
          <>
            <p>
              Posts that pass a keyword pre-filter are sent to the Anthropic Claude API to classify intent and draft message suggestions. The data sent is the post text, author
              username, post timestamp, and the matched keyword. Posts rejected by the pre-filter are not sent. Post content is treated as untrusted input; instructions inside a post
              are ignored.
            </p>
            <p>
              Anthropic processes this data as a service provider under its{" "}
              <a className="link" href="https://www.anthropic.com/legal/commercial-terms" target="_blank" rel="noopener noreferrer">
                Commercial Terms
              </a>{" "}
              and{" "}
              <a className="link" href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noopener noreferrer">
                Privacy Policy
              </a>
              . AI output is a suggestion; the operator decides whether to contact anyone.
            </p>
          </>
        ),
      },
      {
        id: "sharing",
        title: "6. Sharing",
        body: (
          <p>
            Data is not sold, rented, or used for advertising, and it is not transferred to data brokers. It is processed only by the infrastructure needed to run the application:
            Meta (Threads API), {c.aiProvider === "ollama" ? "" : "Anthropic (Claude API), "}and the hosting and database providers chosen by the operator. Data obtained from the Threads API is used only for the purposes in
            section 3, in line with the Meta Platform Terms and Developer Policies.
          </p>
        ),
      },
      {
        id: "security",
        title: "7. Storage and access control",
        body: (
          <ul>
            <li>Data is stored in a PostgreSQL database administered by the operator. Timestamps are stored in UTC.</li>
            <li>The dashboard requires the operator&rsquo;s login. Passwords are stored as scrypt hashes. Sessions use HttpOnly cookies and expire after 7 days. Login attempts are rate limited.</li>
            <li>Threads access tokens are encrypted at rest with AES-256-GCM and are never sent to the browser.</li>
            <li>The internal discovery endpoint requires a secret token. Administrative actions are written to an append-only audit log.</li>
            {c.https ? <li>The application is served over HTTPS.</li> : null}
          </ul>
        ),
      },
      {
        id: "retention",
        title: "8. Retention",
        body: (
          <>
            <ul>
              <li>
                Leads with status &ldquo;New&rdquo; that were rejected by the pre-filter or rated &ldquo;Ignore&rdquo; are deleted automatically after{" "}
                <Days n={c.retentionUnqualifiedDays} lang={lang} />.
              </li>
              <li>
                The raw JSON returned by the Threads API is removed after <Days n={c.retentionRawPayloadDays} lang={lang} />; the post text and follow-up history stay until the lead
                is deleted.
              </li>
              <li>
                Leads marked &ldquo;Lost&rdquo; or &ldquo;Archived&rdquo; are deleted after <Days n={c.retentionClosedLeadDays} lang={lang} /> without activity.
              </li>
              <li>Leads in an active conversation are kept while the conversation is active. A post becoming older than 6 hours does not delete it.</li>
            </ul>
            <p>Where a period is shown as not yet set, no automatic deletion runs for that category; the data stays until it is deleted manually or on request.</p>
          </>
        ),
      },
      {
        id: "rights",
        title: "9. Your choices and data deletion",
        body: (
          <>
            <p>
              <strong>If your post appears in this tool</strong>, you can ask for your data to be deleted at {deletionLink} or by email to {email}. When a request is received, your
              username is immediately added to an exclusion list (stored only as a SHA-256 hash) so new posts from you are not collected. The operator then deletes every stored post, analysis, note, and message draft
              linked to your username within <Days n={c.deletionResponseDays} lang={lang} />. You receive a confirmation code to check the status.
            </p>
            <p>
              <strong>If you connected this app to Threads</strong>, you can remove it from your Threads app settings. Meta then calls this application&rsquo;s data deletion callback,
              which deletes the stored access token and account details automatically and returns a confirmation code.
            </p>
            <p>You can also email {email} to ask what data is held about you or to correct it.</p>
          </>
        ),
      },
      {
        id: "changes",
        title: "10. Changes",
        body: (
          <p>
            Updates to this policy are published on this page with a new effective date. Effective date: <V value={c.effectiveDate} lang={lang} />.
          </p>
        ),
      },
      {
        id: "contact",
        title: "11. Contact",
        body: (
          <p>
            Data controller: <V value={c.controllerName} lang={lang} />. Email: {email}.{c.contactAddress ? ` Address: ${c.contactAddress}.` : ""}
          </p>
        ),
      },
    ];
  }

  return [
    {
      id: "tentang",
      title: "1. Tentang aplikasi",
      body: (
        <>
          <p>
            Threads Lead Hunter adalah alat internal yang dikelola oleh <V value={c.controllerName} lang={lang} /> (&ldquo;pengelola&rdquo;), seorang software engineer yang menawarkan
            jasa pembuatan website dan software custom. Aplikasi ini mencari postingan publik Threads terbaru dari orang yang menyatakan butuh website, aplikasi, atau developer,
            menilai apakah postingan itu permintaan jasa yang nyata, dan membantu pengelola menyiapkan balasan yang dikirim sendiri oleh pengelola.
          </p>
          <p>Aplikasi ini bukan layanan publik. Hanya ada satu akun pengguna, yaitu akun pengelola. Orang yang postingannya muncul di hasil pencarian tidak memiliki akun di sini.</p>
        </>
      ),
    },
    {
      id: "data",
      title: "2. Data yang dikumpulkan",
      body: (
        <>
          <p>
            <strong>Dari Threads API resmi.</strong> Aplikasi memakai endpoint Keyword Search dengan izin <code>threads_basic</code> dan <code>threads_keyword_search</code>. Untuk
            postingan publik yang cocok dengan keyword pencarian pengelola dan diposting dalam 6 jam terakhir, aplikasi hanya menyimpan field berikut: {fields.join(", ")}.
          </p>
          <p>
            Aplikasi tidak mengumpulkan foto profil, daftar pengikut, pesan pribadi, alamat email, nomor telepon, lokasi, maupun file media. Postingan dengan timestamp tidak valid
            atau lebih dari 6 jam tidak disimpan sebagai lead; hanya ID media dan alasan penolakannya yang dicatat di log run.
          </p>
          <p>
            <strong>Akun Threads milik pengelola.</strong> Saat pengelola menghubungkan Threads lewat OAuth, aplikasi menyimpan ID pengguna Threads, username, dan access token milik
            pengelola. Access token dienkripsi dengan AES-256-GCM sebelum disimpan ke database.
          </p>
          <p>
            <strong>Import manual.</strong> Pengelola dapat menempelkan URL dan teks postingan publik Threads yang ia temukan sendiri. Data ini ditandai sebagai import manual. Tidak ada
            scraping maupun penggunaan API privat.
          </p>
          <p>
            <strong>Permintaan penghapusan data.</strong> Username Threads, email (opsional), pesan (opsional), waktu permintaan, dan alamat IP yang dikirim lewat formulir penghapusan.
          </p>
          <p>
            <strong>Data operasional.</strong> Sesi login pengelola (alamat IP dan user agent browser), audit log aksi administratif, dan penghitung pemakaian API.
          </p>
        </>
      ),
    },
    {
      id: "tujuan",
      title: "3. Tujuan penggunaan data",
      body: (
        <ul>
          <li>Mengenali postingan yang menunjukkan kebutuhan nyata akan jasa pembuatan website atau software, lalu mengurutkannya berdasarkan relevansi.</li>
          <li>Menyusun saran pesan yang personal untuk diedit dan dikirim manual oleh pengelola.</li>
          <li>Menyimpan catatan tindak lanjut pribadi (status, catatan, jadwal follow-up) untuk percakapan yang dipilih pengelola.</li>
        </ul>
      ),
    },
    {
      id: "tanpa-otomatis",
      title: "4. Tidak ada pengiriman pesan atau posting otomatis",
      body: (
        <p>
          Aplikasi tidak pernah mengirim DM, membalas, menyukai, mengikuti, atau memposting atas nama siapa pun. Aplikasi tidak meminta izin publikasi maupun pesan. Setiap pesan disalin
          dan dikirim manual oleh pengelola di aplikasi Threads, setelah pengelola membaca postingan aslinya.
        </p>
      ),
    },
    {
      id: "ai",
      title: c.aiProvider === "ollama" ? "5. Pemrosesan AI di perangkat pengelola" : "5. Pemrosesan AI dengan Claude API",
      body: c.aiProvider === "ollama" ? (
        <>
          <p>
            Postingan yang lolos pre-filter keyword dianalisis oleh model bahasa open-weight yang berjalan lokal dengan Ollama di komputer milik pengelola, untuk mengklasifikasi maksud
            postingan dan menyusun saran pesan. Data yang diproses adalah teks postingan, username penulis, waktu posting, dan keyword yang cocok. Isi postingan tidak dikirim ke
            penyedia AI pihak ketiga. Postingan yang tidak lolos pre-filter tidak dianalisis. Isi postingan diperlakukan sebagai input tidak tepercaya; instruksi di dalam postingan
            diabaikan.
          </p>
          <p>Hasil AI hanya saran; keputusan menghubungi seseorang tetap di tangan pengelola.</p>
        </>
      ) : (
        <>
          <p>
            Postingan yang lolos pre-filter keyword dikirim ke Anthropic Claude API untuk mengklasifikasi maksud postingan dan menyusun saran pesan. Data yang dikirim adalah teks
            postingan, username penulis, waktu posting, dan keyword yang cocok. Postingan yang tidak lolos pre-filter tidak dikirim. Isi postingan diperlakukan sebagai input tidak
            tepercaya; instruksi di dalam postingan diabaikan.
          </p>
          <p>
            Anthropic memproses data ini sebagai penyedia layanan berdasarkan{" "}
            <a className="link" href="https://www.anthropic.com/legal/commercial-terms" target="_blank" rel="noopener noreferrer">
              Commercial Terms
            </a>{" "}
            dan{" "}
            <a className="link" href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>{" "}
            miliknya. Hasil AI hanya saran; keputusan menghubungi seseorang tetap di tangan pengelola.
          </p>
        </>
      ),
    },
    {
      id: "berbagi",
      title: "6. Berbagi data",
      body: (
        <p>
          Data tidak dijual, disewakan, atau dipakai untuk iklan, dan tidak diserahkan ke data broker. Data hanya diproses oleh infrastruktur yang diperlukan untuk menjalankan
          aplikasi: Meta (Threads API), {c.aiProvider === "ollama" ? "" : "Anthropic (Claude API), "}serta penyedia hosting dan database yang dipilih pengelola. Data dari Threads API hanya dipakai untuk tujuan di bagian 3,
          sesuai Meta Platform Terms dan Developer Policies.
        </p>
      ),
    },
    {
      id: "keamanan",
      title: "7. Penyimpanan dan kontrol akses",
      body: (
        <ul>
          <li>Data disimpan di database PostgreSQL yang dikelola pengelola. Timestamp disimpan dalam UTC.</li>
          <li>Dashboard hanya bisa diakses dengan login pengelola. Password disimpan sebagai hash scrypt. Sesi memakai cookie HttpOnly dan berakhir setelah 7 hari. Percobaan login dibatasi.</li>
          <li>Access token Threads dienkripsi saat disimpan (AES-256-GCM) dan tidak pernah dikirim ke browser.</li>
          <li>Endpoint discovery internal memerlukan secret token. Aksi administratif dicatat di audit log yang tidak dapat diubah.</li>
          {c.https ? <li>Aplikasi diakses melalui HTTPS.</li> : null}
        </ul>
      ),
    },
    {
      id: "retensi",
      title: "8. Retensi",
      body: (
        <>
          <ul>
            <li>
              Lead berstatus &ldquo;Baru&rdquo; yang tidak lolos pre-filter atau dinilai &ldquo;Abaikan&rdquo; dihapus otomatis setelah <Days n={c.retentionUnqualifiedDays} lang={lang} />.
            </li>
            <li>
              Data JSON mentah dari Threads API dihapus setelah <Days n={c.retentionRawPayloadDays} lang={lang} />; teks postingan dan riwayat tindak lanjut tetap ada sampai lead
              dihapus.
            </li>
            <li>
              Lead berstatus &ldquo;Tidak jadi&rdquo; atau &ldquo;Diarsipkan&rdquo; dihapus setelah <Days n={c.retentionClosedLeadDays} lang={lang} /> tanpa aktivitas.
            </li>
            <li>Lead yang percakapannya masih berjalan tetap disimpan. Postingan yang sudah lewat 6 jam tidak otomatis terhapus.</li>
          </ul>
          <p>Jika suatu periode tertulis belum ditetapkan, tidak ada penghapusan otomatis untuk kategori itu; data disimpan sampai dihapus manual atau atas permintaan.</p>
        </>
      ),
    },
    {
      id: "hak",
      title: "9. Pilihan Anda dan penghapusan data",
      body: (
        <>
          <p>
            <strong>Jika postingan Anda muncul di alat ini</strong>, Anda dapat meminta data Anda dihapus melalui {deletionLink} atau email ke {email}. Saat permintaan diterima, username
            Anda langsung dimasukkan ke daftar pengecualian (disimpan hanya sebagai hash SHA-256) sehingga postingan baru Anda tidak dikumpulkan. Pengelola kemudian menghapus seluruh postingan, analisis, catatan, dan draft
            pesan yang terkait dengan username Anda dalam waktu <Days n={c.deletionResponseDays} lang={lang} />. Anda menerima kode konfirmasi untuk mengecek status.
          </p>
          <p>
            <strong>Jika Anda menghubungkan aplikasi ini ke Threads</strong>, Anda dapat menghapusnya dari pengaturan aplikasi di Threads. Meta lalu memanggil data deletion callback
            aplikasi ini, yang otomatis menghapus access token dan detail akun yang tersimpan, lalu mengembalikan kode konfirmasi.
          </p>
          <p>Anda juga dapat mengirim email ke {email} untuk menanyakan data apa yang disimpan tentang Anda atau meminta koreksi.</p>
        </>
      ),
    },
    {
      id: "perubahan",
      title: "10. Perubahan kebijakan",
      body: (
        <p>
          Perubahan kebijakan ini dipublikasikan di halaman ini dengan tanggal berlaku yang baru. Tanggal berlaku: <V value={c.effectiveDate} lang={lang} />.
        </p>
      ),
    },
    {
      id: "kontak",
      title: "11. Kontak",
      body: (
        <p>
          Pengelola data: <V value={c.controllerName} lang={lang} />. Email: {email}.{c.contactAddress ? ` Alamat: ${c.contactAddress}.` : ""}
        </p>
      ),
    },
  ];
}
