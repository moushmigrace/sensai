# Stage 1: Hub Foundation & Navigation

## Feature Delivered

After this stage, learners and mentors see a **"Discuss" button** on each module in their course view. Clicking it opens a new **Hub page** scoped to that module (milestone). The page shows an empty state with a call-to-action. The database tables and backend API foundation are established for all future stages.

---

## What Ships to Users

- A "Discuss" link/button appears next to each module in `LearnerCourseView` and `CourseModuleList`
- Clicking it navigates to `/school/[id]/courses/[courseId]/hub/[milestoneId]`
- The hub page shows the module name, an empty state message ("No discussions yet. Be the first to start one!"), and a disabled "Start Discussion" button (enabled in Stage 2)
- A sidebar lists all modules for the course so users can switch between hubs

---

## Backend Changes

### 1. Config Constants

**File:** `sensai-backend/src/api/config.py`

**Add after line 61** (after `assignment_table_name = "assignment"`):

```python
hub_threads_table_name = "hub_threads"
hub_replies_table_name = "hub_replies"
```

---

### 2. Database Tables

**File:** `sensai-backend/src/api/db/__init__.py`

**Add these imports at the top** (after the existing config imports around line 34):

```python
from api.config import (
    # ... existing imports ...
    hub_threads_table_name,
    hub_replies_table_name,
)
```

**Add these two new functions** (before `init_db`):

```python
async def create_hub_threads_table(cursor):
    await cursor.execute(
        f"""CREATE TABLE IF NOT EXISTS {hub_threads_table_name} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                course_id INTEGER NOT NULL,
                milestone_id INTEGER NOT NULL,
                task_id INTEGER,
                author_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'open',
                upvote_count INTEGER DEFAULT 0,
                reply_count INTEGER DEFAULT 0,
                has_verified_reply BOOLEAN DEFAULT FALSE,
                is_pinned BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                deleted_at DATETIME,
                FOREIGN KEY (course_id) REFERENCES {courses_table_name}(id) ON DELETE CASCADE,
                FOREIGN KEY (milestone_id) REFERENCES {milestones_table_name}(id) ON DELETE CASCADE,
                FOREIGN KEY (task_id) REFERENCES {tasks_table_name}(id) ON DELETE SET NULL,
                FOREIGN KEY (author_id) REFERENCES {users_table_name}(id) ON DELETE CASCADE
            )"""
    )

    await cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_hub_thread_milestone ON {hub_threads_table_name} (milestone_id)"
    )
    await cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_hub_thread_course ON {hub_threads_table_name} (course_id)"
    )
    await cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_hub_thread_author ON {hub_threads_table_name} (author_id)"
    )
    await cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_hub_thread_status ON {hub_threads_table_name} (status)"
    )
    await cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_hub_thread_task ON {hub_threads_table_name} (task_id)"
    )
    # Composite covering index for feed queries (sort by pinned → upvotes → recency).
    # Replaces the need for a separate sort pass on the result set.
    await cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_hub_thread_sort ON {hub_threads_table_name} "
        f"(milestone_id, is_pinned DESC, upvote_count DESC, created_at DESC)"
    )


async def create_hub_replies_table(cursor):
    await cursor.execute(
        f"""CREATE TABLE IF NOT EXISTS {hub_replies_table_name} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                thread_id INTEGER NOT NULL,
                author_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                upvote_count INTEGER DEFAULT 0,
                is_verified BOOLEAN DEFAULT FALSE,
                verified_by_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                deleted_at DATETIME,
                FOREIGN KEY (thread_id) REFERENCES {hub_threads_table_name}(id) ON DELETE CASCADE,
                FOREIGN KEY (author_id) REFERENCES {users_table_name}(id) ON DELETE CASCADE,
                FOREIGN KEY (verified_by_id) REFERENCES {users_table_name}(id) ON DELETE SET NULL
            )"""
    )

    await cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_hub_reply_thread ON {hub_replies_table_name} (thread_id)"
    )
    await cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_hub_reply_author ON {hub_replies_table_name} (author_id)"
    )
    # Composite index for SSE stream polling query:
    # "WHERE thread_id = ? AND id > ?" is a pure index scan with no table row reads.
    await cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_hub_reply_stream ON {hub_replies_table_name} (thread_id, id)"
    )
```

**Inside `init_db()` function**, add these calls before `await conn.commit()` (around line 711):

```python
            await create_hub_threads_table(cursor)
            await create_hub_replies_table(cursor)
```

---

### 3. Migration for Existing Databases

**File:** `sensai-backend/src/api/db/migration.py`

**Add this migration function:**

```python
async def create_hub_tables_migration():
    """Migration: Creates hub_threads and hub_replies tables (with all indexes) if they don't exist.

    Indexes created:
      hub_threads: idx_hub_thread_milestone, idx_hub_thread_course, idx_hub_thread_author,
                   idx_hub_thread_status, idx_hub_thread_task,
                   idx_hub_thread_sort (composite: milestone_id, is_pinned DESC, upvote_count DESC, created_at DESC)
      hub_replies:  idx_hub_reply_thread, idx_hub_reply_author,
                   idx_hub_reply_stream (composite: thread_id, id) — required for SSE polling
    """
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()

        from api.db import create_hub_threads_table, create_hub_replies_table

        await create_hub_threads_table(cursor)
        await create_hub_replies_table(cursor)

        await conn.commit()
```

**Update `run_migrations()` to call it:**

```python
async def run_migrations():
    await cleanup_invalid_chat_history()
    await create_hub_tables_migration()
```

---

### 4. Pydantic Models (Stage 1 subset)

**File:** `sensai-backend/src/api/models.py`

**Add at the end of the file:**

```python
# --- Hub Models (Stage 1) ---

class HubThreadStatus(str, Enum):
    OPEN = "open"
    RESOLVED = "resolved"

    def __str__(self):
        return self.value


class HubThreadSortType(str, Enum):
    TOP = "top"
    RECENT = "recent"
    VERIFIED = "verified"
    UNANSWERED = "unanswered"

    def __str__(self):
        return self.value


class HubThreadResponse(BaseModel):
    id: int
    course_id: int
    milestone_id: int
    task_id: Optional[int] = None
    author_id: int
    author_first_name: Optional[str] = None
    author_last_name: Optional[str] = None
    author_email: Optional[str] = None
    title: str
    content: str
    status: HubThreadStatus = HubThreadStatus.OPEN
    upvote_count: int = 0
    reply_count: int = 0
    has_verified_reply: bool = False
    is_pinned: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
```

---

### 5. DB Helper Module (Stage 1 subset)

**New file:** `sensai-backend/src/api/db/hub.py`

```python
from typing import List, Dict, Optional, Tuple
from api.utils.db import execute_db_operation, get_new_db_connection
from api.config import (
    hub_threads_table_name,
    hub_replies_table_name,
    users_table_name,
)


def convert_thread_row_to_dict(row: Tuple) -> Dict:
    return {
        "id": row[0],
        "course_id": row[1],
        "milestone_id": row[2],
        "task_id": row[3],
        "author_id": row[4],
        "title": row[5],
        "content": row[6],
        "status": row[7],
        "upvote_count": row[8],
        "reply_count": row[9],
        "has_verified_reply": bool(row[10]),
        "is_pinned": bool(row[11]),
        "created_at": row[12],
        "updated_at": row[13],
        "author_first_name": row[14] if len(row) > 14 else None,
        "author_last_name": row[15] if len(row) > 15 else None,
        "author_email": row[16] if len(row) > 16 else None,
    }


async def get_threads_for_milestone(
    milestone_id: int,
    sort: str = "recent",
    page: int = 1,
    limit: int = 20,
) -> List[Dict]:
    offset = (page - 1) * limit

    order_clause = "t.created_at DESC"
    if sort == "top":
        order_clause = "t.upvote_count DESC, t.created_at DESC"
    elif sort == "verified":
        order_clause = "t.has_verified_reply DESC, t.upvote_count DESC, t.created_at DESC"
    elif sort == "unanswered":
        order_clause = "t.reply_count ASC, t.created_at DESC"

    rows = await execute_db_operation(
        f"""
        SELECT 
            t.id, t.course_id, t.milestone_id, t.task_id, t.author_id,
            t.title, t.content, t.status, t.upvote_count, t.reply_count,
            t.has_verified_reply, t.is_pinned, t.created_at, t.updated_at,
            u.first_name, u.last_name, u.email
        FROM {hub_threads_table_name} t
        LEFT JOIN {users_table_name} u ON t.author_id = u.id
        WHERE t.milestone_id = ? AND t.deleted_at IS NULL
        ORDER BY t.is_pinned DESC, {order_clause}
        LIMIT ? OFFSET ?
        """,
        (milestone_id, limit, offset),
        fetch_all=True,
    )

    return [convert_thread_row_to_dict(row) for row in rows]


async def get_thread_count_for_milestone(milestone_id: int) -> int:
    result = await execute_db_operation(
        f"""
        SELECT COUNT(*) FROM {hub_threads_table_name}
        WHERE milestone_id = ? AND deleted_at IS NULL
        """,
        (milestone_id,),
        fetch_one=True,
    )
    return result[0] if result else 0


async def get_hub_stats_for_course(course_id: int) -> List[Dict]:
    """Get thread counts per milestone for a course (used by hub sidebar)."""
    rows = await execute_db_operation(
        f"""
        SELECT 
            milestone_id,
            COUNT(*) as thread_count,
            SUM(CASE WHEN status = 'open' AND reply_count = 0 THEN 1 ELSE 0 END) as unanswered_count
        FROM {hub_threads_table_name}
        WHERE course_id = ? AND deleted_at IS NULL
        GROUP BY milestone_id
        """,
        (course_id,),
        fetch_all=True,
    )
    return [
        {
            "milestone_id": row[0],
            "thread_count": row[1],
            "unanswered_count": row[2],
        }
        for row in rows
    ]
```

---

### 6. API Route (Stage 1 subset)

**New file:** `sensai-backend/src/api/routes/hub.py`

```python
from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict
from api.db.hub import (
    get_threads_for_milestone as get_threads_for_milestone_from_db,
    get_thread_count_for_milestone as get_thread_count_for_milestone_from_db,
    get_hub_stats_for_course as get_hub_stats_for_course_from_db,
)
from api.models import HubThreadResponse, HubThreadSortType

router = APIRouter()


@router.get("/{milestone_id}/threads", response_model=List[HubThreadResponse])
async def get_threads_for_milestone(
    milestone_id: int,
    sort: str = "recent",
    page: int = 1,
    limit: int = 20,
) -> List[HubThreadResponse]:
    threads = await get_threads_for_milestone_from_db(
        milestone_id=milestone_id,
        sort=sort,
        page=page,
        limit=limit,
    )
    return threads


@router.get("/{milestone_id}/threads/count")
async def get_thread_count(milestone_id: int) -> Dict:
    count = await get_thread_count_for_milestone_from_db(milestone_id)
    return {"count": count}


@router.get("/stats/course/{course_id}")
async def get_hub_stats_for_course(course_id: int) -> List[Dict]:
    return await get_hub_stats_for_course_from_db(course_id)
```

---

### 7. Register Hub Router

**File:** `sensai-backend/src/api/main.py`

**Add import** (line 28, after existing route imports):

```python
from api.routes import hub
```

**Add router registration** (after line 136, after integrations router):

```python
app.include_router(hub.router, prefix="/hubs", tags=["hubs"])
```

---

## Frontend Changes

### 8. TypeScript Types

**New file:** `sensai-frontend/src/types/hub.ts`

```typescript
export interface HubThread {
  id: number;
  course_id: number;
  milestone_id: number;
  task_id: number | null;
  author_id: number;
  author_first_name: string | null;
  author_last_name: string | null;
  author_email: string | null;
  title: string;
  content: string;
  status: 'open' | 'resolved';
  upvote_count: number;
  reply_count: number;
  has_verified_reply: boolean;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface HubStats {
  milestone_id: number;
  thread_count: number;
  unanswered_count: number;
}

export type ThreadSortType = 'top' | 'recent' | 'verified' | 'unanswered';
```

**Also update `sensai-frontend/src/types/index.ts`** -- add at the end:

```typescript
export * from './hub';
```

---

### 9. Hub API Functions

**New file:** `sensai-frontend/src/lib/hub-api.ts`

```typescript
import { HubThread, HubStats, ThreadSortType } from "@/types/hub";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export async function getHubThreads(
  milestoneId: number,
  sort: ThreadSortType = "recent",
  page: number = 1,
  limit: number = 20
): Promise<HubThread[]> {
  const res = await fetch(
    `${BACKEND_URL}/hubs/${milestoneId}/threads?sort=${sort}&page=${page}&limit=${limit}`
  );
  if (!res.ok) throw new Error(`Failed to fetch threads: ${res.status}`);
  return res.json();
}

export async function getHubStatsForCourse(
  courseId: number
): Promise<HubStats[]> {
  const res = await fetch(`${BACKEND_URL}/hubs/stats/course/${courseId}`);
  if (!res.ok) throw new Error(`Failed to fetch hub stats: ${res.status}`);
  return res.json();
}
```

---

### 10. Hub Layout Component

**New file:** `sensai-frontend/src/app/school/[id]/courses/[courseId]/hub/layout.tsx`

```tsx
"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/layout/header";
import { getCourseModules } from "@/lib/api";
import { getHubStatsForCourse } from "@/lib/hub-api";
import { HubStats } from "@/types/hub";
import { MessageSquare } from "lucide-react";

export default function HubLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const schoolId = params?.id as string;
  const courseId = params?.courseId as string;

  const [modules, setModules] = useState<any[]>([]);
  const [hubStats, setHubStats] = useState<HubStats[]>([]);
  const [courseName, setCourseName] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [courseData, stats] = await Promise.all([
          getCourseModules(courseId),
          getHubStatsForCourse(parseInt(courseId)),
        ]);
        setModules(courseData.modules);
        setCourseName(courseData.courseData.name);
        setHubStats(stats);
      } catch (err) {
        console.error("Failed to load hub data:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [courseId]);

  const getStatsForMilestone = (milestoneId: string) => {
    return hubStats.find((s) => s.milestone_id === parseInt(milestoneId));
  };

  const activeMilestoneId = pathname.match(/hub\/(\d+)/)?.[1];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-black">
        <Header showCreateCourseButton={false} />
        <div className="flex justify-center items-center py-12">
          <div className="w-12 h-12 border-t-2 border-b-2 rounded-full animate-spin border-black dark:border-white" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white">
      <Header showCreateCourseButton={false} />
      <div className="flex h-[calc(100vh-64px)]">
        {/* Sidebar */}
        <aside className="w-64 border-r border-gray-200 dark:border-gray-800 overflow-y-auto hidden lg:block">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            <button
              onClick={() => router.push(`/school/${schoolId}`)}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-2 flex items-center gap-1"
            >
              &larr; Back to course
            </button>
            <h2 className="font-semibold text-lg">{courseName}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Discussion Hubs</p>
          </div>
          <nav className="p-2">
            {modules.map((module) => {
              const stats = getStatsForMilestone(module.id);
              const isActive = activeMilestoneId === module.id;
              return (
                <button
                  key={module.id}
                  onClick={() =>
                    router.push(
                      `/school/${schoolId}/courses/${courseId}/hub/${module.id}`
                    )
                  }
                  className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 flex items-center justify-between transition-colors ${
                    isActive
                      ? "bg-gray-100 dark:bg-gray-800 font-medium"
                      : "hover:bg-gray-50 dark:hover:bg-gray-900"
                  }`}
                >
                  <span className="truncate text-sm">{module.title}</span>
                  {stats && stats.thread_count > 0 && (
                    <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <MessageSquare size={12} />
                      {stats.thread_count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
```

---

### 11. Hub Index Page (redirect to first module)

**New file:** `sensai-frontend/src/app/school/[id]/courses/[courseId]/hub/page.tsx`

```tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCourseModules } from "@/lib/api";

export default function HubIndexPage() {
  const params = useParams();
  const router = useRouter();
  const schoolId = params?.id as string;
  const courseId = params?.courseId as string;

  useEffect(() => {
    async function redirect() {
      try {
        const { modules } = await getCourseModules(courseId);
        if (modules.length > 0) {
          router.replace(
            `/school/${schoolId}/courses/${courseId}/hub/${modules[0].id}`
          );
        }
      } catch (err) {
        console.error("Failed to load modules for redirect:", err);
      }
    }
    redirect();
  }, [courseId, schoolId, router]);

  return (
    <div className="flex justify-center items-center h-full">
      <div className="w-8 h-8 border-t-2 border-b-2 rounded-full animate-spin border-black dark:border-white" />
    </div>
  );
}
```

---

### 12. Milestone Hub Page (empty state for Stage 1)

**New file:** `sensai-frontend/src/app/school/[id]/courses/[courseId]/hub/[milestoneId]/page.tsx`

```tsx
"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getHubThreads } from "@/lib/hub-api";
import { HubThread } from "@/types/hub";
import { MessageSquarePlus, MessageSquare } from "lucide-react";

export default function MilestoneHubPage() {
  const params = useParams();
  const milestoneId = params?.milestoneId as string;

  const [threads, setThreads] = useState<HubThread[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadThreads() {
      try {
        setIsLoading(true);
        const data = await getHubThreads(parseInt(milestoneId));
        setThreads(data);
      } catch (err) {
        console.error("Failed to load threads:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadThreads();
  }, [milestoneId]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-8 h-8 border-t-2 border-b-2 rounded-full animate-spin border-black dark:border-white" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Discussions</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {threads.length} {threads.length === 1 ? "thread" : "threads"}
          </p>
        </div>
        {/* Start Discussion button - placeholder for Stage 2 */}
        <button
          disabled
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-400 rounded-lg cursor-not-allowed text-sm"
          title="Coming soon"
        >
          <MessageSquarePlus size={16} />
          Start Discussion
        </button>
      </div>

      {/* Empty state */}
      {threads.length === 0 && (
        <div className="text-center py-16 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl">
          <MessageSquare
            size={48}
            className="mx-auto mb-4 text-gray-300 dark:text-gray-600"
          />
          <h3 className="text-lg font-medium mb-2">No discussions yet</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm mx-auto">
            Be the first to start a discussion about this module. Ask questions,
            share insights, or help your peers.
          </p>
        </div>
      )}

      {/* Thread list placeholder - populated from Stage 2 */}
      {threads.length > 0 && (
        <div className="space-y-3">
          {threads.map((thread) => (
            <div
              key={thread.id}
              className="p-4 border border-gray-200 dark:border-gray-800 rounded-lg"
            >
              <h3 className="font-medium">{thread.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                {thread.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

### 13. Navigation Integration -- Add "Discuss" Link to Course View

**File:** `sensai-frontend/src/components/CourseModuleList.tsx`

**What to change:** Inside the module header rendering (where module title and expand/collapse toggle are shown), add a small "Discuss" link button. Find the module header `div` that contains the module title and add a link icon next to it.

Locate the module title rendering section (approximately where `module.title` or `module.name` is displayed inside the `modules.map()` loop). Add this element next to the title:

```tsx
// Import at top of file
import { MessageSquare } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

// Inside the component, add:
const router = useRouter();
const params = useParams();
const schoolId = params?.id as string;

// Inside the module header, next to the title (only in mode="view"):
{mode === "view" && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      router.push(`/school/${schoolId}/courses/${courseId}/hub/${module.id}`);
    }}
    className="ml-2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
    title="Discuss this module"
  >
    <MessageSquare size={14} />
  </button>
)}
```

**Note:** The `courseId` needs to be passed as a prop to `CourseModuleList` if not already available. Check props -- if it's not present, add `courseId: string` to the component props.

---

## Files Summary

| Action | File Path | Notes |
|--------|-----------|-------|
| **Modify** | `sensai-backend/src/api/config.py` | Add 2 table name constants |
| **Modify** | `sensai-backend/src/api/db/__init__.py` | Add 2 create-table functions + register in `init_db()`. Includes `idx_hub_thread_sort` (composite covering index for feed sorting) and `idx_hub_reply_stream` (composite index for SSE polling — required for Stage 3 real-time) |
| **Modify** | `sensai-backend/src/api/db/migration.py` | Add `create_hub_tables_migration()` (creates tables + all indexes) + register in `run_migrations()` |
| **Modify** | `sensai-backend/src/api/models.py` | Add `HubThreadStatus`, `HubThreadSortType`, `HubThreadResponse` |
| **Modify** | `sensai-backend/src/api/main.py` | Import and register hub router |
| **Create** | `sensai-backend/src/api/db/hub.py` | DB helper functions |
| **Create** | `sensai-backend/src/api/routes/hub.py` | API endpoints |
| **Create** | `sensai-frontend/src/types/hub.ts` | TypeScript types |
| **Modify** | `sensai-frontend/src/types/index.ts` | Re-export hub types |
| **Create** | `sensai-frontend/src/lib/hub-api.ts` | API fetch functions |
| **Create** | `sensai-frontend/src/app/school/[id]/courses/[courseId]/hub/layout.tsx` | Hub shell with sidebar |
| **Create** | `sensai-frontend/src/app/school/[id]/courses/[courseId]/hub/page.tsx` | Redirect to first milestone |
| **Create** | `sensai-frontend/src/app/school/[id]/courses/[courseId]/hub/[milestoneId]/page.tsx` | Milestone hub page (empty state) |
| **Modify** | `sensai-frontend/src/components/CourseModuleList.tsx` | Add "Discuss" link button |

---

## Testing Checklist

- [ ] Run `python src/startup.py` to verify tables create successfully
- [ ] Hit `GET /hubs/1/threads` -- should return empty array
- [ ] Hit `GET /hubs/stats/course/1` -- should return empty array
- [ ] Navigate to `/school/[id]/courses/[courseId]/hub` -- should redirect to first milestone
- [ ] Hub sidebar shows all modules for the course
- [ ] "Discuss" icon appears next to each module in learner course view
- [ ] Empty state renders correctly in the hub page
