"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { logout } from "../lib/auth";

// StriveOS primary nav (Phase 0): Today / Train / Nutrition / Schedule / More.
// Nutrition + Schedule are promoted from the More menu; their routes stay at
// /more/nutrition and /more/schedule for now (clean URLs land with each tab's
// own migration). Trends + Sleep move into More.
const sw = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const ICONS: Record<string, ReactNode> = {
  today: (<svg viewBox="0 0 24 24" {...sw}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>),
  train: (<svg viewBox="0 0 24 24" {...sw}><path d="M6.5 6.5h11v11h-11z" transform="rotate(45 12 12)" /><path d="M2 12h3M19 12h3" /></svg>),
  nutrition: (<svg viewBox="0 0 24 24" {...sw}><path d="M12 8c0-3 2-5 5-5 0 3-2 5-5 5z" /><path d="M12 8C7 8 5 12 5 15a7 7 0 0 0 14 0c0-3-2-7-7-7z" /></svg>),
  schedule: (<svg viewBox="0 0 24 24" {...sw}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18" /><path d="M8 3v4M16 3v4" /></svg>),
  more: (<svg viewBox="0 0 24 24" {...sw}><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>),
};

const TABS = [
  { href: "/", key: "today", label: "Today" },
  { href: "/train", key: "train", label: "Train" },
  { href: "/more/nutrition", key: "nutrition", label: "Nutrition" },
  { href: "/more/schedule", key: "schedule", label: "Schedule" },
];

const MP_ICONS: Record<string, ReactNode> = {
  trends: (<svg viewBox="0 0 24 24" {...sw}><path d="M3 17l6-6 4 4 8-8" /><path d="M17 7h4v4" /></svg>),
  sleep: (<svg viewBox="0 0 24 24" {...sw}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>),
  medical: (<svg viewBox="0 0 24 24" {...sw}><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" /></svg>),
  mind: (<svg viewBox="0 0 24 24" {...sw}><path d="M20 4C9 4 4 9 4 15c0 3 2 5 5 5 6 0 11-5 11-16z" /><path d="M9 20c0-6 3-10 8-12" /></svg>),
  ask: (<svg viewBox="0 0 24 24" {...sw}><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M12 8v6M9 11h6" /></svg>),
  reminders: (<svg viewBox="0 0 24 24" {...sw}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>),
  profile: (<svg viewBox="0 0 24 24" {...sw}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>),
  logout: (<svg viewBox="0 0 24 24" {...sw}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>),
};

const MORE_SECTIONS = [
  {
    title: "Health",
    items: [
      { href: "/trends", key: "trends", label: "Trends" },
      { href: "/sleep", key: "sleep", label: "Sleep" },
      { href: "/more/medical", key: "medical", label: "Medical" },
      { href: "/more/mind", key: "mind", label: "Mind" },
    ],
  },
  {
    title: "Assistant",
    items: [
      { href: "/more/ask", key: "ask", label: "Ask Health AI" },
      { href: "/more/coach", key: "reminders", label: "Reminders & Memory" },
    ],
  },
];

export default function BottomNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

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

  const nutritionActive = path.startsWith("/more/nutrition");
  const scheduleActive = path.startsWith("/more/schedule");
  // "More" owns every /more/* route except the two promoted tabs.
  const moreActive = path.startsWith("/more") && !nutritionActive && !scheduleActive;

  function isActive(t: (typeof TABS)[number]): boolean {
    if (t.href === "/") return path === "/";
    if (t.href === "/more/nutrition") return nutritionActive;
    if (t.href === "/more/schedule") return scheduleActive;
    return path.startsWith(t.href);
  }

  return (
    <nav className="bottomnav">
      {TABS.map((t) => {
        const active = isActive(t);
        return (
          <Link key={t.label} href={t.href} className={active ? "nav active" : "nav"}>
            <span className="nav-icon">{ICONS[t.key]}</span>
            <span className="nav-label">{t.label}</span>
          </Link>
        );
      })}

      <div className="more-wrap" ref={wrapRef}>
        {open && (
          <div className="more-pop" role="menu">
            {MORE_SECTIONS.map((sec) => (
              <div key={sec.title} className="more-pop-group">
                <div className="more-sec-label">{sec.title}</div>
                {sec.items.map((it) => (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={path.startsWith(it.href) ? "more-pop-item active" : "more-pop-item"}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                  >
                    <span className="mp-icon">{MP_ICONS[it.key]}</span>
                    <span>{it.label}</span>
                  </Link>
                ))}
              </div>
            ))}
            <div className="more-pop-group">
              <div className="more-sec-label">Account</div>
              <Link
                href="/more/profile"
                className={path.startsWith("/more/profile") ? "more-pop-item active" : "more-pop-item"}
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                <span className="mp-icon">{MP_ICONS.profile}</span>
                <span>Profile</span>
              </Link>
              <button
                type="button"
                className="more-pop-item more-pop-logout"
                role="menuitem"
                onClick={() => { setOpen(false); logout(); }}
              >
                <span className="mp-icon">{MP_ICONS.logout}</span>
                <span>Log out</span>
              </button>
            </div>
          </div>
        )}
        <button
          type="button"
          className={moreActive || open ? "nav active" : "nav"}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="nav-icon">{ICONS.more}</span>
          <span className="nav-label">More</span>
        </button>
      </div>
    </nav>
  );
}
