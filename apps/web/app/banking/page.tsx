import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Banking" };

export default function BankingPage() {
  return (
    <PageHeader
      title="Where should my cash go?"
      description="Compare checking, savings, money market accounts, CDs, and bank bonuses on one effective-APY scale."
    />
  );
}
