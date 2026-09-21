"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Inline sign-out control for the admin header. Labels come from the shared
 * admin dictionary (see `lib/admin/i18n.ts`).
 */
export default function LogoutButton({ label, busyLabel }: { label: string; busyLabel: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onLogout() {
    if (busy) return;
    setBusy(true);

    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      // Navigate to the login page regardless; the session cookie is cleared
      // server-side on the next successful request.
    }

    router.push("/admin/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onLogout}
      disabled={busy}
      className="h-[32px] rounded-[3px] border border-black/10 bg-white px-3 text-[13px] text-ink transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? busyLabel : label}
    </button>
  );
}
