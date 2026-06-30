import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPublicEnv } from "@/lib/env";
import { ACTIVE_TENANT_COOKIE } from "@/server/bootstrap/constants";
import { ensureDomainAutoJoinForAuthUser } from "@/server/auth/domainJoin";

type SupabaseCookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/enquiries";
  const env = getPublicEnv();

  if (!code) {
    return NextResponse.redirect(new URL(`/sign-in?error=${encodeURIComponent("Missing auth code.")}`, url.origin));
  }

  const cookieStore = await cookies();
  const response = NextResponse.redirect(new URL(next, url.origin));

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: SupabaseCookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }: SupabaseCookieToSet) => {
            cookieStore.set(name, value, options);
            response.cookies.set(name, value, options);
          });
        }
      }
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/sign-in?error=${encodeURIComponent(error.message)}`, url.origin)
    );
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user?.id && user.email) {
    const fullName =
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : typeof user.user_metadata?.name === "string"
          ? user.user_metadata.name
          : null;

    const autoJoinResult = await ensureDomainAutoJoinForAuthUser({
      authUserId: user.id,
      email: user.email,
      fullName
    });

    if (autoJoinResult.status === "joined" || autoJoinResult.status === "already_member") {
      response.cookies.set(ACTIVE_TENANT_COOKIE, autoJoinResult.tenantId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30
      });
    } else if (autoJoinResult.status === "inactive_member") {
      const label = autoJoinResult.membershipStatus === "disabled" ? "disabled" : "pending approval";
      response.headers.set(
        "Location",
        new URL(`/bootstrap?error=${encodeURIComponent(`Your ${autoJoinResult.tenantName} access is ${label}. Ask a manager to update Staff & roles.`)}`, url.origin).toString()
      );
    }
  }

  return response;
}
