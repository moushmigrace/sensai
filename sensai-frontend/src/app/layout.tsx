import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getServerSession } from "next-auth/next";
import "./globals.css";
import { SessionProvider } from "@/providers/SessionProvider";
import SessionBackendUserRecovery from "@/components/SessionBackendUserRecovery";
import { IntegrationProvider } from "@/context/IntegrationContext";
import { authOptions } from "@/lib/auth-options";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
  fallback: ["system-ui", "arial"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  fallback: ["system-ui", "arial"],
});

export const metadata: Metadata = {
  title: {
    default: "SensAI",
    template: "%s · SensAI",
  },
  description: "The only LMS you need in the era of AI",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased font-sans text-base`}
      >
        <SessionProvider session={session}>
          <SessionBackendUserRecovery />
          <IntegrationProvider>
            {children}
          </IntegrationProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
