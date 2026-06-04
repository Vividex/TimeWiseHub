import type { Metadata } from "next";
import "./globals.css";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import CookieBanner from "@/components/CookieBanner";

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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegistration />
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
