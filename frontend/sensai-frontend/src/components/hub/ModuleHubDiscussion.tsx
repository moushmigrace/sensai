"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import ThreadFeed from "./ThreadFeed";
import CreateThreadForm from "./CreateThreadForm";

interface ModuleHubDiscussionProps {
    milestoneId: number;
    milestoneName: string;
    schoolId: string;
    courseId: string;
    /** When set, mentor Answer + canonical URLs use `/hubs/[hubId]`. */
    hubId?: string;
}

type HubTab = "ask" | "discussions";

/**
 * MODULE_HUBS_UI_IMPLEMENTATION: module-scoped header, tabs (Ask / All Discussions), mentor Answer entry.
 */
export default function ModuleHubDiscussion({
    milestoneId,
    milestoneName,
    schoolId,
    courseId,
    hubId,
}: ModuleHubDiscussionProps) {
    const [tab, setTab] = useState<HubTab>("discussions");
    const { user, isLoading } = useAuth();

    const answerHref = hubId
        ? `/school/${schoolId}/courses/${courseId}/hubs/${hubId}/answer`
        : `/school/${schoolId}/courses/${courseId}/hub/${milestoneId}/answer`;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white pr-4">
                    {milestoneName} - Discussion Hub
                </h1>
                <Link
                    href={answerHref}
                    className="inline-flex shrink-0 items-center justify-center px-4 py-2 rounded-full text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                >
                    Answer
                </Link>
            </div>

            <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
                <button
                    type="button"
                    onClick={() => setTab("ask")}
                    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                        tab === "ask"
                            ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                            : "border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
                    }`}
                >
                    Ask a Question
                </button>
                <button
                    type="button"
                    onClick={() => setTab("discussions")}
                    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                        tab === "discussions"
                            ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                            : "border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
                    }`}
                >
                    All Discussions
                </button>
            </div>

            {tab === "ask" && (
                <div className="pt-2">
                    {isLoading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
                        </div>
                    ) : !user ? (
                        <p className="text-center text-gray-500 dark:text-gray-400 py-12">
                            Please log in to ask a question.
                        </p>
                    ) : (
                        <CreateThreadForm
                            courseId={parseInt(courseId, 10)}
                            milestoneId={milestoneId}
                            authorId={parseInt(user.id, 10)}
                            schoolId={schoolId}
                            courseIdStr={courseId}
                            embedded
                            hubIdStr={hubId}
                        />
                    )}
                </div>
            )}

            {tab === "discussions" && (
                <ThreadFeed
                    milestoneId={milestoneId}
                    milestoneTitle={milestoneName}
                    schoolId={schoolId}
                    courseId={courseId}
                    listOnly
                    hubIdStr={hubId}
                />
            )}
        </div>
    );
}
