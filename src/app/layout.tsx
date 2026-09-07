import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { LoginScreen } from "@/components/login-screen";
import { Pwa } from "@/components/pwa";
import { currentUser, userCount } from "@/lib/auth";
import { StatusProvider } from "@/components/status-provider";
import { getStatus } from "@/lib/status";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DevLaunch",
  description: "Local developer command center.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "DevLaunch" },
  icons: { apple: "/icons/icon-180.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0b0b0d",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await currentUser();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body>
        <script
          // Apply the saved theme before paint so the light theme does not flash dark.
          dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem('devlaunch:theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}` }}
        />
        <Pwa />
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
