"use client";
import Icon, { type IconName } from "../components/Icon";

import Link from "next/link";
import { Screen } from "../components/Screen";
import { logout } from "../lib/auth";

// More menu, grouped (7a): Health · Coach · Account. Nutrition + Schedule stay
// in the primary bottom nav, so they're intentionally absent here.
const SECTIONS: { title: string; items: { href: string; icon: IconName; label: string; desc: string }[] }[] = [
  {
    title: "Health",
    items: [
      { href: "/trends", icon: "chart", label: "Trends", desc: "Long-term charts" },
      { href: "/sleep", icon: "sleep", label: "Sleep", desc: "Recovery & rest" },
      { href: "/more/body", icon: "heart", label: "Body", desc: "Weight, body fat & lean mass" },
      { href: "/more/medical", icon: "medical", label: "Medical", desc: "Bloodwork & markers" },
      { href: "/more/mind", icon: "yoga", label: "Mind", desc: "Meditation & focus" },
    ],
  },
  {
    title: "Coach",
    items: [
      { href: "/more/ask", icon: "chat", label: "Ask Kai", desc: "Chat with your data" },
      { href: "/more/goals", icon: "flag", label: "Goals", desc: "Targets & milestones" },
      { href: "/more/coach", icon: "bell", label: "Memory & Reminders", desc: "Kai check-ins & what it knows" },
    ],
  },
];

function Row({ href, icon, label, desc }: { href: string; icon: IconName; label: string; desc: string }) {
  return (
    <Link href={href} className="card menu-row" style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 0, padding: "16px" }}>
      <span style={{ display: "inline-flex", color: "var(--muted)" }}><Icon name={icon} size={21} /></span>
      <span style={{ flex: 1 }}>
        <span style={{ display: "block", fontWeight: 600, fontSize: 15 }}>{label}</span>
        <span className="subtle tiny">{desc}</span>
      </span>
      <span className="subtle" style={{ fontSize: 22, lineHeight: 1 }}>&rsaquo;</span>
    </Link>
  );
}

export default function MorePage() {
  return (
    <Screen title="More">
      {SECTIONS.map((sec) => (
        <div key={sec.title}>
          <div className="eyebrow">{sec.title}</div>
          <section className="list" style={{ marginBottom: 18 }}>
            {sec.items.map((it) => <Row key={it.label} {...it} />)}
          </section>
        </div>
      ))}

      <div className="eyebrow">Account</div>
      <section className="list">
        <Row href="/more/profile" icon="gear" label="Profile" desc="Targets & settings" />
      </section>
      <button type="button" className="btn btn-ghost" style={{ marginTop: 16 }} onClick={logout}>
        Log out
      </button>
    </Screen>
  );
}
