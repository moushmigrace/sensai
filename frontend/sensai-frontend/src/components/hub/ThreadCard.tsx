"use client";

import { ArrowUp, MessageSquare, CheckCircle, Pin } from "lucide-react";
import type { HubThread } from "@/types/hub";
import { upvoteThread } from "@/lib/hub-api";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface ThreadCardProps {
    thread: HubThread;
    schoolId: string;
    courseId: string;
}

export default function ThreadCard({ thread, schoolId, courseId }: ThreadCardProps) {
    const router = useRouter();
    const [upvotes, setUpvotes] = useState(thread.upvote_count);

    const authorName = [thread.author.first_name, thread.author.last_name]
        .filter(Boolean)
        .join(" ");

    const timeAgo = (iso: string) => {
        const diff = Date.now() - new Date(iso).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        return `${Math.floor(hrs / 24)}d ago`;
    };

    const handleUpvote = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setUpvotes((v) => v + 1);
        await upvoteThread(thread.id);
    };

    const href = `/school/${schoolId}/courses/${courseId}/hub/${thread.milestone_id}/t/${thread.id}`;

    return (
        <div
            className="group flex gap-3 p-4 rounded-xl bg-white dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 cursor-pointer transition-all"
            onClick={() => router.push(href)}
        >
            {/* Upvote column */}
            <button
                onClick={handleUpvote}
                className="flex flex-col items-center gap-0.5 text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors min-w-[32px]"
                aria-label="Upvote"
            >
                <ArrowUp size={16} />
                <span className="text-xs font-medium">{upvotes}</span>
            </button>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2 flex-wrap">
                    {thread.is_pinned && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
                            <Pin size={10} />
                            Pinned
                        </span>
                    )}
                    {thread.status === "resolved" && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">
                            <CheckCircle size={10} />
                            Resolved
                        </span>
                    )}
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-1">
                        {thread.title}
                    </h3>
                </div>

                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                    {thread.content}
                </p>

                <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-400 dark:text-gray-500">
                    <span>{authorName}</span>
                    <span>·</span>
                    <span>{timeAgo(thread.created_at)}</span>
                    <span className="ml-auto flex items-center gap-1">
                        <MessageSquare size={11} />
                        {thread.reply_count}
                    </span>
                </div>
            </div>
        </div>
    );
}
