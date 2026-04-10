"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { MessageCircle, ArrowLeft } from "lucide-react";
import type { HubThread, HubDetail } from "@/types/hub";
import { getThreadsForMilestone, getHubById } from "@/lib/hub-api";

export default function HubAnswerByIdPage() {
    const params = useParams<{
        id: string;
        courseId: string;
        hubId: string;
    }>();
    const { id: schoolId, courseId, hubId } = params;
    const hubIdNum = parseInt(hubId, 10);

    const [hub, setHub] = useState<HubDetail | null>(null);
    const [threads, setThreads] = useState<HubThread[]>([]);
    const [loading, setLoading] = useState(true);
    const [sort, setSort] = useState<"latest" | "top">("latest");

    const hubBase = `/school/${schoolId}/courses/${courseId}/hubs/${hubId}`;

    useEffect(() => {
        let c = false;
        (async () => {
            if (Number.isNaN(hubIdNum)) return;
            const h = await getHubById(hubIdNum);
            if (c) return;
            setHub(h);
        })();
        return () => {
            c = true;
        };
    }, [hubIdNum]);

    const loadThreads = useCallback(async () => {
        if (!hub?.milestone_id) return;
        setLoading(true);
        try {
            const data = await getThreadsForMilestone(hub.milestone_id, sort);
            setThreads(data);
        } finally {
            setLoading(false);
        }
    }, [hub?.milestone_id, sort]);

    useEffect(() => {
        if (hub) loadThreads();
    }, [hub, loadThreads]);

    const openThreads = threads.filter((t) => t.status === "open");

    if (hub === null && !Number.isNaN(hubIdNum)) {
        return (
            <div className="flex justify-center py-20">
                <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    if (!hub) {
        return (
            <p className="text-center text-gray-500 py-12">Hub not found.</p>
        );
    }

    return (
        <div className="space-y-6">
            <Link
                href={hubBase}
                className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
                <ArrowLeft size={14} />
                Back to module hub
            </Link>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Help others — answer for this module
                </h1>
                <div className="flex gap-2">
                    {(["latest", "top"] as const).map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => setSort(s)}
                            className={`px-3 py-1 text-xs rounded-full capitalize ${
                                sort === s
                                    ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200"
                                    : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
                            }`}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400">
                Open threads ({openThreads.length}) need attention. Pick a thread
                to read and reply.
            </p>

            {loading ? (
                <div className="space-y-3">
                    {[...Array(4)].map((_, i) => (
                        <div
                            key={i}
                            className="h-16 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"
                        />
                    ))}
                </div>
            ) : threads.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-sm py-8 text-center">
                    No threads in this module hub yet.
                </p>
            ) : (
                <ul className="space-y-2">
                    {threads.map((t) => (
                        <li key={t.id}>
                            <Link
                                href={`/school/${schoolId}/courses/${courseId}/hub/${hub.milestone_id}/t/${t.id}`}
                                className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 px-4 py-3 hover:border-emerald-400 dark:hover:border-emerald-600 transition-colors"
                            >
                                <MessageCircle
                                    className="shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400"
                                    size={18}
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium text-gray-900 dark:text-white truncate">
                                            {t.title}
                                        </span>
                                        <span
                                            className={`text-xs px-2 py-0.5 rounded-full ${
                                                t.status === "open"
                                                    ? "bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100"
                                                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
                                            }`}
                                        >
                                            {t.status}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                                        {t.content}
                                    </p>
                                </div>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
