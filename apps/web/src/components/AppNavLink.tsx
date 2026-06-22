"use client";

import { useEffect, useState, useTransition } from "react";
import type { MouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";

type AppNavLinkProps = {
  href: string;
  label: string;
  emoji?: string;
};

export function AppNavLink({ href, label, emoji }: AppNavLinkProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [clicked, setClicked] = useState(false);
  const isActive = pathname === href || (href !== "/dashboard" && pathname?.startsWith(`${href}/`));
  const showLoading = clicked && isPending;

  useEffect(() => {
    setClicked(false);
  }, [pathname]);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();

    if (pathname === href) {
      return;
    }

    setClicked(true);
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <a
      href={href}
      onClick={handleClick}
      onMouseEnter={() => router.prefetch(href)}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "11px 12px",
        borderRadius: 16,
        border: isActive ? "1px solid #b9c9ff" : "1px solid transparent",
        background: isActive ? "#eef4ff" : "transparent",
        color: isActive ? "#0b2b6f" : "#465468",
        fontWeight: isActive ? 900 : 750,
        textDecoration: "none",
        transition: "background 140ms ease, border-color 140ms ease, color 140ms ease"
      }}
      aria-busy={showLoading}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span
          aria-hidden="true"
          style={{
            width: 30,
            height: 30,
            borderRadius: 12,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: isActive ? "#dfe9ff" : "#f2f5f9",
            fontSize: 15,
            flex: "0 0 auto"
          }}
        >
          {emoji ?? "•"}
        </span>
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      </span>
      {showLoading ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "#2563eb",
            fontSize: 12,
            fontWeight: 900
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: "#2563eb",
              display: "inline-block"
            }}
          />
          Loading
        </span>
      ) : null}
    </a>
  );
}
