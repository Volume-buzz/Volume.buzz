import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { SignInPage } from "@/components/forms/auth-form";

// Force dynamic rendering since we use cookies
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  // If user is already authenticated, redirect to dashboard
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }

  return <SignInPage />;
}
