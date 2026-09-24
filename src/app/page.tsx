import { redirect } from "next/navigation";

/** Home → Editing Mode. */
export default function HomePage() {
  redirect("/edit");
}
