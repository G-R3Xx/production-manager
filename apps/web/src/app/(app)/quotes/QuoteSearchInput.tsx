"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const inputStyle = {
  width: "100%",
  minHeight: 38,
  height: 38,
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  padding: "0 38px 0 11px",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box" as const,
};

export function QuoteSearchInput({ initialValue = "" }: { initialValue?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const current = searchParams.get("q") ?? "";
      const nextValue = value.trim();
      if (current === nextValue) return;

      const next = new URLSearchParams(searchParams.toString());
      if (nextValue) next.set("q", nextValue);
      else next.delete("q");

      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, 280);

    return () => window.clearTimeout(timer);
  }, [pathname, router, searchParams, value]);

  return (
    <div style={{ position: "relative", minWidth: 0 }}>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search quotes…"
        aria-label="Search quotes"
        autoComplete="off"
        style={inputStyle}
      />
      {value ? (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="Clear quote search"
          title="Clear search"
          style={{
            position: "absolute",
            right: 7,
            top: "50%",
            transform: "translateY(-50%)",
            width: 27,
            height: 27,
            borderRadius: 8,
            border: 0,
            background: "transparent",
            color: "#64748b",
            fontSize: 18,
            lineHeight: 1,
            cursor: "pointer",
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
