import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { LoginScreen } from "@/components/login-screen";
import { currentUser, userCount } from "@/lib/auth";
import { StatusProvider } from "@/components/status-provider";
import { getStatus } from "@/lib/status";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DevLaunch",
  description: "Local developer command center.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await currentUser();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        {user ? (
          <StatusProvider initial={await getStatus(user)}>
            <AppShell>{children}</AppShell>
          </StatusProvider>
        ) : (
          <LoginScreen firstRun={userCount() === 0} />
        )}
      </body>
    </html>
  );
}
