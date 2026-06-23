import type { Metadata } from "next";
import { ReactNode, Suspense } from "react";
import { RouteTransitionOverlay } from "@/components/RouteTransitionOverlay";

export const metadata: Metadata = {
  title: "Production Manager",
  description: "Production Manager SaaS platform",
  icons: {
    icon: "/brand/production-manager-icon.svg",
    shortcut: "/brand/production-manager-icon.svg",
    apple: "/brand/production-manager-icon.svg"
  }
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          background: "#f3f6fb",
          color: "#111827",
          WebkitFontSmoothing: "antialiased"
        }}
      >
        <Suspense fallback={null}>
          <RouteTransitionOverlay />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
