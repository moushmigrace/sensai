"use client";

import { useAuth } from "@/lib/auth";
import { useParams } from "next/navigation";
import CreateThreadForm from "@/components/hub/CreateThreadForm";

export default function AskPage() {
    const params = useParams<{
        id: string;
        courseId: string;
        milestoneId: string;
    }>();
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    if (!user) {
        return (
            <p className="text-center text-gray-500 dark:text-gray-400 py-20">
                Please log in to ask a question.
            </p>
        );
    }

    return (
        <CreateThreadForm
            courseId={parseInt(params.courseId)}
            milestoneId={parseInt(params.milestoneId)}
            authorId={parseInt(user.id)}
            schoolId={params.id}
            courseIdStr={params.courseId}
        />
    );
}
