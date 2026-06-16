"use client";
import { Screen } from "../../components/Screen";
export default function AskPage() {
  return (
    <Screen title="Ask Health AI" back="/more">
      <div className="card nudge">💬 Natural-language Q&amp;A over all your health data — coming next. Ask things like “how did my sleep affect readiness this week?”</div>
    </Screen>
  );
}
