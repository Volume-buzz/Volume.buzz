import { SignInPage } from "@/components/forms/auth-form";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  // If user is already authenticated, redirect to dashboard
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }

  return <SignInPage />;
}
