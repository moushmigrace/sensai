"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Send, ArrowLeft } from "lucide-react";
import { createThread, getThreadsForMilestone } from "@/lib/hub-api";
import type { CreateThreadPayload } from "@/types/hub";
import type { HubThread } from "@/types/hub";
import Link from "next/link";

interface CourseTaskRow {
    id: number;
    name: string;
    milestone_id: number | null;
}

interface CreateThreadFormProps {
    courseId: number;
    milestoneId: number;
    authorId: number;
    schoolId: string;
    courseIdStr: string;
    /** Compact layout for Module Hub “Ask a Question” tab */
    embedded?: boolean;
    /** When using `/hubs/[hubId]` routes, improves back navigation metadata */
    hubIdStr?: string;
}

function normalizeTitle(s: string): string {
    return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function titleLooksSimilar(draft: string, existing: string): boolean {
    const a = normalizeTitle(draft);
    const b = normalizeTitle(existing);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length >= 6 && (b.includes(a.slice(0, 6)) || a.includes(b.slice(0, 6)))) {
        return true;
    }
    return false;
}

export default function CreateThreadForm({
    courseId,
    milestoneId,
    authorId,
    schoolId,
    courseIdStr,
    embedded = false,
    hubIdStr,
}: CreateThreadFormProps) {
    const router = useRouter();
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [taskId, setTaskId] = useState<number | "">("");
    const [taskOptions, setTaskOptions] = useState<{ id: number; name: string }[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [debouncedTitle, setDebouncedTitle] = useState("");
    const [similarThreads, setSimilarThreads] = useState<HubThread[]>([]);
    const [scanning, setScanning] = useState(false);

    const backHref = hubIdStr
        ? `/school/${schoolId}/courses/${courseIdStr}/hubs/${hubIdStr}`
        : `/school/${schoolId}/courses/${courseIdStr}/hub/${milestoneId}`;

    useEffect(() => {
        let cancelled = false;
        const base = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!base) return;
        (async () => {
            try {
                const res = await fetch(`${base}/courses/${courseId}/tasks`);
                if (!res.ok) return;
                const all: CourseTaskRow[] = await res.json();
                if (cancelled) return;
                const filtered = all.filter(
                    (t) => t.milestone_id === milestoneId,
                );
                setTaskOptions(filtered.map((t) => ({ id: t.id, name: t.name })));
            } catch {
                if (!cancelled) setTaskOptions([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [courseId, milestoneId]);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedTitle(title), 450);
        return () => clearTimeout(t);
    }, [title]);

    useEffect(() => {
        const q = debouncedTitle.trim();
        if (q.length < 4) {
            setSimilarThreads([]);
            return;
        }
        let cancelled = false;
        setScanning(true);
        (async () => {
            try {
                const threads = await getThreadsForMilestone(milestoneId, "latest");
                if (cancelled) return;
                const hits = threads.filter((th) => titleLooksSimilar(q, th.title)).slice(0, 5);
                setSimilarThreads(hits);
            } catch {
                if (!cancelled) setSimilarThreads([]);
            } finally {
                if (!cancelled) setScanning(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [debouncedTitle, milestoneId]);

    const similarNotice = useMemo(() => {
        if (!similarThreads.length || !debouncedTitle.trim()) return null;
        return similarThreads;
    }, [similarThreads, debouncedTitle]);

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
                task_id: taskId === "" ? undefined : taskId,
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
        <div className={embedded ? "" : "max-w-2xl mx-auto"}>
            {!embedded && (
                <button
                    type="button"
                    onClick={() => router.push(backHref)}
                    className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white mb-6 transition-colors"
                >
                    <ArrowLeft size={14} />
                    Back to discussions
                </button>
            )}

            <h2
                className={`font-semibold text-gray-900 dark:text-white mb-4 ${
                    embedded ? "text-lg" : "text-xl mb-6"
                }`}
            >
                Ask a question
            </h2>

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
                    {scanning && debouncedTitle.trim().length >= 4 && (
                        <p className="text-xs text-gray-400 mt-1">Checking for similar questions…</p>
                    )}
                    {similarNotice && similarNotice.length > 0 && (
                        <div
                            className="mt-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
                            role="status"
                        >
                            <p className="font-medium mb-1">Similar questions may already exist:</p>
                            <ul className="list-disc list-inside space-y-1">
                                {similarNotice.map((th) => (
                                    <li key={th.id}>
                                        <Link
                                            href={`/school/${schoolId}/courses/${courseIdStr}/hub/${milestoneId}/t/${th.id}`}
                                            className="underline hover:text-amber-950 dark:hover:text-amber-50"
                                        >
                                            {th.title}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                {taskOptions.length > 0 && (
                    <div>
                        <label
                            htmlFor="thread-task"
                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >
                            Link to a quiz / task (optional)
                        </label>
                        <select
                            id="thread-task"
                            value={taskId === "" ? "" : String(taskId)}
                            onChange={(e) =>
                                setTaskId(
                                    e.target.value === ""
                                        ? ""
                                        : parseInt(e.target.value, 10),
                                )
                            }
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">— None —</option>
                            {taskOptions.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

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
                        rows={embedded ? 6 : 8}
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
