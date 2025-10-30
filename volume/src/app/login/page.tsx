import dynamic from "next/dynamic";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

// Force dynamic rendering since we use cookies
export const dynamic = 'force-dynamic';

// Remove ssr: false since we're in a Server Component
const SignInPage = dynamic(
  () => import("@/components/forms/auth-form").then((mod) => ({ default: mod.SignInPage }))
);

export default async function LoginPage() {
  // If user is already authenticated, redirect to dashboard
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }

  return <SignInPage />;
}
