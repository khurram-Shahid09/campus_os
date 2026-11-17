import { redirect } from "next/navigation";
import { ROLE_LABEL } from "@campusos/core";
import { currentSession } from "@/lib/auth";
import { chooseSchoolAction, logoutAction } from "../login/actions";

export default async function ChooseSchool() {
  const s = await currentSession();
  if (!s) redirect("/login");
  if (!s.memberships.length) redirect("/onboarding");
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold">Choose a school</h1>
      <ul className="mt-6 space-y-2">
        {s.memberships.map((m) => (
          <li key={`${m.schoolId}-${m.role}`}>
            <form action={chooseSchoolAction.bind(null, m.schoolId)}>
              <button className="w-full rounded-xl border border-line bg-white px-4 py-3 text-left hover:bg-paper">
                <span className="font-semibold">{m.schoolName}</span> <span className="text-sm text-muted">· {ROLE_LABEL[m.role]}</span>
              </button>
            </form>
          </li>
        ))}
      </ul>
      <form action={logoutAction} className="mt-6"><button className="text-sm text-muted underline">Log out</button></form>
    </main>
  );
}
