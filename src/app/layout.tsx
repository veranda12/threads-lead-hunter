import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Threads Lead Hunter", template: "%s · Threads Lead Hunter" },
  description: "Alat internal untuk menemukan dan menindaklanjuti kebutuhan jasa website dan software di Threads.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f4f3ef",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={jakarta.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
