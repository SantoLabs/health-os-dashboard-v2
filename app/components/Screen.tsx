"use client";

import { ReactNode } from "react";
import RefreshButton from "./RefreshButton";
import NotificationBell from "./NotificationBell";
import StriveMark from "./StriveMark";
import ThemeToggle from "./ThemeToggle";
import Loader from "./Loader";

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
          <StriveMark />
          <span className="strive-word">Strive<span className="os">OS</span></span>
        </div>
        <div className="topbar-actions">
          <ThemeToggle />
          <RefreshButton />
          <NotificationBell />
        </div>
      </header>

      {title && (
        <h1 className="page-title">
          {title}
          {sub ? <span className="page-sub"> · {sub}</span> : null}
        </h1>
      )}

      {loading && <Loader />}
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
