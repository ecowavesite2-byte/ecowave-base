"use client";

import { useEffect } from "react";

/** Sets <html lang> per locale (root layout is locale-agnostic). */
export default function HtmlLang({ lang }: { lang: string }) {
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return null;
}
