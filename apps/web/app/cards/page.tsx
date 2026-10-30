import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Compare cards" };

export default function CardsPage() {
  return (
    <PageHeader
      title="Compare credit cards"
      description="Put 2 to 4 cards side by side, enter your spending, and see which wins and where the break-even points are."
    />
  );
}
