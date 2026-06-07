import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from 'next-themes'
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import CookieBanner from "@/components/CookieBanner";
import SplashGate from "@/components/SplashGate";

export const metadata: Metadata = {
  title: "TimeWiseHub — Track Time. Control Costs. Grow Smarter.",
  description: "Track time, manage projects, and stay on top of deadlines.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TimeWiseHub",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="twh-theme">
          <ServiceWorkerRegistration />
          <SplashGate>
            {children}
            <CookieBanner />
          </SplashGate>
        </ThemeProvider>
      </body>
    </html>
  );
}
