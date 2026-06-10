import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OTTO 2.0 — AI Decision Engine",
  description: "Autonomous decision-making and execution engine powered by AI agents.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
