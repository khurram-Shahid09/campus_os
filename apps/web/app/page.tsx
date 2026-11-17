import { redirect } from "next/navigation";

/** The working app. The sales demo stays at /demo. */
export default function Home() {
  redirect("/app");
}
