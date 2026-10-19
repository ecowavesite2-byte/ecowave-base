import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/guard";
import AdminShell from "../_components/AdminShell";
import TrimOnBlur from "../_components/TrimOnBlur";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false },
};

/**
 * Authoritative auth boundary for every /admin route in this group. Middleware
 * excludes /admin, so this server component is what redirects unauthenticated
 * visitors to /admin/login.
 */
export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin();
  return (
    <>
      {/* Normalize admin text fields when focus leaves them, never mid-typing. */}
      <TrimOnBlur />
      <AdminShell email={session.admin.email}>{children}</AdminShell>
    </>
  );
}
