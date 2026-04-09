# Stage 5: Search, Full-Text Search & "Help Others" Mentor Queue

## Feature Delivered

After this stage, users can **search discussions** within a hub using full-text search. Mentors get a dedicated **"Help Others"** queue showing all unanswered/unverified threads, enabling them to rapidly clear backlogs. The duplicate detection from Stage 2 is upgraded with proper FTS5 indexing.

---

## What Ships to Users

- A search bar at the top of the hub feed (searches thread titles and content)
- Real-time search results as the user types
- "Help Others" button visible to mentors in the hub header
- A dedicated "Answer Queue" page listing threads needing attention (no verified answer, unresolved)
- Upgraded duplicate detection using FTS5 (faster, ranked results)

---

## Prerequisites

Stages 1-4 must be completed.

---

## Backend Changes

### 1. FTS5 Virtual Table

**File:** `sensai-backend/src/api/db/__init__.py`

**Add this function:**

```python
async def create_hub_fts_table(cursor):
    """Create FTS5 virtual table for full-text search on hub threads."""
    await cursor.execute(
        f"""CREATE VIRTUAL TABLE IF NOT EXISTS hub_threads_fts USING fts5(
                title,
                content,
                content={hub_threads_table_name},
                content_rowid=id
            )"""
    )

    # Trigger to keep FTS in sync on INSERT
    await cursor.execute(f"DROP TRIGGER IF EXISTS hub_threads_fts_insert")
    await cursor.execute(
        f"""
        CREATE TRIGGER hub_threads_fts_insert AFTER INSERT ON {hub_threads_table_name}
        BEGIN
            INSERT INTO hub_threads_fts(rowid, title, content) VALUES (NEW.id, NEW.title, NEW.content);
        END
        """
    )

    # Trigger to keep FTS in sync on UPDATE
    await cursor.execute(f"DROP TRIGGER IF EXISTS hub_threads_fts_update")
    await cursor.execute(
        f"""
        CREATE TRIGGER hub_threads_fts_update AFTER UPDATE ON {hub_threads_table_name}
        BEGIN
            INSERT INTO hub_threads_fts(hub_threads_fts, rowid, title, content) VALUES ('delete', OLD.id, OLD.title, OLD.content);
            INSERT INTO hub_threads_fts(rowid, title, content) VALUES (NEW.id, NEW.title, NEW.content);
        END
        """
    )

    # Trigger to keep FTS in sync on DELETE
    await cursor.execute(f"DROP TRIGGER IF EXISTS hub_threads_fts_delete")
    await cursor.execute(
        f"""
        CREATE TRIGGER hub_threads_fts_delete AFTER DELETE ON {hub_threads_table_name}
        BEGIN
            INSERT INTO hub_threads_fts(hub_threads_fts, rowid, title, content) VALUES ('delete', OLD.id, OLD.title, OLD.content);
        END
        """
    )
```

**Register in `init_db()`:**

```python
            await create_hub_fts_table(cursor)
```

---

### 2. Migration

**File:** `sensai-backend/src/api/db/migration.py`

**Update `create_hub_tables_migration()`:**

```python
async def create_hub_tables_migration():
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()

        from api.db import (
            create_hub_threads_table,
            create_hub_replies_table,
            create_hub_votes_table,
            create_hub_fts_table,
        )

        await create_hub_threads_table(cursor)
        await create_hub_replies_table(cursor)
        await create_hub_votes_table(cursor)
        await create_hub_fts_table(cursor)

        # Populate FTS table with existing threads (for migration of existing data)
        await cursor.execute(
            f"""
            INSERT OR IGNORE INTO hub_threads_fts(rowid, title, content)
            SELECT id, title, content FROM {hub_threads_table_name}
            WHERE deleted_at IS NULL
            """
        )

        await conn.commit()
```

Note: Add `from api.config import hub_threads_table_name` at top of migration file if not already imported.

---

### 3. DB Helper Functions

**File:** `sensai-backend/src/api/db/hub.py`

**Replace `search_threads_by_title` with upgraded FTS5 version:**

```python
async def search_threads(
    milestone_id: int,
    query: str,
    limit: int = 10,
) -> List[Dict]:
    """
    Full-text search using FTS5.
    Falls back to LIKE-based search if FTS5 table doesn't exist.
    """
    try:
        # FTS5 search -- rank by relevance
        rows = await execute_db_operation(
            f"""
            SELECT 
                t.id, t.course_id, t.milestone_id, t.task_id, t.author_id,
                t.title, t.content, t.status, t.upvote_count, t.reply_count,
                t.has_verified_reply, t.is_pinned, t.created_at, t.updated_at,
                u.first_name, u.last_name, u.email
            FROM {hub_threads_table_name} t
            INNER JOIN hub_threads_fts fts ON t.id = fts.rowid
            LEFT JOIN {users_table_name} u ON t.author_id = u.id
            WHERE hub_threads_fts MATCH ? 
              AND t.milestone_id = ?
              AND t.deleted_at IS NULL
            ORDER BY rank
            LIMIT ?
            """,
            (query, milestone_id, limit),
            fetch_all=True,
        )
    except Exception:
        # Fallback to LIKE if FTS not available
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
            ORDER BY t.upvote_count DESC
            LIMIT ?
            """,
            (milestone_id, search_term, search_term, limit),
            fetch_all=True,
        )

    return [convert_thread_row_to_dict(row) for row in rows]


async def get_threads_needing_attention(
    milestone_id: int,
    page: int = 1,
    limit: int = 20,
) -> List[Dict]:
    """Get threads that need mentor attention: open, no verified reply."""
    offset = (page - 1) * limit
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
          AND t.status = 'open'
          AND t.has_verified_reply = FALSE
        ORDER BY 
            CASE WHEN t.reply_count = 0 THEN 0 ELSE 1 END ASC,
            t.created_at ASC
        LIMIT ? OFFSET ?
        """,
        (milestone_id, limit, offset),
        fetch_all=True,
    )
    return [convert_thread_row_to_dict(row) for row in rows]
```

---

### 4. API Routes

**File:** `sensai-backend/src/api/routes/hub.py`

**Update imports and add endpoints:**

```python
from api.db.hub import (
    # ... existing ...
    search_threads as search_threads_from_db,
    get_threads_needing_attention as get_threads_needing_attention_from_db,
)
```

**Replace the existing search endpoint and add needs-attention:**

```python
@router.get("/{milestone_id}/threads/search", response_model=List[HubThreadResponse])
async def search_threads(
    milestone_id: int,
    q: str = Query(..., min_length=2),
    limit: int = 10,
) -> List[HubThreadResponse]:
    return await search_threads_from_db(
        milestone_id=milestone_id,
        query=q,
        limit=limit,
    )


@router.get("/{milestone_id}/threads/needs-attention", response_model=List[HubThreadResponse])
async def get_threads_needing_attention(
    milestone_id: int,
    page: int = 1,
    limit: int = 20,
) -> List[HubThreadResponse]:
    return await get_threads_needing_attention_from_db(
        milestone_id=milestone_id,
        page=page,
        limit=limit,
    )
```

---

## Frontend Changes

### 5. API Functions

**File:** `sensai-frontend/src/lib/hub-api.ts`

**Add:**

```typescript
export async function getThreadsNeedingAttention(
  milestoneId: number,
  page: number = 1,
  limit: number = 20
): Promise<HubThread[]> {
  const res = await fetch(
    `${BACKEND_URL}/hubs/${milestoneId}/threads/needs-attention?page=${page}&limit=${limit}`
  );
  if (!res.ok)
    throw new Error(`Failed to fetch attention threads: ${res.status}`);
  return res.json();
}
```

---

### 6. HubSearchBar Component

**New file:** `sensai-frontend/src/components/hub/HubSearchBar.tsx`

```tsx
"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { searchThreads } from "@/lib/hub-api";
import { HubThread } from "@/types/hub";
import { Search, X, MessageSquare, CheckCircle } from "lucide-react";

interface HubSearchBarProps {
  milestoneId: number;
}

export default function HubSearchBar({ milestoneId }: HubSearchBarProps) {
  const router = useRouter();
  const params = useParams();
  const schoolId = params?.id as string;
  const courseId = params?.courseId as string;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HubThread[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const data = await searchThreads(milestoneId, query);
        setResults(data);
        setShowResults(true);
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, milestoneId]);

  return (
    <div className="relative mb-4">
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder="Search discussions..."
          className="w-full pl-9 pr-8 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setResults([]);
              setShowResults(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Search results dropdown */}
      {showResults && (
        <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {isSearching && (
            <div className="p-3 text-center text-sm text-gray-500">
              Searching...
            </div>
          )}
          {!isSearching && results.length === 0 && query.length >= 2 && (
            <div className="p-3 text-center text-sm text-gray-500">
              No results found
            </div>
          )}
          {results.map((thread) => (
            <button
              key={thread.id}
              onClick={() => {
                setShowResults(false);
                setQuery("");
                router.push(
                  `/school/${schoolId}/courses/${courseId}/hub/${milestoneId}/t/${thread.id}`
                );
              }}
              className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800 last:border-b-0"
            >
              <div className="flex items-center gap-2">
                {thread.has_verified_reply && (
                  <CheckCircle size={12} className="text-green-500 flex-shrink-0" />
                )}
                <span className="text-sm font-medium truncate">
                  {thread.title}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                <span>{thread.reply_count} replies</span>
                <span>{thread.upvote_count} votes</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Backdrop to close search */}
      {showResults && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setShowResults(false)}
        />
      )}
    </div>
  );
}
```

---

### 7. Answer Queue Page (Help Others)

**New file:** `sensai-frontend/src/app/school/[id]/courses/[courseId]/hub/[milestoneId]/answer/page.tsx`

```tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getThreadsNeedingAttention } from "@/lib/hub-api";
import { HubThread } from "@/types/hub";
import ThreadCard from "@/components/hub/ThreadCard";
import { ArrowLeft, HelpCircle } from "lucide-react";

export default function AnswerQueuePage() {
  const params = useParams();
  const router = useRouter();
  const schoolId = params?.id as string;
  const courseId = params?.courseId as string;
  const milestoneId = params?.milestoneId as string;

  const [threads, setThreads] = useState<HubThread[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getThreadsNeedingAttention(parseInt(milestoneId));
        setThreads(data);
      } catch (err) {
        console.error("Failed to load attention threads:", err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [milestoneId]);

  return (
    <div className="max-w-3xl mx-auto p-6">
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

      <div className="flex items-center gap-3 mb-6">
        <HelpCircle size={24} className="text-orange-500" />
        <div>
          <h1 className="text-2xl font-semibold">Help Others</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Threads that need answers or verification
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-t-2 border-b-2 rounded-full animate-spin border-black dark:border-white" />
        </div>
      )}

      {!isLoading && threads.length === 0 && (
        <div className="text-center py-16 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl">
          <HelpCircle
            size={48}
            className="mx-auto mb-4 text-gray-300 dark:text-gray-600"
          />
          <h3 className="text-lg font-medium mb-2">All caught up!</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            There are no threads needing attention right now.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {threads.map((thread) => (
          <ThreadCard key={thread.id} thread={thread} />
        ))}
      </div>
    </div>
  );
}
```

---

### 8. Update Milestone Hub Page -- Add Search + Help Others Button

**File:** `sensai-frontend/src/app/school/[id]/courses/[courseId]/hub/[milestoneId]/page.tsx`

**Add imports and components to the header area:**

```tsx
import HubSearchBar from "@/components/hub/HubSearchBar";
import { HelpCircle } from "lucide-react";

// In the JSX, add search bar below the header and "Help Others" button:

{/* Header */}
<div className="flex items-center justify-between mb-4">
  <h1 className="text-2xl font-semibold">Discussions</h1>
  <div className="flex items-center gap-2">
    {/* Help Others - mentor/admin only */}
    <button
      onClick={() =>
        router.push(
          `/school/${schoolId}/courses/${courseId}/hub/${milestoneId}/answer`
        )
      }
      className="flex items-center gap-1.5 px-3 py-2 border border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 rounded-lg text-sm hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
    >
      <HelpCircle size={14} />
      Help Others
    </button>
    <button
      onClick={() =>
        router.push(
          `/school/${schoolId}/courses/${courseId}/hub/${milestoneId}/ask`
        )
      }
      className="flex items-center gap-2 px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium hover:opacity-90"
    >
      <MessageSquarePlus size={16} />
      Start Discussion
    </button>
  </div>
</div>

{/* Search */}
<HubSearchBar milestoneId={parseInt(milestoneId)} />
```

---

## Files Summary

| Action | File Path |
|--------|-----------|
| **Modify** | `sensai-backend/src/api/db/__init__.py` -- add `create_hub_fts_table()`, register in `init_db()` |
| **Modify** | `sensai-backend/src/api/db/migration.py` -- update migration to include FTS + data populate |
| **Modify** | `sensai-backend/src/api/db/hub.py` -- replace `search_threads_by_title()` with FTS5 `search_threads()`, add `get_threads_needing_attention()` |
| **Modify** | `sensai-backend/src/api/routes/hub.py` -- update search endpoint, add needs-attention endpoint |
| **Modify** | `sensai-frontend/src/lib/hub-api.ts` -- add `getThreadsNeedingAttention()` |
| **Create** | `sensai-frontend/src/components/hub/HubSearchBar.tsx` |
| **Create** | `sensai-frontend/src/app/school/[id]/courses/[courseId]/hub/[milestoneId]/answer/page.tsx` |
| **Modify** | `sensai-frontend/src/app/school/[id]/courses/[courseId]/hub/[milestoneId]/page.tsx` -- add search bar + "Help Others" button |

---

## Testing Checklist

- [ ] Type in search bar -> results appear after 300ms debounce
- [ ] Search "knapsack" -> only relevant threads appear
- [ ] Click a search result -> navigates to thread detail
- [ ] Clear search -> dropdown closes
- [ ] "Help Others" button visible in hub header
- [ ] Answer queue page shows only open threads without verified replies
- [ ] Threads with zero replies appear first (most urgent)
- [ ] After verifying an answer (Stage 4), thread disappears from queue
- [ ] Empty state shows "All caught up!" when no threads need attention
- [ ] FTS5 migration populates existing thread data correctly
