import type {
    HubThread,
    HubThreadDetail,
    HubReply,
    CreateThreadPayload,
    CreateReplyPayload,
} from "@/types/hub";

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL;

// ── Threads ──────────────────────────────────────────────────────────────────

export async function getThreadsForMilestone(
    milestoneId: number,
    sort: "latest" | "top" = "latest",
): Promise<HubThread[]> {
    const res = await fetch(
        `${BASE}/hub/milestones/${milestoneId}/threads?sort=${sort}`,
        { cache: "no-store" },
    );
    if (!res.ok) throw new Error("Failed to fetch threads");
    return res.json();
}

export async function getThread(threadId: number): Promise<HubThreadDetail> {
    const res = await fetch(`${BASE}/hub/threads/${threadId}`, {
        cache: "no-store",
    });
    if (!res.ok) throw new Error("Failed to fetch thread");
    return res.json();
}

export async function createThread(
    payload: CreateThreadPayload,
): Promise<{ id: number; title: string; created_at: string }> {
    const res = await fetch(`${BASE}/hub/threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to create thread");
    return res.json();
}

export async function upvoteThread(threadId: number): Promise<void> {
    await fetch(`${BASE}/hub/threads/${threadId}/upvote`, { method: "POST" });
}

export async function resolveThread(threadId: number): Promise<void> {
    await fetch(`${BASE}/hub/threads/${threadId}/resolve`, { method: "POST" });
}

export async function pinThread(
    threadId: number,
    isPinned: boolean,
): Promise<void> {
    await fetch(
        `${BASE}/hub/threads/${threadId}/pin?is_pinned=${isPinned}`,
        { method: "POST" },
    );
}

export async function deleteThread(threadId: number): Promise<void> {
    await fetch(`${BASE}/hub/threads/${threadId}`, { method: "DELETE" });
}

// ── Replies ───────────────────────────────────────────────────────────────────

export async function createReply(
    threadId: number,
    payload: CreateReplyPayload,
): Promise<{ id: number; thread_id: number }> {
    const res = await fetch(`${BASE}/hub/threads/${threadId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to create reply");
    return res.json();
}

export async function upvoteReply(
    threadId: number,
    replyId: number,
): Promise<void> {
    await fetch(`${BASE}/hub/threads/${threadId}/replies/${replyId}/upvote`, {
        method: "POST",
    });
}

export async function verifyReply(
    threadId: number,
    replyId: number,
    verifiedById: number,
): Promise<void> {
    await fetch(
        `${BASE}/hub/threads/${threadId}/replies/${replyId}/verify?verified_by_id=${verifiedById}`,
        { method: "POST" },
    );
}

export async function deleteReply(
    threadId: number,
    replyId: number,
): Promise<void> {
    await fetch(`${BASE}/hub/threads/${threadId}/replies/${replyId}`, {
        method: "DELETE",
    });
}

// ── SSE stream ────────────────────────────────────────────────────────────────

/**
 * Opens an EventSource to the reply stream for a thread.
 * Calls `onReply` for every new reply received.
 * Returns the EventSource so the caller can close it on cleanup.
 */
export function openReplyStream(
    threadId: number,
    lastId: number,
    onReply: (reply: HubReply) => void,
): EventSource {
    const url = `${BASE}/hub/threads/${threadId}/stream?last_id=${lastId}`;
    const es = new EventSource(url);
    es.addEventListener("reply", (e: MessageEvent) => {
        try {
            onReply(JSON.parse(e.data) as HubReply);
        } catch {
            // ignore malformed events
        }
    });
    return es;
}
