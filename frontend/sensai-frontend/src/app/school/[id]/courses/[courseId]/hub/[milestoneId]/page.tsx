import { notFound } from "next/navigation";
import ModuleHubDiscussion from "@/components/hub/ModuleHubDiscussion";

interface Props {
    params: { id: string; courseId: string; milestoneId: string };
}

async function getMilestoneName(milestoneId: string): Promise<string> {
    try {
        const base =
            process.env.BACKEND_URL ||
            process.env.NEXT_PUBLIC_BACKEND_URL ||
            "";
        const res = await fetch(`${base}/milestones/${milestoneId}`, {
            cache: "no-store",
        });
        if (!res.ok) return "Module";
        const data = await res.json();
        return data.name ?? "Module";
    } catch {
        return "Module";
    }
}

export default async function HubMilestonePage({ params }: Props) {
    const { id: schoolId, courseId, milestoneId } = params;

    const milestoneIdNum = parseInt(milestoneId);
    if (isNaN(milestoneIdNum)) notFound();

    const milestoneName = await getMilestoneName(milestoneId);

    return (
        <ModuleHubDiscussion
            milestoneId={milestoneIdNum}
            milestoneName={milestoneName}
            schoolId={schoolId}
            courseId={courseId}
        />
    );
}
