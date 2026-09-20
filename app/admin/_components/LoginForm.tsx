"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const inputCls =
  "h-10 w-full rounded-md border border-line bg-white px-3 text-[14px] text-ink outline-none transition-colors placeholder:text-[#9ca3af] focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-60";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        // Keep the form disabled while navigation completes.
        router.push("/admin");
        router.refresh();
        return;
      }

      if (res.status === 401) {
        setError("Incorrect email or password.");
      } else if (res.status === 429) {
        setError("Too many failed attempts. Please try again later.");
      } else {
        setError("Sign in failed. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    }

    setSubmitting(false);
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <div>
        <label htmlFor="admin-email" className="mb-1 block text-[13px] font-medium text-ink">
          Email
        </label>
        <input
          id="admin-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="admin-password" className="mb-1 block text-[13px] font-medium text-ink">
          Password
        </label>
        <input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
          className={inputCls}
        />
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-[#dc2626]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="h-10 w-full rounded-md bg-accent text-[14px] font-medium text-white transition-colors hover:bg-[#2f5ac7] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
