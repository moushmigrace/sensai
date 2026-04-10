"use client";

import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";

/**
 * If OAuth succeeded but POST /auth/login failed on the first JWT pass, the session
 * can lack user.id. Calling update() re-runs the JWT callback so recovery can run.
 */
export default function SessionBackendUserRecovery() {
    const { data: session, status, update } = useSession();
    const ranForMissingId = useRef(false);

    useEffect(() => {
        if (status !== "authenticated") {
            ranForMissingId.current = false;
            return;
        }
        if (session?.user?.id) {
            ranForMissingId.current = false;
            return;
        }
        if (ranForMissingId.current) return;
        ranForMissingId.current = true;

        let cancelled = false;
        void update();
        const t = window.setTimeout(() => {
            if (!cancelled) void update();
        }, 2500);
        return () => {
            cancelled = true;
            window.clearTimeout(t);
        };
    }, [status, session?.user?.id, update]);

    return null;
}
