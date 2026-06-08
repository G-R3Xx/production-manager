import { cache } from "react";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type SessionUser = {
  id: string;
  email: string | null;
};

export type SessionSummary = {
  user: SessionUser | null;
};

export const getSessionUser = cache(async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? null
  };
});

export async function getSessionSummary(): Promise<SessionSummary> {
  return {
    user: await getSessionUser()
  };
}

export async function getRequiredSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();

  if (!user) {
    redirect("/sign-in");
  }

  return user;
}

export async function getAuthenticatedAppUser(): Promise<SessionUser | null> {
  return getSessionUser();
}

export async function requireAuthenticatedAppUser(): Promise<SessionUser> {
  return getRequiredSessionUser();
}
