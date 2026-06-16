"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", icon: "\u2600\uFE0F", label: "Today" },
  { href: "/trends", icon: "\uD83D\uDCC8", label: "Trends" },
  { href: "/sleep", icon: "\uD83D\uDE34", label: "Sleep" },
  { href: "/train", icon: "\uD83C\uDFCB\uFE0F", label: "Train" },
  { href: "/more", icon: "\u2630", label: "More" },
];

export default function BottomNav() {
  const path = usePathname();
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
    </nav>
  );
}
