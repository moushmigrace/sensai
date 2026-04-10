"use client";

import { CheckCircle, MessageSquare, Sparkles, X } from "lucide-react";
import Link from "next/link";
import type { HubThread } from "@/types/hub";

interface RelatedDiscussionsProps {
    threads: HubThread[];
    schoolId: string;
    courseId: string;
    onDismiss: () => void;
}

export default function RelatedDiscussions({
    threads,
    schoolId,
    courseId,
    onDismiss,
}: RelatedDiscussionsProps) {
    if (threads.length === 0) return null;

    return (
        <div className="border-t border-gray-200 dark:border-[#2a2a2a] bg-gray-50 dark:bg-[#161616] px-4 py-3">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
                    <Sparkles size={13} className="text-indigo-500 dark:text-indigo-400" />
                    Related Discussions
                </div>
                <button
                    onClick={onDismiss}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    aria-label="Dismiss suggestions"
                >
                    <X size={14} />
                </button>
            </div>

            {/* Thread list */}
            <ul className="space-y-1.5">
                {threads.map((thread) => {
                    const href = `/school/${schoolId}/courses/${courseId}/hub/${thread.milestone_id}/t/${thread.id}`;
                    return (
                        <li key={thread.id}>
                            <Link
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-2 rounded-lg px-2.5 py-2 hover:bg-gray-100 dark:hover:bg-[#222222] transition-colors group"
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-gray-800 dark:text-gray-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-1">
                                        {thread.title}
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 line-clamp-1">
                                        {thread.content}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                                    {thread.has_verified_reply && (
                                        <CheckCircle
                                            size={12}
                                            className="text-emerald-500"
                                            aria-label="Has verified answer"
                                        />
                                    )}
                                    <span className="flex items-center gap-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                                        <MessageSquare size={11} />
                                        {thread.reply_count}
                                    </span>
                                </div>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
