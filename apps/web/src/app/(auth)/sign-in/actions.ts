"use server";

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicEnv } from "@/lib/env";

export async function signInWithGoogleAction(formData: FormData): Promise<void> {
  const next = String(formData.get("next") || "/enquiries");
  const supabase = await getSupabaseServerClient();
  const env = getPublicEnv();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(next)}`
    }
  });

  if (error || !data.url) {
    redirect(`/sign-in?error=${encodeURIComponent(error?.message ?? "Could not start Google sign-in.")}&next=${encodeURIComponent(next)}`);
  }

  redirect(data.url);
}

export async function signInWithMagicLinkAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") || "").trim();
  const next = String(formData.get("next") || "/enquiries");
  const supabase = await getSupabaseServerClient();
  const env = getPublicEnv();

  if (!email) {
    redirect(`/sign-in?error=${encodeURIComponent("Enter an email address.")}&next=${encodeURIComponent(next)}`);
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(next)}`
    }
  });

  if (error) {
    redirect(`/sign-in?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);
  }

  redirect(`/sign-in?message=${encodeURIComponent("Magic link sent. Check your email.")}&next=${encodeURIComponent(next)}`);
}
