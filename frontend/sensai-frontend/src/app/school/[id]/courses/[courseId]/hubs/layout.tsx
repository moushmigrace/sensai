import type { ReactNode } from "react";

export default function HubsLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-white">
            <div className="max-w-3xl mx-auto px-4 py-8">{children}</div>
        </div>
    );
}
