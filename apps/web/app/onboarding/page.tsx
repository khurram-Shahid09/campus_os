import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth";
import { OnboardingForm } from "./form";

export const metadata = { title: "Create your school · CampusOS" };

export default async function Onboarding() {
  const s = await currentSession();
  if (!s) redirect("/login");
  if (s.school) redirect("/app");
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <p className="text-sm font-semibold text-brand">CampusOS</p>
      <h1 className="mt-1 text-2xl font-semibold">Create your school</h1>
      <p className="mt-1 text-sm text-muted">
        You will be the owner. Next you upload your student register (or add classes by hand), set fees, and invite your staff.
      </p>
      <OnboardingForm />
    </main>
  );
}
