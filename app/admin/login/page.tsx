"use client";

import { useState } from "react";
import { BRAND } from "@/lib/config";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Login failed.");
        setSubmitting(false);
        return;
      }
      // A full navigation (not router.push) so the server re-reads cookies
      // from scratch — Next's client-side router cache can otherwise still
      // serve the "not logged in" version of /admin from just before you
      // signed in, even though the new session cookie is already set.
      window.location.href = "/admin";
    } catch {
      setError("Network error — please check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="font-display text-2xl font-semibold" style={{ color: BRAND.colors.dark }}>
        Admin sign in
      </h1>
      <p className="mt-1 text-sm text-stone-500">{BRAND.name} order dashboard</p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <input
          type="password"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Admin password"
          className="w-full rounded-lg border px-3 py-2.5"
          style={{ borderColor: BRAND.colors.light }}
        />
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: BRAND.colors.accent }}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
