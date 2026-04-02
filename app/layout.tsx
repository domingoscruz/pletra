import type { Metadata } from "next";
import localFont from "next/font/local";
import { Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { FloatingNav } from "@/components/nav/floating-nav";
import { SearchPalette } from "@/components/search/search-palette";
import { WatchingToast } from "@/components/dashboard/watching-toast";
import { WatchingProvider } from "@/lib/use-watching";
import "./globals.css";

const tasaOrbiter = localFont({
  src: "./fonts/TASAOrbiterVF.woff2",
  variable: "--font-tasa-orbiter",
  display: "swap",
  weight: "100 900",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pletra",
  description: "Track your movies and shows",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${tasaOrbiter.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Providers>
          {/*
            WatchingProvider wraps global navigation and notification components
            to handle UI collisions on responsive views.
          */}
          <WatchingProvider>
            <main className="flex-1 pb-20">{children}</main>
            <FloatingNav />
            <SearchPalette />
            <WatchingToast />
          </WatchingProvider>
        </Providers>
      </body>
    </html>
  );
}
