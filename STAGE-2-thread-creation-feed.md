# Stage 2: Thread Creation & Discussion Feed

## Feature Delivered

After this stage, users can **create discussion threads** within a module hub and **browse all discussions** with sorting. A **duplicate detection** system warns users when similar threads already exist.

---

## What Ships to Users

- "Start Discussion" button is now active
- A thread creation form with title + rich content editor
- Live duplicate detection: as user types a title, similar existing threads appear as suggestions
- Discussion feed with sorting tabs: **Recent**, **Top Voted**, **Verified**, **Unanswered**
- Thread cards showing title, content preview, author name, reply count, time ago
- Pagination (load more) at bottom of feed

---

## Prerequisites

Stage 1 must be completed (tables exist, routes registered, hub pages mounted).

---

## Backend Changes

### 1. Pydantic Models (additions to `models.py`)

**File:** `sensai-backend/src/api/models.py`

**Add after the Stage 1 models:**

```python
class CreateThreadRequest(BaseModel):
    title: str
    content: str
    course_id: int
    user_id: int
    task_id: Optional[int] = None


class CreateThreadResponse(BaseModel):
    id: int
```

---

### 2. DB Helper Functions (additions to `db/hub.py`)

**File:** `sensai-backend/src/api/db/hub.py`

**Add these functions:**

```python
async def create_thread(
    course_id: int,
    milestone_id: int,
    author_id: int,
    title: str,
    content: str,
    task_id: int = None,
) -> int:
    thread_id = await execute_db_operation(
        f"""
        INSERT INTO {hub_threads_table_name}
            (course_id, milestone_id, task_id, author_id, title, content, status)
        VALUES (?, ?, ?, ?, ?, ?, 'open')
        """,
        (course_id, milestone_id, task_id, author_id, title, content),
        get_last_row_id=True,
    )
    return thread_id


async def search_threads_by_title(
    milestone_id: int,
    query: str,
    limit: int = 5,
) -> List[Dict]:
    """Simple LIKE-based search for duplicate detection. 
    Can be upgraded to FTS5 in Stage 5."""
    search_term = f"%{query}%"
    rows = await execute_db_operation(
        f"""
        SELECT 
            t.id, t.course_id, t.milestone_id, t.task_id, t.author_id,
            t.title, t.content, t.status, t.upvote_count, t.reply_count,
            t.has_verified_reply, t.is_pinned, t.created_at, t.updated_at,
            u.first_name, u.last_name, u.email
        FROM {hub_threads_table_name} t
        LEFT JOIN {users_table_name} u ON t.author_id = u.id
        WHERE t.milestone_id = ? 
          AND t.deleted_at IS NULL
          AND (t.title LIKE ? OR t.content LIKE ?)
        ORDER BY t.upvote_count DESC, t.created_at DESC
        LIMIT ?
        """,
        (milestone_id, search_term, search_term, limit),
        fetch_all=True,
    )
    return [convert_thread_row_to_dict(row) for row in rows]
```

---

### 3. API Routes (additions to `routes/hub.py`)

**File:** `sensai-backend/src/api/routes/hub.py`

**Add imports:**

```python
from api.db.hub import (
    get_threads_for_milestone as get_threads_for_milestone_from_db,
    get_thread_count_for_milestone as get_thread_count_for_milestone_from_db,
    get_hub_stats_for_course as get_hub_stats_for_course_from_db,
    create_thread as create_thread_in_db,
    search_threads_by_title as search_threads_by_title_from_db,
)
from api.models import HubThreadResponse, HubThreadSortType, CreateThreadRequest, CreateThreadResponse
```

**Add these endpoints:**

```python
@router.post("/{milestone_id}/threads", response_model=CreateThreadResponse)
async def create_thread(
    milestone_id: int,
    request: CreateThreadRequest,
) -> CreateThreadResponse:
    thread_id = await create_thread_in_db(
        course_id=request.course_id,
        milestone_id=milestone_id,
        author_id=request.user_id,
        title=request.title,
        content=request.content,
        task_id=request.task_id,
    )
    return {"id": thread_id}


@router.get("/{milestone_id}/threads/search", response_model=List[HubThreadResponse])
async def search_threads(
    milestone_id: int,
    q: str = Query(..., min_length=3),
    limit: int = 5,
) -> List[HubThreadResponse]:
    return await search_threads_by_title_from_db(
        milestone_id=milestone_id,
        query=q,
        limit=limit,
    )
```

---

## Frontend Changes

### 4. API Functions (additions to `hub-api.ts`)

**File:** `sensai-frontend/src/lib/hub-api.ts`

**Add these functions:**

```typescript
export async function createThread(
  milestoneId: number,
  data: {
    title: string;
    content: string;
    course_id: number;
    user_id: number;
    task_id?: number;
  }
): Promise<{ id: number }> {
  const res = await fetch(`${BACKEND_URL}/hubs/${milestoneId}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create thread: ${res.status}`);
  return res.json();
}

export async function searchThreads(
  milestoneId: number,
  query: string,
  limit: number = 5
): Promise<HubThread[]> {
  const res = await fetch(
    `${BACKEND_URL}/hubs/${milestoneId}/threads/search?q=${encodeURIComponent(query)}&limit=${limit}`
  );
  if (!res.ok) throw new Error(`Failed to search threads: ${res.status}`);
  return res.json();
}
```

---

### 5. CreateThreadForm Component

**New file:** `sensai-frontend/src/components/hub/CreateThreadForm.tsx`

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { createThread, searchThreads } from "@/lib/hub-api";
import { HubThread } from "@/types/hub";
import { ArrowLeft, AlertTriangle, MessageSquare, Send } from "lucide-react";

interface CreateThreadFormProps {
  milestoneId: number;
  courseId: number;
  onSuccess?: () => void;
}

export default function CreateThreadForm({
  milestoneId,
  courseId,
  onSuccess,
}: CreateThreadFormProps) {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const schoolId = params?.id as string;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicates, setDuplicates] = useState<HubThread[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Debounced duplicate search
  useEffect(() => {
    if (title.length < 3) {
      setDuplicates([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchThreads(milestoneId, title);
        setDuplicates(results);
      } catch (err) {
        console.error("Duplicate search failed:", err);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [title, milestoneId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || !user?.id) return;

    setIsSubmitting(true);
    try {
      const result = await createThread(milestoneId, {
        title: title.trim(),
        content: content.trim(),
        course_id: courseId,
        user_id: parseInt(user.id),
      });

      if (onSuccess) onSuccess();
      router.push(
        `/school/${schoolId}/courses/${courseId}/hub/${milestoneId}`
      );
    } catch (err) {
      console.error("Failed to create thread:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-6">
      <button
        type="button"
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-6"
      >
        <ArrowLeft size={14} />
        Back to discussions
      </button>

      <h1 className="text-2xl font-semibold mb-6">Start a Discussion</h1>

      {/* Title */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1.5">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What's your question or topic?"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>

      {/* Duplicate warning */}
      {duplicates.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-amber-600" />
            <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
              Similar discussions exist
            </span>
          </div>
          <ul className="space-y-1">
            {duplicates.map((thread) => (
              <li key={thread.id}>
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/school/${schoolId}/courses/${courseId}/hub/${milestoneId}/t/${thread.id}`
                    )
                  }
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  <MessageSquare size={12} />
                  {thread.title}
                  <span className="text-gray-400 text-xs">
                    ({thread.reply_count} replies)
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Check if your question is already answered. You can still post if
            yours is different.
          </p>
        </div>
      )}

      {/* Content */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-1.5">Details</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Provide context, code snippets, or describe what you've tried..."
          rows={8}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          required
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isSubmitting || !title.trim() || !content.trim()}
        className="flex items-center gap-2 px-5 py-2.5 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
      >
        <Send size={14} />
        {isSubmitting ? "Posting..." : "Post Discussion"}
      </button>
    </form>
  );
}
```

---

### 6. ThreadCard Component

**New file:** `sensai-frontend/src/components/hub/ThreadCard.tsx`

```tsx
"use client";

import { HubThread } from "@/types/hub";
import { useParams, useRouter } from "next/navigation";
import {
  MessageSquare,
  ChevronUp,
  CheckCircle,
  Pin,
  Clock,
} from "lucide-react";

interface ThreadCardProps {
  thread: HubThread;
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
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function ThreadCard({ thread }: ThreadCardProps) {
  const router = useRouter();
  const params = useParams();
  const schoolId = params?.id as string;
  const courseId = params?.courseId as string;

  const authorName = [thread.author_first_name, thread.author_last_name]
    .filter(Boolean)
    .join(" ") || thread.author_email || "Anonymous";

  return (
    <button
      onClick={() =>
        router.push(
          `/school/${schoolId}/courses/${courseId}/hub/${thread.milestone_id}/t/${thread.id}`
        )
      }
      className="w-full text-left p-4 border border-gray-200 dark:border-gray-800 rounded-lg hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
    >
      <div className="flex items-start gap-3">
        {/* Vote count */}
        <div className="flex flex-col items-center min-w-[40px] pt-0.5">
          <ChevronUp size={16} className="text-gray-400" />
          <span className="text-sm font-medium">{thread.upvote_count}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {thread.is_pinned && (
              <Pin size={12} className="text-blue-500 flex-shrink-0" />
            )}
            {thread.has_verified_reply && (
              <CheckCircle
                size={12}
                className="text-green-500 flex-shrink-0"
              />
            )}
            <h3 className="font-medium text-sm truncate">{thread.title}</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">
            {thread.content}
          </p>
          <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
            <span>{authorName}</span>
            <span className="flex items-center gap-1">
              <Clock size={10} />
              {timeAgo(thread.created_at)}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare size={10} />
              {thread.reply_count}{" "}
              {thread.reply_count === 1 ? "reply" : "replies"}
            </span>
            {thread.status === "resolved" && (
              <span className="text-green-600 dark:text-green-400 font-medium">
                Resolved
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
```

---

### 7. ThreadFeed Component

**New file:** `sensai-frontend/src/components/hub/ThreadFeed.tsx`

```tsx
"use client";

import { useState, useEffect } from "react";
import { getHubThreads } from "@/lib/hub-api";
import { HubThread, ThreadSortType } from "@/types/hub";
import ThreadCard from "./ThreadCard";

interface ThreadFeedProps {
  milestoneId: number;
}

const SORT_OPTIONS: { value: ThreadSortType; label: string }[] = [
  { value: "recent", label: "Recent" },
  { value: "top", label: "Top Voted" },
  { value: "verified", label: "Verified" },
  { value: "unanswered", label: "Unanswered" },
];

export default function ThreadFeed({ milestoneId }: ThreadFeedProps) {
  const [threads, setThreads] = useState<HubThread[]>([]);
  const [sort, setSort] = useState<ThreadSortType>("recent");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);

  const loadThreads = async (resetPage = false) => {
    const targetPage = resetPage ? 1 : page;
    setIsLoading(true);
    try {
      const data = await getHubThreads(milestoneId, sort, targetPage);
      if (resetPage) {
        setThreads(data);
        setPage(1);
      } else {
        setThreads((prev) => [...prev, ...data]);
      }
      setHasMore(data.length === 20);
    } catch (err) {
      console.error("Failed to load threads:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadThreads(true);
  }, [milestoneId, sort]);

  const handleLoadMore = () => {
    setPage((prev) => prev + 1);
  };

  useEffect(() => {
    if (page > 1) loadThreads();
  }, [page]);

  return (
    <div>
      {/* Sort tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-800">
        {SORT_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => setSort(option.value)}
            className={`px-3 py-2 text-sm transition-colors ${
              sort === option.value
                ? "border-b-2 border-black dark:border-white font-medium"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Thread list */}
      <div className="space-y-2">
        {threads.map((thread) => (
          <ThreadCard key={thread.id} thread={thread} />
        ))}
      </div>

      {/* Loading / Load more */}
      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-t-2 border-b-2 rounded-full animate-spin border-black dark:border-white" />
        </div>
      )}

      {!isLoading && hasMore && threads.length > 0 && (
        <div className="flex justify-center py-4">
          <button
            onClick={handleLoadMore}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
```

---

### 8. Update Milestone Hub Page to use ThreadFeed

**File:** `sensai-frontend/src/app/school/[id]/courses/[courseId]/hub/[milestoneId]/page.tsx`

**Replace the entire file with:**

```tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getHubThreads } from "@/lib/hub-api";
import { HubThread } from "@/types/hub";
import { MessageSquarePlus, MessageSquare } from "lucide-react";
import ThreadFeed from "@/components/hub/ThreadFeed";

export default function MilestoneHubPage() {
  const params = useParams();
  const router = useRouter();
  const schoolId = params?.id as string;
  const courseId = params?.courseId as string;
  const milestoneId = params?.milestoneId as string;

  const [threadCount, setThreadCount] = useState<number | null>(null);

  useEffect(() => {
    async function loadCount() {
      try {
        const threads = await getHubThreads(parseInt(milestoneId), "recent", 1, 1);
        setThreadCount(threads.length > 0 ? -1 : 0); // -1 means "has threads"
      } catch {
        setThreadCount(0);
      }
    }
    loadCount();
  }, [milestoneId]);

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Discussions</h1>
        </div>
        <button
          onClick={() =>
            router.push(
              `/school/${schoolId}/courses/${courseId}/hub/${milestoneId}/ask`
            )
          }
          className="flex items-center gap-2 px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <MessageSquarePlus size={16} />
          Start Discussion
        </button>
      </div>

      {/* Feed */}
      <ThreadFeed milestoneId={parseInt(milestoneId)} />
    </div>
  );
}
```

---

### 9. Ask Page (Create Thread Route)

**New file:** `sensai-frontend/src/app/school/[id]/courses/[courseId]/hub/[milestoneId]/ask/page.tsx`

```tsx
"use client";

import { useParams } from "next/navigation";
import CreateThreadForm from "@/components/hub/CreateThreadForm";

export default function AskPage() {
  const params = useParams();
  const courseId = params?.courseId as string;
  const milestoneId = params?.milestoneId as string;

  return (
    <CreateThreadForm
      milestoneId={parseInt(milestoneId)}
      courseId={parseInt(courseId)}
    />
  );
}
```

---

## Files Summary

| Action | File Path |
|--------|-----------|
| **Modify** | `sensai-backend/src/api/models.py` -- add `CreateThreadRequest`, `CreateThreadResponse` |
| **Modify** | `sensai-backend/src/api/db/hub.py` -- add `create_thread()`, `search_threads_by_title()` |
| **Modify** | `sensai-backend/src/api/routes/hub.py` -- add `POST /{milestone_id}/threads`, `GET /{milestone_id}/threads/search` |
| **Modify** | `sensai-frontend/src/lib/hub-api.ts` -- add `createThread()`, `searchThreads()` |
| **Create** | `sensai-frontend/src/components/hub/CreateThreadForm.tsx` |
| **Create** | `sensai-frontend/src/components/hub/ThreadCard.tsx` |
| **Create** | `sensai-frontend/src/components/hub/ThreadFeed.tsx` |
| **Modify** | `sensai-frontend/src/app/school/[id]/courses/[courseId]/hub/[milestoneId]/page.tsx` -- use ThreadFeed + Start Discussion button |
| **Create** | `sensai-frontend/src/app/school/[id]/courses/[courseId]/hub/[milestoneId]/ask/page.tsx` |

---

## Testing Checklist

- [ ] `POST /hubs/1/threads` with `{title, content, course_id, user_id}` creates a thread and returns `{id}`
- [ ] `GET /hubs/1/threads?sort=recent` returns the newly created thread with author info
- [ ] `GET /hubs/1/threads/search?q=knapsack` returns matching threads
- [ ] Navigate to hub -> click "Start Discussion" -> fill form -> post -> redirected back to feed
- [ ] Typing a title shows duplicate warnings after 500ms debounce
- [ ] Clicking a duplicate link navigates to that thread
- [ ] Sort tabs switch between Recent, Top Voted, Verified, Unanswered
- [ ] Load more button appears when there are 20+ threads
