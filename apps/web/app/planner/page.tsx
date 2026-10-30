import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Churn planner" };

export default function PlannerPage() {
  return (
    <PageHeader
      title="Churn planner"
      description="A 12 to 24 month plan for which cards and bank accounts to open and when, with the expected value of each step."
    />
  );
}
