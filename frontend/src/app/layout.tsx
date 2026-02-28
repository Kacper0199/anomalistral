import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { ClientProviders } from "@/components/providers/ClientProviders";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Anomalistral",
  description: "Autonomous Agentic MLOps Platform for Time-Series Anomaly Detection",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        <ClientProviders>{children}</ClientProviders>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
