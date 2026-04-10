# Stage 3: Thread Detail & Reply System

## Feature Delivered

After this stage, users can **click on any thread** to see its full content, **post replies**, and see all replies sorted with **verified answers at the top, then by votes, then by time**. The complete Q&A loop is functional.

---

## What Ships to Users

- Click a thread card in the feed -> opens a full thread detail page
- Thread detail shows: title, full content, author name, time, status badge
- Reply list below the thread, sorted: verified first, then top-voted, then chronological
- "Post a Reply" textarea at the bottom of the reply list
- Reply cards showing content, author name, time
- Reply count updates in real-time after posting
- Back navigation to the feed

---

## Prerequisites

Stages 1 and 2 must be completed.

---

## Backend Changes

### 1. Pydantic Models

**File:** `sensai-backend/src/api/models.py`

**Add:**

```python
class CreateReplyRequest(BaseModel):
    content: str
    user_id: int


class CreateReplyResponse(BaseModel):
    id: int


class HubReplyResponse(BaseModel):
    id: int
    thread_id: int
    author_id: int
    author_first_name: Optional[str] = None
    author_last_name: Optional[str] = None
    author_email: Optional[str] = None
    content: str
    upvote_count: int = 0
    is_verified: bool = False
    verified_by_id: Optional[int] = None
    verified_by_first_name: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ThreadDetailResponse(BaseModel):
    thread: HubThreadResponse
    replies: List[HubReplyResponse]
```

---

### 2. DB Helper Functions

**File:** `sensai-backend/src/api/db/hub.py`

**Add:**

```python
def convert_reply_row_to_dict(row) -> Dict:
    return {
        "id": row[0],
        "thread_id": row[1],
        "author_id": row[2],
        "content": row[3],
        "upvote_count": row[4],
        "is_verified": bool(row[5]),
        "verified_by_id": row[6],
        "created_at": row[7],
        "updated_at": row[8],
        "author_first_name": row[9] if len(row) > 9 else None,
        "author_last_name": row[10] if len(row) > 10 else None,
        "author_email": row[11] if len(row) > 11 else None,
        "verified_by_first_name": row[12] if len(row) > 12 else None,
    }


async def get_thread_by_id(thread_id: int) -> Optional[Dict]:
    row = await execute_db_operation(
        f"""
        SELECT 
            t.id, t.course_id, t.milestone_id, t.task_id, t.author_id,
            t.title, t.content, t.status, t.upvote_count, t.reply_count,
            t.has_verified_reply, t.is_pinned, t.created_at, t.updated_at,
            u.first_name, u.last_name, u.email
        FROM {hub_threads_table_name} t
        LEFT JOIN {users_table_name} u ON t.author_id = u.id
        WHERE t.id = ? AND t.deleted_at IS NULL
        """,
        (thread_id,),
        fetch_one=True,
    )
    if not row:
        return None
    return convert_thread_row_to_dict(row)


async def get_replies_for_thread(thread_id: int) -> List[Dict]:
    """Returns replies sorted: verified first, then by upvotes desc, then chronological."""
    rows = await execute_db_operation(
        f"""
        SELECT 
            r.id, r.thread_id, r.author_id, r.content, r.upvote_count,
            r.is_verified, r.verified_by_id, r.created_at, r.updated_at,
            u.first_name, u.last_name, u.email,
            v.first_name as verified_by_first_name
        FROM {hub_replies_table_name} r
        LEFT JOIN {users_table_name} u ON r.author_id = u.id
        LEFT JOIN {users_table_name} v ON r.verified_by_id = v.id
        WHERE r.thread_id = ? AND r.deleted_at IS NULL
        ORDER BY r.is_verified DESC, r.upvote_count DESC, r.created_at ASC
        """,
        (thread_id,),
        fetch_all=True,
    )
    return [convert_reply_row_to_dict(row) for row in rows]


async def create_reply(thread_id: int, author_id: int, content: str) -> int:
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()

        # Insert the reply
        await cursor.execute(
            f"""
            INSERT INTO {hub_replies_table_name} (thread_id, author_id, content)
            VALUES (?, ?, ?)
            """,
            (thread_id, author_id, content),
        )

        reply_id = cursor.lastrowid

        # Increment reply_count on the thread
        await cursor.execute(
            f"""
            UPDATE {hub_threads_table_name}
            SET reply_count = reply_count + 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (thread_id,),
        )

        await conn.commit()
        return reply_id


async def delete_thread(thread_id: int) -> None:
    await execute_db_operation(
        f"""
        UPDATE {hub_threads_table_name}
        SET deleted_at = CURRENT_TIMESTAMP
        WHERE id = ? AND deleted_at IS NULL
        """,
        (thread_id,),
    )


async def delete_reply(reply_id: int) -> None:
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()

        # Get the thread_id first
        await cursor.execute(
            f"SELECT thread_id FROM {hub_replies_table_name} WHERE id = ? AND deleted_at IS NULL",
            (reply_id,),
        )
        row = await cursor.fetchone()
        if not row:
            return

        thread_id = row[0]

        # Soft delete the reply
        await cursor.execute(
            f"UPDATE {hub_replies_table_name} SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
            (reply_id,),
        )

        # Decrement reply_count on the thread
        await cursor.execute(
            f"""
            UPDATE {hub_threads_table_name}
            SET reply_count = MAX(0, reply_count - 1), updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (thread_id,),
        )

        await conn.commit()
```

---

### 3. API Routes

**File:** `sensai-backend/src/api/routes/hub.py`

**Add imports:**

```python
from api.db.hub import (
    # ... existing imports ...
    get_thread_by_id as get_thread_by_id_from_db,
    get_replies_for_thread as get_replies_for_thread_from_db,
    create_reply as create_reply_in_db,
    delete_thread as delete_thread_from_db,
    delete_reply as delete_reply_from_db,
)
from api.models import (
    # ... existing imports ...
    CreateReplyRequest,
    CreateReplyResponse,
    HubReplyResponse,
    ThreadDetailResponse,
)
```

**Add these endpoints:**

```python
@router.get("/threads/{thread_id}", response_model=ThreadDetailResponse)
async def get_thread_detail(thread_id: int) -> ThreadDetailResponse:
    thread = await get_thread_by_id_from_db(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    replies = await get_replies_for_thread_from_db(thread_id)
    return {"thread": thread, "replies": replies}


@router.post("/threads/{thread_id}/replies", response_model=CreateReplyResponse)
async def create_reply(
    thread_id: int,
    request: CreateReplyRequest,
) -> CreateReplyResponse:
    # Verify thread exists
    thread = await get_thread_by_id_from_db(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    reply_id = await create_reply_in_db(
        thread_id=thread_id,
        author_id=request.user_id,
        content=request.content,
    )
    return {"id": reply_id}


@router.delete("/threads/{thread_id}")
async def delete_thread(thread_id: int):
    await delete_thread_from_db(thread_id)
    return {"success": True}


@router.delete("/replies/{reply_id}")
async def delete_reply(reply_id: int):
    await delete_reply_from_db(reply_id)
    return {"success": True}
```

---

## Frontend Changes

### 4. API Functions

**File:** `sensai-frontend/src/lib/hub-api.ts`

**Add:**

```typescript
export interface ThreadDetail {
  thread: HubThread;
  replies: HubReply[];
}

export interface HubReply {
  id: number;
  thread_id: number;
  author_id: number;
  author_first_name: string | null;
  author_last_name: string | null;
  author_email: string | null;
  content: string;
  upvote_count: number;
  is_verified: boolean;
  verified_by_id: number | null;
  verified_by_first_name: string | null;
  created_at: string;
}

export async function getThreadDetail(threadId: number): Promise<ThreadDetail> {
  const res = await fetch(`${BACKEND_URL}/hubs/threads/${threadId}`);
  if (!res.ok) throw new Error(`Failed to fetch thread: ${res.status}`);
  return res.json();
}

export async function createReply(
  threadId: number,
  data: { content: string; user_id: number }
): Promise<{ id: number }> {
  const res = await fetch(`${BACKEND_URL}/hubs/threads/${threadId}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create reply: ${res.status}`);
  return res.json();
}

export async function deleteThread(threadId: number): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/hubs/threads/${threadId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete thread: ${res.status}`);
}

export async function deleteReply(replyId: number): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/hubs/replies/${replyId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete reply: ${res.status}`);
}
```

**Also add to `src/types/hub.ts`:**

```typescript
export interface HubReply {
  id: number;
  thread_id: number;
  author_id: number;
  author_first_name: string | null;
  author_last_name: string | null;
  author_email: string | null;
  content: string;
  upvote_count: number;
  is_verified: boolean;
  verified_by_id: number | null;
  verified_by_first_name: string | null;
  created_at: string;
}
```

---

### 5. ReplyCard Component

**New file:** `sensai-frontend/src/components/hub/ReplyCard.tsx`

```tsx
"use client";

import { HubReply } from "@/types/hub";
import { CheckCircle, ChevronUp, Shield } from "lucide-react";

interface ReplyCardProps {
  reply: HubReply;
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ReplyCard({ reply }: ReplyCardProps) {
  const authorName =
    [reply.author_first_name, reply.author_last_name]
      .filter(Boolean)
      .join(" ") || reply.author_email || "Anonymous";

  return (
    <div
      className={`p-4 border rounded-lg ${
        reply.is_verified
          ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10"
          : "border-gray-200 dark:border-gray-800"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Vote column */}
        <div className="flex flex-col items-center min-w-[32px] pt-0.5">
          <ChevronUp size={14} className="text-gray-400" />
          <span className="text-xs font-medium">{reply.upvote_count}</span>
        </div>

        {/* Content */}
        <div className="flex-1">
          {reply.is_verified && (
            <div className="flex items-center gap-1.5 mb-2 text-green-600 dark:text-green-400">
              <CheckCircle size={14} />
              <span className="text-xs font-medium">
                Verified{reply.verified_by_first_name
                  ? ` by ${reply.verified_by_first_name}`
                  : ""}
              </span>
            </div>
          )}

          <p className="text-sm whitespace-pre-wrap">{reply.content}</p>

          <div className="flex items-center gap-3 mt-3 text-xs text-gray-400 dark:text-gray-500">
            <span className="font-medium text-gray-600 dark:text-gray-300">
              {authorName}
            </span>
            <span>{timeAgo(reply.created_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

### 6. Thread Detail Page

**New file:** `sensai-frontend/src/app/school/[id]/courses/[courseId]/hub/[milestoneId]/t/[threadId]/page.tsx`

```tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getThreadDetail, createReply, HubReply } from "@/lib/hub-api";
import { HubThread } from "@/types/hub";
import ReplyCard from "@/components/hub/ReplyCard";
import {
  ArrowLeft,
  MessageSquare,
  CheckCircle,
  Clock,
  Send,
} from "lucide-react";

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ThreadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();

  const schoolId = params?.id as string;
  const courseId = params?.courseId as string;
  const milestoneId = params?.milestoneId as string;
  const threadId = params?.threadId as string;

  const [thread, setThread] = useState<HubThread | null>(null);
  const [replies, setReplies] = useState<HubReply[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [replyContent, setReplyContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadThread = async () => {
    try {
      setIsLoading(true);
      const data = await getThreadDetail(parseInt(threadId));
      setThread(data.thread);
      setReplies(data.replies);
    } catch (err) {
      console.error("Failed to load thread:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadThread();
  }, [threadId]);

  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim() || !user?.id) return;

    setIsSubmitting(true);
    try {
      await createReply(parseInt(threadId), {
        content: replyContent.trim(),
        user_id: parseInt(user.id),
      });
      setReplyContent("");
      await loadThread(); // Refresh to show new reply
    } catch (err) {
      console.error("Failed to post reply:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-8 h-8 border-t-2 border-b-2 rounded-full animate-spin border-black dark:border-white" />
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center">
        <p className="text-gray-500">Thread not found.</p>
      </div>
    );
  }

  const authorName =
    [thread.author_first_name, thread.author_last_name]
      .filter(Boolean)
      .join(" ") || thread.author_email || "Anonymous";

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Back button */}
      <button
        onClick={() =>
          router.push(
            `/school/${schoolId}/courses/${courseId}/hub/${milestoneId}`
          )
        }
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-6"
      >
        <ArrowLeft size={14} />
        Back to discussions
      </button>

      {/* Thread */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          {thread.has_verified_reply && (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">
              <CheckCircle size={10} />
              Verified Answer
            </span>
          )}
          {thread.status === "resolved" && (
            <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full">
              Resolved
            </span>
          )}
        </div>

        <h1 className="text-2xl font-semibold mb-3">{thread.title}</h1>

        <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mb-4">
          <span className="font-medium text-gray-700 dark:text-gray-200">
            {authorName}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {timeAgo(thread.created_at)}
          </span>
        </div>

        <div className="prose dark:prose-invert max-w-none text-sm whitespace-pre-wrap">
          {thread.content}
        </div>
      </div>

      {/* Replies section */}
      <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
        <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
          <MessageSquare size={18} />
          {replies.length} {replies.length === 1 ? "Reply" : "Replies"}
        </h2>

        {replies.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            No replies yet. Be the first to answer!
          </p>
        )}

        <div className="space-y-3 mb-8">
          {replies.map((reply) => (
            <ReplyCard key={reply.id} reply={reply} />
          ))}
        </div>

        {/* Reply form */}
        <form onSubmit={handleSubmitReply}>
          <label className="block text-sm font-medium mb-1.5">
            Your Reply
          </label>
          <textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="Share your answer, insights, or ask for clarification..."
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-3"
            required
          />
          <button
            type="submit"
            disabled={isSubmitting || !replyContent.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            <Send size={14} />
            {isSubmitting ? "Posting..." : "Post Reply"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

---

## Real-Time Updates via SSE (Server-Sent Events)

> **Why SSE instead of WebSockets?** SSE is unidirectional (server → client), which is all a discussion forum needs — replies are posted via normal HTTP `POST`, only the *reading* side needs to be live. SSE is supported natively in every browser (`EventSource`) and is trivial to add to FastAPI with `sse-starlette`. Total implementation: ~45 minutes on top of the HTTP-based work above.

### 7. Install SSE dependency

**File:** `sensai-backend/pyproject.toml`

Add to the `[project] dependencies` list:

```toml
"sse-starlette",
```

---

### 8. DB Helper — `get_replies_since()` (addition to `db/hub.py`)

**File:** `sensai-backend/src/api/db/hub.py`

**Add this function** (uses the `idx_hub_reply_stream (thread_id, id)` index created in Stage 1 — pure index scan, zero overhead):

```python
async def get_replies_since(thread_id: int, last_reply_id: int) -> List[Dict]:
    """Return all non-deleted replies for a thread with id > last_reply_id, ordered ASC.
    Used by the SSE stream endpoint to push new replies to connected clients.
    Relies on idx_hub_reply_stream (thread_id, id) for efficient lookup."""
    rows = await execute_db_operation(
        f"""
        SELECT
            r.id, r.thread_id, r.author_id, r.content, r.upvote_count,
            r.is_verified, r.verified_by_id, r.created_at, r.updated_at,
            u.first_name, u.last_name, u.email,
            v.first_name as verified_by_first_name
        FROM {hub_replies_table_name} r
        LEFT JOIN {users_table_name} u ON r.author_id = u.id
        LEFT JOIN {users_table_name} v ON r.verified_by_id = v.id
        WHERE r.thread_id = ? AND r.id > ? AND r.deleted_at IS NULL
        ORDER BY r.id ASC
        """,
        (thread_id, last_reply_id),
        fetch_all=True,
    )
    return [convert_reply_row_to_dict(row) for row in rows]
```

---

### 9. SSE Endpoint (addition to `routes/hub.py`)

**File:** `sensai-backend/src/api/routes/hub.py`

**Add imports at the top:**

```python
from sse_starlette.sse import EventSourceResponse
import asyncio
import json
```

**Add import to the `db/hub.py` import block:**

```python
from api.db.hub import (
    # ... existing imports ...
    get_replies_since as get_replies_since_from_db,
)
```

**Add this endpoint:**

```python
@router.get("/threads/{thread_id}/stream")
async def stream_thread_replies(thread_id: int, last_reply_id: int = 0):
    """SSE endpoint: streams new replies for a thread as they are posted.
    Clients connect with ?last_reply_id=<id of last reply they already have>.
    Polls the DB every 2 seconds. Uses idx_hub_reply_stream for zero-overhead queries.
    A ping event is sent every cycle when there are no new replies to keep the connection alive."""

    async def generator():
        current_last_id = last_reply_id
        while True:
            new_replies = await get_replies_since_from_db(thread_id, current_last_id)
            for reply in new_replies:
                current_last_id = reply["id"]
                yield {
                    "event": "new_reply",
                    "data": json.dumps(reply, default=str),
                }
            if not new_replies:
                yield {"event": "ping", "data": ""}  # keep-alive heartbeat
            await asyncio.sleep(2)

    return EventSourceResponse(generator())
```

---

### 10. Frontend — EventSource hook (addition to `ThreadDetailPage.tsx`)

**File:** `sensai-frontend/src/app/school/[id]/courses/[courseId]/hub/[milestoneId]/t/[threadId]/page.tsx`

**Add this `useEffect`** inside `ThreadDetailPage`, after the existing `loadThread` effect. It starts the SSE connection once the initial replies have loaded (so `last_reply_id` is known):

```typescript
// Start SSE connection after initial replies are loaded.
// Appends new replies without a page refresh for all concurrent viewers.
useEffect(() => {
  if (!threadId || replies.length === 0) return;

  const lastId = replies[replies.length - 1].id;
  const es = new EventSource(
    `${process.env.NEXT_PUBLIC_BACKEND_URL}/hubs/threads/${threadId}/stream?last_reply_id=${lastId}`
  );

  es.addEventListener("new_reply", (e) => {
    const reply = JSON.parse(e.data) as HubReply;
    setReplies((prev) =>
      // Guard against duplicate if this client just posted the reply via HTTP
      prev.some((r) => r.id === reply.id) ? prev : [...prev, reply]
    );
  });

  // Browser auto-reconnects on error per the EventSource spec.
  // We only close explicitly on component unmount.
  return () => es.close();
}, [threadId, replies.length === 0]); // Re-runs only when thread changes or initial load completes
```

**Note:** No additional imports are needed — `EventSource` is a native browser API.

---

## Files Summary

| Action | File Path | Notes |
|--------|-----------|-------|
| **Modify** | `sensai-backend/src/api/models.py` | Add `CreateReplyRequest`, `CreateReplyResponse`, `HubReplyResponse`, `ThreadDetailResponse` |
| **Modify** | `sensai-backend/src/api/db/hub.py` | Add `get_thread_by_id()`, `get_replies_for_thread()`, `create_reply()`, `delete_thread()`, `delete_reply()`, `get_replies_since()` |
| **Modify** | `sensai-backend/src/api/routes/hub.py` | Add `GET /threads/{thread_id}`, `POST /threads/{thread_id}/replies`, `DELETE /threads/{thread_id}`, `DELETE /replies/{reply_id}`, `GET /threads/{thread_id}/stream` (SSE) |
| **Modify** | `sensai-backend/pyproject.toml` | Add `sse-starlette` dependency |
| **Modify** | `sensai-frontend/src/lib/hub-api.ts` | Add `getThreadDetail()`, `createReply()`, `deleteThread()`, `deleteReply()` |
| **Modify** | `sensai-frontend/src/types/hub.ts` | Add `HubReply` interface |
| **Create** | `sensai-frontend/src/components/hub/ReplyCard.tsx` | Reply card component |
| **Create** | `sensai-frontend/src/app/school/[id]/courses/[courseId]/hub/[milestoneId]/t/[threadId]/page.tsx` | Thread detail page with SSE `EventSource` hook |

---

## Testing Checklist

- [ ] `POST /hubs/threads/1/replies` creates a reply and increments thread `reply_count`
- [ ] `GET /hubs/threads/1` returns thread + replies sorted by verified > upvotes > time
- [ ] Click a thread card -> navigates to detail page with full content
- [ ] Post a reply -> appears at bottom of reply list instantly (via HTTP refresh)
- [ ] Reply count updates in the thread header
- [ ] Back button returns to the feed
- [ ] Empty reply state shows "No replies yet" message
- [ ] `DELETE /hubs/threads/1` soft-deletes (thread disappears from feed)
- [ ] `DELETE /hubs/replies/1` soft-deletes and decrements reply_count
- [ ] **SSE:** Open the same thread in two browser tabs — post a reply in Tab A — reply appears in Tab B within ~2 seconds without any page refresh
- [ ] **SSE:** Close the thread detail page — verify the `EventSource` connection is closed (check Network tab in DevTools, connection should disappear)
- [ ] **SSE heartbeat:** With no new replies, the stream sends a `ping` event every ~2 seconds (visible in DevTools Network → EventStream tab)
- [ ] **SSE reconnect:** Kill and restart the backend — browser automatically reconnects and resumes streaming
