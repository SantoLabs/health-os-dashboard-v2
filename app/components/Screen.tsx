"use client";

import { ReactNode } from "react";
import RefreshButton from "./RefreshButton";
import NotificationBell from "./NotificationBell";

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
  back?: string; // accepted for backward-compat; intentionally not rendered
  children?: ReactNode;
}) {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-wrap">
          <span className="brand-logo" aria-hidden>🏃</span>
          <span className="brand">Health OS</span>
        </div>
        <NotificationBell />
        <RefreshButton />
      </header>

      {title && (
        <h1 className="page-title">
          {title}
          {sub ? <span className="page-sub"> · {sub}</span> : null}
        </h1>
      )}

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
