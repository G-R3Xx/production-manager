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

  // Prefer cryptographically verified JWT claims. With current Supabase Auth this
  // avoids a network round-trip to /auth/v1/user on every server mutation while
  // still verifying the signed access token. Older/legacy projects fall back to
  // getUser() below if getClaims is unavailable or cannot verify the token locally.
  try {
    type ClaimsResult = {
      data?: { claims?: Record<string, unknown> | null } | null;
      error?: unknown;
    };
    const authWithClaims = supabase.auth as unknown as {
      getClaims?: () => Promise<ClaimsResult>;
    };
    if (typeof authWithClaims.getClaims === "function") {
      const { data, error } = await authWithClaims.getClaims();
      const claims = data?.claims ?? null;
      const id = typeof claims?.sub === "string" ? claims.sub : "";
      if (!error && id) {
        return {
          id,
          email: typeof claims?.email === "string" ? claims.email : null
        };
      }
    }
  } catch {
    // Fall through to the authoritative Auth user lookup.
  }

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
    redirect("/sign-in?next=/enquiries");
  }

  return user;
}

export async function getAuthenticatedAppUser(): Promise<SessionUser | null> {
  return getSessionUser();
}

export async function requireAuthenticatedAppUser(): Promise<SessionUser> {
  return getRequiredSessionUser();
}
