import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "../env";

type SupabaseCookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: SupabaseCookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }: SupabaseCookieToSet) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // ignored in contexts where cookies cannot be set
          }
        }
      }
    }
  );
}

export async function getSupabaseServerClient(): Promise<SupabaseClient> {
  return createSupabaseServerClient();
}

export function getSupabaseServiceRoleClient(): SupabaseClient {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for service role access.");
  }

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export async function getAuthenticatedUser(
  suppliedClient?: SupabaseClient
): Promise<User | null> {
  const supabase = suppliedClient ?? (await getSupabaseServerClient());
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return user;
}

export async function requireAuthenticatedUser(next = "/enquiries", suppliedClient?: SupabaseClient): Promise<User> {
  const user = await getAuthenticatedUser(suppliedClient);

  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }

  return user;
}
