"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import LogoutButton from "./LogoutButton";

const NAV = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/pages", label: "Pages" },
  { href: "/admin/boards", label: "Boards" },
  { href: "/admin/media", label: "Media" },
  { href: "/admin/site", label: "Site strings" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminShell({ email, children }: { email: string; children: ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex min-h-screen bg-[#f4f5f7] text-ink">
      <aside className="flex w-[248px] shrink-0 flex-col border-r border-line bg-white">
        <div className="px-5 pt-6 pb-4">
          <Link href="/admin" className="text-[18px] font-bold tracking-tight text-ink">
            ECOWAVE<span className="text-accent">.</span>
          </Link>
          <p className="mt-0.5 text-[12px] text-[#6b7280]">Content manager</p>
        </div>

        <nav aria-label="Admin" className="flex-1 space-y-1 px-3 py-2">
          {NAV.map((item) => {
            const active = isActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`block rounded-md px-3 py-2 text-[14px] transition-colors ${
                  active
                    ? "bg-accent/10 font-medium text-accent"
                    : "text-ink hover:bg-[#f4f5f7] hover:text-accent"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-line px-5 py-4">
          <Link
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] text-[#6b7280] transition-colors hover:text-accent"
          >
            View site ↗
          </Link>
          <p className="mt-3 truncate text-[12px] text-[#6b7280]" title={email}>
            {email}
          </p>
          <LogoutButton />
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
