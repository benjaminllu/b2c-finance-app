import type { Metadata } from "next";
import Link from "next/link";
import { DisclosureFooter, SampleDataBanner } from "@/components/site-chrome";
import { SiteNav } from "@/components/site-nav";
import { hasSampleData } from "@/lib/data/sample";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Optima", template: "%s | Optima" },
  description: "A decision engine for credit cards, bank bonuses, and deposit accounts that shows its math.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const sample = await hasSampleData();
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-background focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        {sample && <SampleDataBanner />}
        <header className="border-b">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight">
              Optima
            </Link>
            <SiteNav />
          </div>
        </header>
        <main id="main" className="mx-auto max-w-6xl px-4 py-8">
          {children}
        </main>
        <DisclosureFooter />
      </body>
    </html>
  );
}
