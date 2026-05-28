import { signInWithGoogleAction, signInWithMagicLinkAction } from "./actions";

type SignInPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string
): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = (await searchParams) ?? {};
  const next = readParam(params, "next") || "/dashboard";
  const error = readParam(params, "error");
  const message = readParam(params, "message");

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f6f8fb" }}>
      <div style={{ width: "100%", maxWidth: 520, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 32, boxShadow: "0 10px 30px rgba(0,0,0,0.04)" }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>
          Production Manager
        </p>

        <h1 style={{ marginTop: 12, marginBottom: 12 }}>Sign in</h1>
        <p style={{ color: "#475467", lineHeight: 1.6 }}>
          Use Google or request a magic link. After sign-in you will be taken into the tenant-aware app shell.
        </p>

        {message ? <div style={{ marginTop: 16, padding: 12, borderRadius: 12, background: "#ecfdf3", border: "1px solid #abefc6", color: "#067647" }}>{message}</div> : null}
        {error ? <div style={{ marginTop: 16, padding: 12, borderRadius: 12, background: "#fff5f4", border: "1px solid #fda29b", color: "#b42318" }}>{error}</div> : null}

        <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
          <form action={signInWithGoogleAction} style={{ display: "grid", gap: 12 }}>
            <input type="hidden" name="next" value={next} />
            <button type="submit" style={{ minHeight: 46, borderRadius: 12, background: "#111827", color: "#fff", border: "none", fontWeight: 700, cursor: "pointer" }}>
              Continue with Google
            </button>
          </form>

          <form action={signInWithMagicLinkAction} style={{ display: "grid", gap: 12 }}>
            <input type="hidden" name="next" value={next} />
            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Email</span>
              <input type="email" name="email" required placeholder="you@company.com" style={{ minHeight: 46, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }} />
            </label>
            <button type="submit" style={{ minHeight: 46, borderRadius: 12, background: "#fff", color: "#111827", border: "1px solid #d0d5dd", fontWeight: 700, cursor: "pointer" }}>
              Send magic link
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
