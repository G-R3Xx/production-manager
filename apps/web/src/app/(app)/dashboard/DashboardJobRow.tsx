"use client";

import { useRouter } from "next/navigation";
import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

export function DashboardJobRow({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);

  const open = (target: EventTarget | null) => {
    if (target instanceof HTMLElement && target.closest("a,button,input,select,textarea,label")) return;
    router.push(href);
  };

  return (
    <tr
      tabIndex={0}
      aria-label="Open job workspace"
      onClick={(event: MouseEvent<HTMLTableRowElement>) => open(event.target)}
      onKeyDown={(event: KeyboardEvent<HTMLTableRowElement>) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        open(event.target);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ borderBottom: "1px solid #e6ebf2", background: hovered ? "#f5f9ff" : "#fff", cursor: "pointer", outlineColor: "#155eef" }}
    >
      {children}
    </tr>
  );
}
