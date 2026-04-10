import { notFound } from "next/navigation";
import ModuleHubDiscussion from "@/components/hub/ModuleHubDiscussion";

interface Props {
    params: Promise<{ id: string; courseId: string; hubId: string }>;
}

export default async function HubByIdPage({ params }: Props) {
    const { id: schoolId, courseId, hubId } = await params;
    const hubIdNum = parseInt(hubId, 10);
    if (Number.isNaN(hubIdNum)) notFound();

    const base =
        process.env.BACKEND_URL ||
        process.env.NEXT_PUBLIC_BACKEND_URL ||
        "";
    const res = await fetch(`${base}/hub/hubs/${hubIdNum}`, {
        cache: "no-store",
    });
    if (!res.ok) notFound();
    const hub = await res.json();
    if (String(hub.course_id) !== courseId) notFound();

    return (
        <ModuleHubDiscussion
            milestoneId={hub.milestone_id}
            milestoneName={hub.milestone_name}
            schoolId={schoolId}
            courseId={courseId}
            hubId={hubId}
        />
    );
}
