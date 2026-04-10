"use client";

import { ArrowUp, CheckCircle } from "lucide-react";
import type { HubReply } from "@/types/hub";
import { upvoteReply } from "@/lib/hub-api";
import { useState } from "react";

interface ReplyCardProps {
    reply: HubReply;
    canVerify?: boolean;
    onVerify?: (replyId: number) => void;
}

export default function ReplyCard({ reply, canVerify, onVerify }: ReplyCardProps) {
    const [upvotes, setUpvotes] = useState(reply.upvote_count);

    const authorName = [reply.author.first_name, reply.author.last_name]
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

    const handleUpvote = async () => {
        setUpvotes((v) => v + 1);
        await upvoteReply(reply.thread_id, reply.id);
    };

    return (
        <div
            className={`flex gap-3 p-4 rounded-xl border transition-colors ${
                reply.is_verified
                    ? "border-green-300 dark:border-green-700/60 bg-green-50 dark:bg-green-900/10"
                    : "border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-900/60"
            }`}
        >
            {/* Upvote */}
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
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {reply.is_verified && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 dark:text-green-400">
                            <CheckCircle size={12} />
                            Verified answer
                        </span>
                    )}
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                        {authorName} · {timeAgo(reply.created_at)}
                    </span>

                    {canVerify && !reply.is_verified && onVerify && (
                        <button
                            onClick={() => onVerify(reply.id)}
                            className="ml-auto text-[11px] text-green-600 dark:text-green-400 hover:underline"
                        >
                            Mark as answer
                        </button>
                    )}
                </div>
                <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                    {reply.content}
                </p>
            </div>
        </div>
    );
}
