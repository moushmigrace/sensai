import { notFound } from "next/navigation";
import ThreadFeed from "@/components/hub/ThreadFeed";

interface Props {
    params: Promise<{ id: string; courseId: string; milestoneId: string }>;
}

async function getMilestoneName(milestoneId: string): Promise<string> {
    try {
        const res = await fetch(
            `${process.env.BACKEND_URL}/milestones/${milestoneId}`,
            { cache: "no-store" },
        );
        if (!res.ok) return "Module";
        const data = await res.json();
        return data.name ?? "Module";
    } catch {
        return "Module";
    }
}

export default async function HubMilestonePage({ params }: Props) {
    const { id: schoolId, courseId, milestoneId } = await params;

    const milestoneIdNum = parseInt(milestoneId);
    if (isNaN(milestoneIdNum)) notFound();

    const milestoneName = await getMilestoneName(milestoneId);

    return (
        <ThreadFeed
            milestoneId={milestoneIdNum}
            milestoneTitle={milestoneName}
            schoolId={schoolId}
            courseId={courseId}
        />
    );
}
