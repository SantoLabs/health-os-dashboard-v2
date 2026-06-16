"use client";

import Link from "next/link";
import { Screen } from "../components/Screen";

const ITEMS = [
  { href: "/more/nutrition", icon: "🍽️", label: "Nutrition", desc: "Daily fuel targets" },
  { href: "/more/goals", icon: "🏁", label: "Goals & Body", desc: "Body comp & milestones" },
  { href: "/more/medical", icon: "🩺", label: "Medical", desc: "Bloodwork & markers" },
  { href: "/more/schedule", icon: "📅", label: "Schedule", desc: "Training & events" },
  { href: "/more/ask", icon: "💬", label: "Ask Health AI", desc: "Chat with your data" },
];

export default function MorePage() {
  return (
    <Screen title="More">
      <section className="list">
        {ITEMS.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="card menu-row"
            style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 0, padding: "16px" }}
          >
            <span style={{ fontSize: 22 }}>{it.icon}</span>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontWeight: 600, fontSize: 15 }}>{it.label}</span>
              <span className="subtle tiny">{it.desc}</span>
            </span>
            <span className="subtle" style={{ fontSize: 22, lineHeight: 1 }}>&rsaquo;</span>
          </Link>
        ))}
      </section>
    </Screen>
  );
}
