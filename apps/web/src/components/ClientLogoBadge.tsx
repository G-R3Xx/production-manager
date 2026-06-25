import type { CSSProperties } from "react";

type ClientLogoBadgeProps = {
  logoUrl?: string | null;
  name: string;
  size?: number;
  radius?: number;
  padding?: number;
  style?: CSSProperties;
};

function initialsForName(name: string): string {
  const words = name
    .replace(/[^a-z0-9\s&-]/gi, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

export function ClientLogoBadge({ logoUrl, name, size = 48, radius = 14, padding = 4, style }: ClientLogoBadgeProps) {
  const baseStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    border: "1px solid #e5e7eb",
    background: "#fff",
    flex: "0 0 auto",
    boxSizing: "border-box",
    ...style
  };

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${name || "Client"} logo`}
        style={{
          ...baseStyle,
          objectFit: "contain",
          padding
        }}
      />
    );
  }

  return (
    <span
      aria-label={`${name || "Client"} initials`}
      title={name || "Client"}
      style={{
        ...baseStyle,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#475467",
        background: "linear-gradient(135deg,#ffffff,#f2f4f7)",
        fontWeight: 950,
        fontSize: Math.max(12, Math.round(size * 0.34)),
        letterSpacing: "-0.06em"
      }}
    >
      {initialsForName(name)}
    </span>
  );
}
