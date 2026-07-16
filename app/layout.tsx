import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import "./auth.css";
import BottomNav from "./components/BottomNav";
import AuthGate from "./components/AuthGate";
import KaiFab from "./components/KaiFab";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "StriveOS",
  description: "Personal training, in one place.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf6f1" },
    { media: "(prefers-color-scheme: dark)", color: "#201a15" },
  ],
};

// Resolve the theme before first paint to avoid a flash. Order: explicit stored
// choice → system preference → dark fallback.
const themeBootstrap = `(function(){try{
var s=localStorage.getItem('strive-theme');
var t=(s==='light'||s==='dark')?s:((window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark');
document.documentElement.setAttribute('data-theme',t);
}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <AuthGate>
          {children}
          <BottomNav />
          <KaiFab />
        </AuthGate>
      </body>
    </html>
  );
}
