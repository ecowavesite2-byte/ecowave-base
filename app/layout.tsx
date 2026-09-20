import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

export const metadata = {
  title: { default: "에코웨이브", template: "%s | 에코웨이브" },
};

/** Latin display font used by the original menu/hero (Poppins first, Pretendard fallback). */
const poppins = Poppins({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-poppins",
});

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning className={poppins.variable}>
      <body>{children}</body>
    </html>
  );
}
