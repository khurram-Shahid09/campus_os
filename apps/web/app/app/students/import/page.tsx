import { PageTitle } from "@/components/ui";
import { requireApp } from "@/lib/auth";
import { Importer } from "./importer";

export const metadata = { title: "Upload register · CampusOS" };

export default async function ImportPage() {
  await requireApp("students.import");
  return (
    <div className="space-y-4">
      <PageTitle
        role="Students"
        title="Upload your student register"
        sub="Use the Excel or CSV file you already have. CampusOS finds the columns, groups brothers and sisters by the father's phone, and shows problems before saving anything."
      />
      <Importer />
    </div>
  );
}
