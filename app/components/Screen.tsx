"use client";

import { ReactNode } from "react";
import Link from "next/link";

export function Screen({
  title,
  sub,
  error,
  loading,
  back,
  children,
}: {
  title: string;
  sub?: string;
  error?: string | null;
  loading?: boolean;
  back?: string;
  children?: ReactNode;
}) {
  return (
    <div className="app">
      {back && (
        <Link
          href={back}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--muted)", fontSize: 13, marginBottom: 10 }}
        >
          &lsaquo; Back
        </Link>
      )}
      <header className="topbar">
        <div>
          <div className="brand">{title}</div>
          {sub && <div className="subtle">{sub}</div>}
        </div>
        <div className="badge">v2 &middot; preview</div>
      </header>

      {loading && <div className="muted center pad">Loading&hellip;</div>}
      {error && (
        <div className="card error">
          <strong>Couldn&apos;t load data</strong>
          <div className="subtle">{error}</div>
        </div>
      )}
      {!loading && !error && children}
    </div>
  );
}
