import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

export const metadata = {
  title: { default: "에코웨이브", template: "%s | 에코웨이브" },
};

/**
 * Matches the original imweb viewport exactly. Capping the scale is required for
 * mobile parity: without `maximum-scale`/`user-scalable=no`, Chrome's mobile
 * emulation expands the layout viewport to the page's overflow width (591px at
 * a 390px device), which makes `window.innerWidth`/`innerHeight` report the
 * expanded box and renders fixed overlays (the image lightbox) wider than the
 * screen. The original pins the viewport at the device width.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

/** Latin display font used by the original menu/hero (Poppins first, Pretendard fallback). */
const poppins = Poppins({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-poppins",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning className={poppins.variable}>
      <body>{children}</body>
    </html>
  );
}
