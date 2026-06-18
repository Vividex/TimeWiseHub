import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from 'next-themes'
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import CookieBanner from "@/components/CookieBanner";
import SplashGate from "@/components/SplashGate";
import NavHistoryProvider from "@/components/NavHistoryProvider";
import BackButton from "@/components/BackButton";

export const metadata: Metadata = {
  title: "TimeWiseHub — Track Time. Control Costs. Grow Smarter.",
  description: "Track time, manage projects, and stay on top of deadlines.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TimeWiseHub",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning style={{ backgroundColor: '#020617' }}>
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="twh-theme">
          <ServiceWorkerRegistration />
          <NavHistoryProvider>
            <BackButton />
            <SplashGate>
              {children}
              <CookieBanner />
            </SplashGate>
          </NavHistoryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
