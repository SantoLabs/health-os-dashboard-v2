"use client";

import { useEffect, useState } from "react";
import { getStoredSession, consumeOAuthHash } from "../lib/auth";
import Login from "./Login";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    consumeOAuthHash();
    setAuthed(!!getStoredSession());
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!authed) return <Login onAuthed={() => setAuthed(true)} />;
  return <>{children}</>;
}
