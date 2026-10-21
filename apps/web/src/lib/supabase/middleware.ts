import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "../env";

type SupabaseCookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

function isProtectedPath(pathname: string): boolean {
  return pathname.startsWith("/dashboard") || pathname.startsWith("/bootstrap") || pathname.startsWith("/company") || pathname.startsWith("/users");
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  // Server Actions authenticate again inside the action itself. Calling Supabase
  // Auth here as well makes every mutation pay for two sequential getUser()
  // requests before it can touch Postgres. Skip the duplicate middleware lookup
  // for Server Action POSTs; the action remains the security boundary.
  if (
    (request.headers.has("next-action") && request.nextUrl.pathname.startsWith("/quotes"))
    || request.nextUrl.pathname === "/api/quotes/line"
  ) {
    return NextResponse.next({ request });
  }

  const response = NextResponse.next({
    request
  });

  const env = getPublicEnv();

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: SupabaseCookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }: SupabaseCookieToSet) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        }
      }
    }
  );

  // Middleware is not an authorisation boundary; every protected page/API does
  // its own verified session check. Its job here is to keep the SSR cookies
  // fresh and provide friendly sign-in redirects. getSession() can read a fresh
  // token locally and only contacts Auth when a refresh is actually required,
  // whereas getUser() forces an Auth network round-trip on every navigation.
  const {
    data: { session }
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  if (!user && isProtectedPath(request.nextUrl.pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/sign-in";
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && request.nextUrl.pathname === "/sign-in") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
