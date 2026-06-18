"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logout } from "../lib/auth";

const TABS = [
  { href: "/", icon: "☀️", label: "Today" },
  { href: "/trends", icon: "📈", label: "Trends" },
  { href: "/sleep", icon: "😴", label: "Sleep" },
  { href: "/train", icon: "🏋️", label: "Train" },
];

const MORE_ITEMS = [
  { href: "/more/nutrition", icon: "🍽️", label: "Nutrition" },
  { href: "/more/goals", icon: "🏁", label: "Goals & Body" },
  { href: "/more/medical", icon: "🩺", label: "Medical" },
  { href: "/more/schedule", icon: "📅", label: "Schedule" },
  { href: "/more/ask", icon: "💬", label: "Ask Health AI" },
  { href: "/more/mind", icon: "🧘", label: "Mind" },
  { href: "/more/profile", icon: "⚙️", label: "Profile" },
];

export default function BottomNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const hoverCapable = useRef(false);

  useEffect(() => {
    hoverCapable.current =
      typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches;
  }, []);

  // close when the route changes
  useEffect(() => { setOpen(false); }, [path]);

  // tap outside to close (touch / no-hover devices)
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const moreActive = path.startsWith("/more");

  return (
    <nav className="bottomnav">
      {TABS.map((t) => {
        const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
        return (
          <Link key={t.label} href={t.href} className={active ? "nav active" : "nav"}>
            <span className="nav-icon">{t.icon}</span>
            <span className="nav-label">{t.label}</span>
          </Link>
        );
      })}

      <div
        className="more-wrap"
        ref={wrapRef}
        onMouseEnter={() => { if (hoverCapable.current) setOpen(true); }}
        onMouseLeave={() => { if (hoverCapable.current) setOpen(false); }}
      >
        {open && (
          <div className="more-pop" role="menu">
            {MORE_ITEMS.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="more-pop-item"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                <span className="mp-icon">{it.icon}</span>
                <span>{it.label}</span>
              </Link>
            ))}
            <div className="more-pop-sep" />
            <button
              type="button"
              className="more-pop-item more-pop-logout"
              role="menuitem"
              onClick={() => { setOpen(false); logout(); }}
            >
              <span className="mp-icon">🚪</span>
              <span>Log out</span>
            </button>
          </div>
        )}
        <button
          type="button"
          className={moreActive || open ? "nav active" : "nav"}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="nav-icon">☰</span>
          <span className="nav-label">More</span>
        </button>
      </div>
    </nav>
  );
}
