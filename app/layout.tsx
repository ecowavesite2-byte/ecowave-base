import type { Metadata } from "next";
import "./globals.css";

export const metadata = {
  title: { default: "에코웨이브", template: "%s | 에코웨이브" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
