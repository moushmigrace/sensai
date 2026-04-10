"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, ArrowLeft, Plus, X, BarChart2, MessageSquare } from "lucide-react";
import { createThread } from "@/lib/hub-api";
import type { CreateThreadPayload, HubThreadType } from "@/types/hub";

interface CreateThreadFormProps {
    courseId: number;
    milestoneId: number;
    authorId: number;
    schoolId: string;
    courseIdStr: string;
}

export default function CreateThreadForm({
    courseId,
    milestoneId,
    authorId,
    schoolId,
    courseIdStr,
}: CreateThreadFormProps) {
    const router = useRouter();
    const [threadType, setThreadType] = useState<HubThreadType>("question");
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const backHref = `/school/${schoolId}/courses/${courseIdStr}/hub/${milestoneId}`;

    const addOption = () => {
        if (pollOptions.length < 10) {
            setPollOptions((prev) => [...prev, ""]);
        }
    };

    const removeOption = (idx: number) => {
        if (pollOptions.length > 2) {
            setPollOptions((prev) => prev.filter((_, i) => i !== idx));
        }
    };

    const updateOption = (idx: number, value: string) => {
        setPollOptions((prev) => prev.map((o, i) => (i === idx ? value : o)));
    };

    const validPollOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
    const isPollValid = threadType === "poll" ? validPollOptions.length >= 2 : true;
    const isFormValid = title.trim() && isPollValid &&
        (threadType === "question" ? content.trim().length > 0 : true);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isFormValid) return;
        setSubmitting(true);
        setError(null);
        try {
            const payload: CreateThreadPayload = {
                course_id: courseId,
                milestone_id: milestoneId,
                author_id: authorId,
                title: title.trim(),
                content: content.trim(),
                thread_type: threadType,
                ...(threadType === "poll" ? { poll_options: validPollOptions } : {}),
            };
            const result = await createThread(payload);
            router.push(
                `/school/${schoolId}/courses/${courseIdStr}/hub/${milestoneId}/t/${result.id}`,
            );
        } catch {
            setError("Failed to post. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <button
                onClick={() => router.push(backHref)}
                className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white mb-6 transition-colors"
            >
                <ArrowLeft size={14} />
                Back to discussions
            </button>

            {/* Type toggle */}
            <div className="flex gap-2 mb-6">
                <button
                    type="button"
                    onClick={() => setThreadType("question")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                        threadType === "question"
                            ? "bg-indigo-600 border-indigo-600 text-white"
                            : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-indigo-400"
                    }`}
                >
                    <MessageSquare size={14} />
                    Ask a question
                </button>
                <button
                    type="button"
                    onClick={() => setThreadType("poll")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                        threadType === "poll"
                            ? "bg-indigo-600 border-indigo-600 text-white"
                            : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-indigo-400"
                    }`}
                >
                    <BarChart2 size={14} />
                    Create a poll
                </button>
            </div>

            <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                {threadType === "poll" ? "Create a poll" : "Ask a question"}
            </h1>

            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Title */}
                <div>
                    <label
                        htmlFor="thread-title"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                        {threadType === "poll" ? "Poll question" : "Title"}
                    </label>
                    <input
                        id="thread-title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={
                            threadType === "poll"
                                ? "What do you want people to vote on?"
                                : "What do you want to ask?"
                        }
                        maxLength={200}
                        required
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                    />
                </div>

                {/* Question: details textarea */}
                {threadType === "question" && (
                    <div>
                        <label
                            htmlFor="thread-content"
                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >
                            Details
                        </label>
                        <textarea
                            id="thread-content"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Describe your question in detail…"
                            rows={8}
                            required
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y transition"
                        />
                    </div>
                )}

                {/* Poll: options + optional description */}
                {threadType === "poll" && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Options
                                <span className="ml-1 text-xs text-gray-400 font-normal">
                                    (min 2, max 10)
                                </span>
                            </label>
                            <div className="space-y-2">
                                {pollOptions.map((opt, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <span className="text-xs text-gray-400 w-5 text-right shrink-0">
                                            {idx + 1}.
                                        </span>
                                        <input
                                            type="text"
                                            value={opt}
                                            onChange={(e) => updateOption(idx, e.target.value)}
                                            placeholder={`Option ${idx + 1}`}
                                            maxLength={200}
                                            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                                        />
                                        {pollOptions.length > 2 && (
                                            <button
                                                type="button"
                                                onClick={() => removeOption(idx)}
                                                className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                                aria-label="Remove option"
                                            >
                                                <X size={15} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {pollOptions.length < 10 && (
                                <button
                                    type="button"
                                    onClick={addOption}
                                    className="mt-2 flex items-center gap-1.5 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                                >
                                    <Plus size={14} />
                                    Add option
                                </button>
                            )}
                        </div>

                        <div>
                            <label
                                htmlFor="poll-description"
                                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                            >
                                Description
                                <span className="ml-1 text-xs text-gray-400 font-normal">
                                    (optional)
                                </span>
                            </label>
                            <textarea
                                id="poll-description"
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="Add some context for your poll…"
                                rows={3}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y transition"
                            />
                        </div>
                    </>
                )}

                {error && (
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                )}

                <button
                    type="submit"
                    disabled={submitting || !isFormValid}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                >
                    <Send size={14} />
                    {submitting
                        ? threadType === "poll"
                            ? "Creating poll…"
                            : "Posting…"
                        : threadType === "poll"
                          ? "Create poll"
                          : "Post question"}
                </button>
            </form>
        </div>
    );
}
