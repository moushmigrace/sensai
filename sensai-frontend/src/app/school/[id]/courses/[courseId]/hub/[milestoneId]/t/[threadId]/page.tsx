"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowUp, CheckCircle, Send, BarChart2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
    getThread,
    createReply,
    upvoteThread,
    resolveThread,
    verifyReply,
    openReplyStream,
    getPollResults,
} from "@/lib/hub-api";
import type { HubThreadDetail, HubReply, PollResult } from "@/types/hub";
import ReplyCard from "@/components/hub/ReplyCard";
import PollView from "@/components/hub/PollView";

export default function ThreadDetailPage() {
    const params = useParams<{
        id: string;
        courseId: string;
        milestoneId: string;
        threadId: string;
    }>();
    const router = useRouter();
    const { user } = useAuth();

    const threadId = parseInt(params.threadId);
    const [thread, setThread] = useState<HubThreadDetail | null>(null);
    const [replies, setReplies] = useState<HubReply[]>([]);
    const [loading, setLoading] = useState(true);
    const [replyContent, setReplyContent] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [upvoted, setUpvoted] = useState(false);
    const [pollResult, setPollResult] = useState<PollResult | null>(null);
    const [pollLoading, setPollLoading] = useState(false);

    const lastReplyIdRef = useRef(0);
    const esRef = useRef<EventSource | null>(null);

    // Effect 1: load thread + replies (no user dependency — avoids double-fetch)
    useEffect(() => {
        setLoading(true);
        getThread(threadId)
            .then((data) => {
                setThread(data);
                setReplies(data.replies);
                if (data.replies.length > 0) {
                    lastReplyIdRef.current = data.replies[data.replies.length - 1].id;
                }
            })
            .finally(() => setLoading(false));
    }, [threadId]);

    // Effect 2: load poll results — fires only when thread is a poll AND user is known
    // Separated so that auth loading after thread loading doesn't re-fetch the thread.
    useEffect(() => {
        if (!thread || thread.thread_type !== "poll" || !user) return;
        setPollLoading(true);
        getPollResults(thread.id, parseInt(user.id))
            .then(setPollResult)
            .catch(() => {})
            .finally(() => setPollLoading(false));
    }, [thread?.id, thread?.thread_type, user?.id]);

    // SSE subscription — opens after initial data loaded
    useEffect(() => {
        if (loading) return;

        const es = openReplyStream(threadId, lastReplyIdRef.current, (newReply) => {
            lastReplyIdRef.current = newReply.id;
            setReplies((prev) => {
                if (prev.find((r) => r.id === newReply.id)) return prev;
                return [...prev, newReply];
            });
        });
        esRef.current = es;

        return () => {
            es.close();
            esRef.current = null;
        };
    }, [threadId, loading]);

    const handleUpvote = async () => {
        if (upvoted) return;
        setUpvoted(true);
        setThread((t) => t ? { ...t, upvote_count: t.upvote_count + 1 } : t);
        await upvoteThread(threadId);
    };

    const handleResolve = async () => {
        await resolveThread(threadId);
        setThread((t) => t ? { ...t, status: "resolved" } : t);
    };

    const handleVerify = useCallback(
        async (replyId: number) => {
            if (!user) return;
            await verifyReply(threadId, replyId, parseInt(user.id));
            setReplies((prev) =>
                prev.map((r) => (r.id === replyId ? { ...r, is_verified: true } : r)),
            );
            setThread((t) => t ? { ...t, has_verified_reply: true } : t);
        },
        [threadId, user],
    );

    const handleSubmitReply = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !replyContent.trim()) return;
        setSubmitting(true);
        try {
            await createReply(threadId, {
                author_id: parseInt(user.id),
                content: replyContent.trim(),
            });
            setReplyContent("");
        } finally {
            setSubmitting(false);
        }
    };

    const backHref = `/school/${params.id}/courses/${params.courseId}/hub/${params.milestoneId}`;

    const authorName = thread
        ? [thread.author.first_name, thread.author.last_name].filter(Boolean).join(" ")
        : "";

    const isAuthor = user && thread && parseInt(user.id) === thread.author.id;

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    if (!thread) {
        return (
            <div className="text-center py-20 text-gray-500 dark:text-gray-400">
                Thread not found.
            </div>
        );
    }

    const isPoll = thread.thread_type === "poll";

    return (
        <div className="space-y-6">
            {/* Back */}
            <button
                onClick={() => router.push(backHref)}
                className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition-colors"
            >
                <ArrowLeft size={14} />
                Back to discussions
            </button>

            {/* Thread */}
            <div className="p-5 rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-900/60 space-y-3">
                <div className="flex items-start gap-3">
                    {/* Upvote */}
                    <button
                        onClick={handleUpvote}
                        disabled={upvoted}
                        className="flex flex-col items-center gap-0.5 text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 disabled:opacity-60 transition-colors min-w-[32px]"
                        aria-label="Upvote"
                    >
                        <ArrowUp size={16} />
                        <span className="text-xs font-medium">{thread.upvote_count}</span>
                    </button>

                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                            {thread.status === "resolved" && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 dark:text-green-400">
                                    <CheckCircle size={12} />
                                    Resolved
                                </span>
                            )}
                            {isPoll && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400">
                                    <BarChart2 size={10} />
                                    Poll
                                </span>
                            )}
                            <h1 className="text-base font-semibold text-gray-900 dark:text-white">
                                {thread.title}
                            </h1>
                        </div>

                        {/* Poll rendering */}
                        {isPoll ? (
                            <>
                                {thread.content && (
                                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap mb-1">
                                        {thread.content}
                                    </p>
                                )}
                                {pollLoading ? (
                                    <div className="flex items-center gap-2 mt-3 text-xs text-gray-400 dark:text-gray-500">
                                        <div className="w-3 h-3 border border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
                                        Loading poll…
                                    </div>
                                ) : pollResult && user ? (
                                    <PollView
                                        threadId={thread.id}
                                        userId={parseInt(user.id)}
                                        initialResult={pollResult}
                                    />
                                ) : !user ? (
                                    <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
                                        Sign in to vote on this poll.
                                    </p>
                                ) : null}
                            </>
                        ) : (
                            /* Regular question rendering */
                            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                {thread.content}
                            </p>
                        )}

                        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-gray-400 dark:text-gray-500">
                            <span>{authorName}</span>
                            <span>·</span>
                            <span>{new Date(thread.created_at).toLocaleString()}</span>

                            {isAuthor && thread.status !== "resolved" && (
                                <button
                                    onClick={handleResolve}
                                    className="ml-auto text-[11px] text-green-600 dark:text-green-400 hover:underline"
                                >
                                    Mark as resolved
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Replies */}
            <div className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {replies.length} {replies.length === 1 ? "reply" : "replies"}
                </h2>

                {replies.map((r) => (
                    <ReplyCard
                        key={r.id}
                        reply={r}
                        canVerify={!!isAuthor && thread.status !== "resolved"}
                        onVerify={handleVerify}
                    />
                ))}
            </div>

            {/* Reply form */}
            {user && (
                <form
                    onSubmit={handleSubmitReply}
                    className="border-t border-gray-200 dark:border-gray-700/60 pt-4 space-y-3"
                >
                    <textarea
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        placeholder="Write a reply…"
                        rows={4}
                        required
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y transition"
                    />
                    <button
                        type="submit"
                        disabled={submitting || !replyContent.trim()}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                    >
                        <Send size={14} />
                        {submitting ? "Posting…" : "Post reply"}
                    </button>
                </form>
            )}
        </div>
    );
}
