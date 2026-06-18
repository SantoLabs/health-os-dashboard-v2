"use client";

import { useState } from "react";
import { loginPassword, loginGoogle } from "../lib/auth";

export default function Login({ onAuthed }: { onAuthed: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"" | "pw">("");
  const [err, setErr] = useState<string | null>(null);

  async function doPassword(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy("pw");
    try {
      await loginPassword(email.trim(), password);
      onAuthed();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign-in failed");
      setBusy("");
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">🏃 Health OS</div>
        <div className="subtle" style={{ marginBottom: 18 }}>Personal health, in one place.</div>

        <button type="button" className="btn btn-google" onClick={loginGoogle}>
          <span style={{ fontWeight: 700 }}>G</span> Continue with Google
        </button>

        <div className="login-divider"><span>or</span></div>

        <form onSubmit={doPassword}>
          <input
            className="field"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {err && <div className="login-err">{err}</div>}
          <button type="submit" className="btn btn-primary" disabled={busy !== ""}>
            {busy === "pw" ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
