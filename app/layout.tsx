import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./auth.css";
import BottomNav from "./components/BottomNav";
import AuthGate from "./components/AuthGate";
import KaiFab from "./components/KaiFab";

export const metadata: Metadata = {
  title: "Health OS",
  description: "Personal health, in one place.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0b0f17",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthGate>
          {children}
          <BottomNav />
          <KaiFab />
        </AuthGate>
      </body>
    </html>
  );
}
