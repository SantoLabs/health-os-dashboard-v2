"use client";

import { ReactNode } from "react";

export function Screen({
  title,
  sub,
  error,
  loading,
  children,
}: {
  title: string;
  sub?: string;
  error?: string | null;
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="app">
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
