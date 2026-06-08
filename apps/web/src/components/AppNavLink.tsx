"use client";

import { useEffect, useState, useTransition } from "react";
import type { MouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";

type AppNavLinkProps = {
  href: string;
  label: string;
};

export function AppNavLink({ href, label }: AppNavLinkProps) {
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
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "12px 14px",
        borderRadius: 12,
        border: isActive ? "1px solid #4f46e5" : "1px solid #e5e7eb",
        background: isActive ? "#eef2ff" : "#fafafa",
        color: "#111827",
        fontWeight: 700,
        textDecoration: "none",
        transition: "background 140ms ease, border-color 140ms ease, transform 140ms ease"
      }}
      aria-busy={showLoading}
    >
      <span>{label}</span>
      {showLoading ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "#4f46e5",
            fontSize: 12,
            fontWeight: 800
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: "#4f46e5",
              display: "inline-block"
            }}
          />
          Loading
        </span>
      ) : null}
    </a>
  );
}
