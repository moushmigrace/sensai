export type HubThreadStatus = "open" | "resolved" | "closed";

export interface HubAuthor {
    id: number;
    first_name: string;
    last_name?: string | null;
}

export interface HubReply {
    id: number;
    thread_id: number;
    author: HubAuthor;
    content: string;
    upvote_count: number;
    is_verified: boolean;
    created_at: string;
}

export interface HubThread {
    id: number;
    course_id: number;
    milestone_id: number;
    task_id?: number | null;
    author: HubAuthor;
    title: string;
    content: string;
    status: HubThreadStatus;
    upvote_count: number;
    reply_count: number;
    has_verified_reply: boolean;
    is_pinned: boolean;
    created_at: string;
}

export interface HubThreadDetail extends HubThread {
    replies: HubReply[];
}

export interface CreateThreadPayload {
    course_id: number;
    milestone_id: number;
    task_id?: number | null;
    author_id: number;
    title: string;
    content: string;
}

export interface CreateReplyPayload {
    author_id: number;
    content: string;
}
