"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (retryAfter <= 0) return;
    const id = setInterval(() => {
      setRetryAfter((s) => {
        if (s <= 1) {
          clearInterval(id);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [retryAfter]);

  async function signIn() {
    setLoading(true);
    setError(null);

    const result = await authClient.signIn.oauth2({
      providerId: "trakt",
      callbackURL: "/",
    });

    if (result?.error) {
      const msg = result.error.message ?? "";
      const match = msg.match(/rate_limited:(\d+)/);
      if (match) {
        const seconds = parseInt(match[1], 10);
        setRetryAfter(seconds);
        setError("Trakt is rate limiting sign-ins.");
      } else {
        setError("Sign-in failed. Please try again.");
      }
      setLoading(false);
    }
  }

  const disabled = loading || retryAfter > 0;

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-8 px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white">RePletra</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Sign in to access your Trakt watchlist and activity
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={signIn}
            disabled={disabled}
            className="flex w-full cursor-pointer items-center justify-center gap-3 rounded-lg bg-[#9810fa] px-4 py-3 font-medium text-white transition-colors hover:bg-[#8a0ee0] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
            {loading
              ? "Signing in…"
              : retryAfter > 0
                ? "Try again in " + retryAfter + "s"
                : "Sign in with Trakt"}
          </button>

          {error && <p className="text-center text-sm text-red-400">{error}</p>}
        </div>

        <p className="text-center text-[11px] leading-relaxed text-zinc-600">
          Your Trakt session is stored in Better Auth managed encrypted cookies.
          <br />
          No passwords are saved in any database.
        </p>
      </div>
    </div>
  );
}
