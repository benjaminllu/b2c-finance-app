import Link from "next/link";

export function SampleDataBanner() {
  return (
    <div role="status" className="border-b border-warning bg-warning/20 px-4 py-2 text-center text-sm">
      <strong>Sample data.</strong> The cards, offers, and rates shown are placeholders for testing, not real
      current offers. Do not make decisions based on them.
    </div>
  );
}

export function DisclosureFooter() {
  return (
    <footer className="mt-16 border-t bg-muted/40">
      <div className="mx-auto max-w-6xl space-y-3 px-4 py-8 text-xs text-muted-foreground">
        <p>
          <strong className="text-foreground">Advertiser disclosure.</strong> Some links may be affiliate
          links, and Optima may be paid if you apply through them. Rankings and recommendations never depend
          on affiliate status; they come only from the math shown on each page.
        </p>
        <p>
          <strong className="text-foreground">Not financial advice.</strong> Optima provides educational
          estimates based on the inputs you give it and on data that may be out of date. Confirm terms with
          the issuer or bank before applying. Optima never asks for your bank or card login credentials.
        </p>
        <p>
          <Link href="/admin" className="underline underline-offset-2">
            Admin
          </Link>
        </p>
      </div>
    </footer>
  );
}
