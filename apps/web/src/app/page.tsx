import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";

export default async function HomePage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/sign-in?next=/enquiries");
  }

  redirect("/enquiries");
}
