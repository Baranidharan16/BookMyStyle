import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionUser, homeFor } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getSessionUser();
  const { next } = await searchParams;
  if (user) redirect(next?.startsWith("/") && !next.startsWith("//") ? next : homeFor(user.role));
  return (
    <Suspense>
      <LoginForm showDemo={process.env.NODE_ENV !== "production" || process.env.SHOW_DEMO_ACCOUNTS === "true"} />
    </Suspense>
  );
}
