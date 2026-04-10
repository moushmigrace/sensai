"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { ReactNode } from "react";

interface SessionProviderProps {
    children: ReactNode;
    /** From getServerSession — avoids initial client /api/auth/session round-trip. */
    session?: Session | null;
}

export function SessionProvider({ children, session }: SessionProviderProps) {
    return (
        <NextAuthSessionProvider session={session ?? undefined}>
            {children}
        </NextAuthSessionProvider>
    );
} 