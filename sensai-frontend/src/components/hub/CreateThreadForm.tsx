"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, ArrowLeft } from "lucide-react";
import { createThread } from "@/lib/hub-api";
import type { CreateThreadPayload } from "@/types/hub";

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
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const backHref = `/school/${schoolId}/courses/${courseIdStr}/hub/${milestoneId}`;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !content.trim()) return;
        setSubmitting(true);
        setError(null);
        try {
            const payload: CreateThreadPayload = {
                course_id: courseId,
                milestone_id: milestoneId,
                author_id: authorId,
                title: title.trim(),
                content: content.trim(),
            };
            const result = await createThread(payload);
            router.push(
                `/school/${schoolId}/courses/${courseIdStr}/hub/${milestoneId}/t/${result.id}`,
            );
        } catch {
            setError("Failed to post question. Please try again.");
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

            <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                Ask a question
            </h1>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label
                        htmlFor="thread-title"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                        Title
                    </label>
                    <input
                        id="thread-title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="What do you want to ask?"
                        maxLength={200}
                        required
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                    />
                </div>

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

                {error && (
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                )}

                <button
                    type="submit"
                    disabled={submitting || !title.trim() || !content.trim()}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                >
                    <Send size={14} />
                    {submitting ? "Posting…" : "Post question"}
                </button>
            </form>
        </div>
    );
}
