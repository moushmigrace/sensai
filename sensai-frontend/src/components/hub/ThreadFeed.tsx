"use client";

import { useState, useEffect, useCallback } from "react";
import { MessageSquarePlus, RefreshCw } from "lucide-react";
import type { HubThread } from "@/types/hub";
import { getThreadsForMilestone } from "@/lib/hub-api";
import ThreadCard from "./ThreadCard";
import Link from "next/link";

interface ThreadFeedProps {
    milestoneId: number;
    milestoneTitle: string;
    schoolId: string;
    courseId: string;
}

export default function ThreadFeed({
    milestoneId,
    milestoneTitle,
    schoolId,
    courseId,
}: ThreadFeedProps) {
    const [threads, setThreads] = useState<HubThread[]>([]);
    const [sort, setSort] = useState<"latest" | "top">("latest");
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(
        async (showSpinner = false) => {
            if (showSpinner) setRefreshing(true);
            try {
                const data = await getThreadsForMilestone(milestoneId, sort);
                setThreads(data);
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [milestoneId, sort],
    );

    useEffect(() => {
        setLoading(true);
        load();
    }, [load]);

    // Short-poll every 30 s for new threads
    useEffect(() => {
        const id = setInterval(() => load(), 30_000);
        return () => clearInterval(id);
    }, [load]);

    const askHref = `/school/${schoolId}/courses/${courseId}/hub/${milestoneId}/ask`;

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {milestoneTitle} — Discuss
                </h2>
                <Link
                    href={askHref}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                >
                    <MessageSquarePlus size={14} />
                    Ask a question
                </Link>
            </div>

            {/* Sort tabs */}
            <div className="flex items-center gap-2">
                {(["latest", "top"] as const).map((s) => (
                    <button
                        key={s}
                        onClick={() => setSort(s)}
                        className={`px-3 py-1 text-sm rounded-full capitalize transition-colors ${
                            sort === s
                                ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-medium"
                                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                        }`}
                    >
                        {s}
                    </button>
                ))}
                <button
                    onClick={() => load(true)}
                    className="ml-auto p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                    aria-label="Refresh"
                >
                    <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                </button>
            </div>

            {/* Thread list */}
            {loading ? (
                <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                        <div
                            key={i}
                            className="h-20 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"
                        />
                    ))}
                </div>
            ) : threads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <MessageSquarePlus size={40} className="text-gray-300 dark:text-gray-600 mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                        No discussions yet.
                    </p>
                    <Link
                        href={askHref}
                        className="mt-3 text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                        Be the first to ask a question
                    </Link>
                </div>
            ) : (
                <div className="space-y-2">
                    {threads.map((t) => (
                        <ThreadCard
                            key={t.id}
                            thread={t}
                            schoolId={schoolId}
                            courseId={courseId}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
