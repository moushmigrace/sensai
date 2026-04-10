# Stage 6: Reputation System, Knowledge Linking & Moderation

## Feature Delivered

After this stage, users earn **reputation points** for quality contributions. Threads can be **linked to specific tasks** (quizzes, assignments, learning material) creating a knowledge graph. Users can **bookmark threads**, **flag inappropriate content**, and mentors can **pin important threads**. A reputation leaderboard shows top contributors.

---

## What Ships to Users

- Reputation score badge next to every author name (thread cards, reply cards)
- Reputation rank tiers: Newcomer (0-9), Contributor (10-49), Expert (50-199), Guru (200+)
- "Discuss in Hub" button on quiz/assignment/learning material views
- Creating a thread from a task auto-links it (task chip shows on thread)
- Bookmark icon on threads (saves to personal bookmarks list)
- Flag button on threads/replies to report inappropriate content
- Mentors can pin threads (pinned threads always appear at top of feed)
- Reputation leaderboard page for top contributors per course
- Moderation queue for mentors/admins to review flagged content

---

## Prerequisites

Stages 1-5 must be completed.

---

## Backend Changes

### 1. Config Constants

**File:** `sensai-backend/src/api/config.py`

**Add:**

```python
user_reputation_table_name = "user_reputation"
hub_bookmarks_table_name = "hub_bookmarks"
hub_flags_table_name = "hub_flags"
```

---

### 2. Database Tables

**File:** `sensai-backend/src/api/db/__init__.py`

**Add imports and table creation functions:**

```python
from api.config import (
    # ... existing ...
    user_reputation_table_name,
    hub_bookmarks_table_name,
    hub_flags_table_name,
)


async def create_user_reputation_table(cursor):
    await cursor.execute(
        f"""CREATE TABLE IF NOT EXISTS {user_reputation_table_name} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                course_id INTEGER NOT NULL,
                score INTEGER DEFAULT 0,
                threads_created INTEGER DEFAULT 0,
                replies_given INTEGER DEFAULT 0,
                verified_answers INTEGER DEFAULT 0,
                upvotes_received INTEGER DEFAULT 0,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, course_id),
                FOREIGN KEY (user_id) REFERENCES {users_table_name}(id) ON DELETE CASCADE,
                FOREIGN KEY (course_id) REFERENCES {courses_table_name}(id) ON DELETE CASCADE
            )"""
    )

    await cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_reputation_user ON {user_reputation_table_name} (user_id)"
    )
    await cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_reputation_course ON {user_reputation_table_name} (course_id)"
    )
    await cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_reputation_score ON {user_reputation_table_name} (score DESC)"
    )


async def create_hub_bookmarks_table(cursor):
    await cursor.execute(
        f"""CREATE TABLE IF NOT EXISTS {hub_bookmarks_table_name} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                thread_id INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, thread_id),
                FOREIGN KEY (user_id) REFERENCES {users_table_name}(id) ON DELETE CASCADE,
                FOREIGN KEY (thread_id) REFERENCES {hub_threads_table_name}(id) ON DELETE CASCADE
            )"""
    )

    await cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_bookmark_user ON {hub_bookmarks_table_name} (user_id)"
    )


async def create_hub_flags_table(cursor):
    await cursor.execute(
        f"""CREATE TABLE IF NOT EXISTS {hub_flags_table_name} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reporter_id INTEGER NOT NULL,
                target_type TEXT NOT NULL,
                target_id INTEGER NOT NULL,
                reason TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                reviewed_by_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (reporter_id) REFERENCES {users_table_name}(id),
                FOREIGN KEY (reviewed_by_id) REFERENCES {users_table_name}(id)
            )"""
    )

    await cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_flag_status ON {hub_flags_table_name} (status)"
    )
    await cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_flag_target ON {hub_flags_table_name} (target_type, target_id)"
    )
```

**Register all three in `init_db()`.**

---

### 3. Migration

**File:** `sensai-backend/src/api/db/migration.py`

**Update migration to include all Stage 6 tables:**

```python
async def create_hub_tables_migration():
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()

        from api.db import (
            create_hub_threads_table,
            create_hub_replies_table,
            create_hub_votes_table,
            create_hub_fts_table,
            create_user_reputation_table,
            create_hub_bookmarks_table,
            create_hub_flags_table,
        )

        await create_hub_threads_table(cursor)
        await create_hub_replies_table(cursor)
        await create_hub_votes_table(cursor)
        await create_hub_fts_table(cursor)
        await create_user_reputation_table(cursor)
        await create_hub_bookmarks_table(cursor)
        await create_hub_flags_table(cursor)

        await conn.commit()
```

---

### 4. Pydantic Models

**File:** `sensai-backend/src/api/models.py`

**Add:**

```python
class UserReputationResponse(BaseModel):
    user_id: int
    course_id: int
    score: int = 0
    threads_created: int = 0
    replies_given: int = 0
    verified_answers: int = 0
    upvotes_received: int = 0
    rank: str = "Newcomer"


class ReputationLeaderboardEntry(BaseModel):
    user_id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    score: int = 0
    rank: str = "Newcomer"


class BookmarkRequest(BaseModel):
    user_id: int
    thread_id: int


class FlagRequest(BaseModel):
    reporter_id: int
    target_type: str  # "thread" | "reply"
    target_id: int
    reason: str


class ReviewFlagRequest(BaseModel):
    reviewed_by_id: int
    action: str  # "dismiss" | "remove"


class PinThreadRequest(BaseModel):
    user_id: int
```

---

### 5. DB Helper Functions

**File:** `sensai-backend/src/api/db/hub.py`

**Add imports:**

```python
from api.config import (
    hub_threads_table_name,
    hub_replies_table_name,
    hub_votes_table_name,
    user_reputation_table_name,
    hub_bookmarks_table_name,
    hub_flags_table_name,
    users_table_name,
)
```

**Add reputation functions:**

```python
def get_rank_for_score(score: int) -> str:
    if score >= 200:
        return "Guru"
    elif score >= 50:
        return "Expert"
    elif score >= 10:
        return "Contributor"
    return "Newcomer"


async def update_reputation(
    user_id: int, course_id: int, score_delta: int, field: str = None
) -> None:
    """Upsert reputation row and adjust score + optional field counter."""
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()

        # Upsert the reputation row
        await cursor.execute(
            f"""
            INSERT INTO {user_reputation_table_name} (user_id, course_id, score)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id, course_id) DO UPDATE SET
                score = score + ?,
                updated_at = CURRENT_TIMESTAMP
            """,
            (user_id, course_id, max(0, score_delta), score_delta),
        )

        # Increment the specific counter field if provided
        if field and field in ("threads_created", "replies_given", "verified_answers", "upvotes_received"):
            await cursor.execute(
                f"""
                UPDATE {user_reputation_table_name}
                SET {field} = {field} + 1
                WHERE user_id = ? AND course_id = ?
                """,
                (user_id, course_id),
            )

        await conn.commit()


async def get_user_reputation(user_id: int, course_id: int) -> Dict:
    row = await execute_db_operation(
        f"""
        SELECT user_id, course_id, score, threads_created, replies_given,
               verified_answers, upvotes_received
        FROM {user_reputation_table_name}
        WHERE user_id = ? AND course_id = ?
        """,
        (user_id, course_id),
        fetch_one=True,
    )

    if not row:
        return {
            "user_id": user_id,
            "course_id": course_id,
            "score": 0,
            "threads_created": 0,
            "replies_given": 0,
            "verified_answers": 0,
            "upvotes_received": 0,
            "rank": "Newcomer",
        }

    score = row[2]
    return {
        "user_id": row[0],
        "course_id": row[1],
        "score": score,
        "threads_created": row[3],
        "replies_given": row[4],
        "verified_answers": row[5],
        "upvotes_received": row[6],
        "rank": get_rank_for_score(score),
    }


async def get_reputation_leaderboard(course_id: int, limit: int = 20) -> List[Dict]:
    rows = await execute_db_operation(
        f"""
        SELECT r.user_id, u.first_name, u.last_name, u.email, r.score
        FROM {user_reputation_table_name} r
        LEFT JOIN {users_table_name} u ON r.user_id = u.id
        WHERE r.course_id = ? AND r.score > 0
        ORDER BY r.score DESC
        LIMIT ?
        """,
        (course_id, limit),
        fetch_all=True,
    )

    return [
        {
            "user_id": row[0],
            "first_name": row[1],
            "last_name": row[2],
            "email": row[3],
            "score": row[4],
            "rank": get_rank_for_score(row[4]),
        }
        for row in rows
    ]
```

**Add bookmark functions:**

```python
async def bookmark_thread(user_id: int, thread_id: int) -> None:
    await execute_db_operation(
        f"""
        INSERT OR IGNORE INTO {hub_bookmarks_table_name} (user_id, thread_id)
        VALUES (?, ?)
        """,
        (user_id, thread_id),
    )


async def unbookmark_thread(user_id: int, thread_id: int) -> None:
    await execute_db_operation(
        f"""
        DELETE FROM {hub_bookmarks_table_name}
        WHERE user_id = ? AND thread_id = ?
        """,
        (user_id, thread_id),
    )


async def get_user_bookmarks(user_id: int, course_id: int) -> List[Dict]:
    rows = await execute_db_operation(
        f"""
        SELECT 
            t.id, t.course_id, t.milestone_id, t.task_id, t.author_id,
            t.title, t.content, t.status, t.upvote_count, t.reply_count,
            t.has_verified_reply, t.is_pinned, t.created_at, t.updated_at,
            u.first_name, u.last_name, u.email
        FROM {hub_bookmarks_table_name} b
        JOIN {hub_threads_table_name} t ON b.thread_id = t.id
        LEFT JOIN {users_table_name} u ON t.author_id = u.id
        WHERE b.user_id = ? AND t.course_id = ? AND t.deleted_at IS NULL
        ORDER BY b.created_at DESC
        """,
        (user_id, course_id),
        fetch_all=True,
    )
    return [convert_thread_row_to_dict(row) for row in rows]


async def is_thread_bookmarked(user_id: int, thread_id: int) -> bool:
    row = await execute_db_operation(
        f"SELECT 1 FROM {hub_bookmarks_table_name} WHERE user_id = ? AND thread_id = ?",
        (user_id, thread_id),
        fetch_one=True,
    )
    return row is not None
```

**Add flag functions:**

```python
async def flag_content(
    reporter_id: int, target_type: str, target_id: int, reason: str
) -> int:
    return await execute_db_operation(
        f"""
        INSERT INTO {hub_flags_table_name} (reporter_id, target_type, target_id, reason)
        VALUES (?, ?, ?, ?)
        """,
        (reporter_id, target_type, target_id, reason),
        get_last_row_id=True,
    )


async def get_pending_flags(course_id: int) -> List[Dict]:
    rows = await execute_db_operation(
        f"""
        SELECT f.id, f.reporter_id, f.target_type, f.target_id, f.reason,
               f.status, f.created_at,
               u.first_name, u.last_name
        FROM {hub_flags_table_name} f
        LEFT JOIN {users_table_name} u ON f.reporter_id = u.id
        WHERE f.status = 'pending'
        ORDER BY f.created_at ASC
        """,
        fetch_all=True,
    )
    return [
        {
            "id": row[0],
            "reporter_id": row[1],
            "target_type": row[2],
            "target_id": row[3],
            "reason": row[4],
            "status": row[5],
            "created_at": row[6],
            "reporter_name": f"{row[7] or ''} {row[8] or ''}".strip(),
        }
        for row in rows
    ]


async def review_flag(flag_id: int, reviewed_by_id: int, action: str) -> None:
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()

        if action == "remove":
            # Get the flag details to find the target
            await cursor.execute(
                f"SELECT target_type, target_id FROM {hub_flags_table_name} WHERE id = ?",
                (flag_id,),
            )
            flag = await cursor.fetchone()
            if flag:
                target_type, target_id = flag
                target_table = hub_threads_table_name if target_type == "thread" else hub_replies_table_name
                await cursor.execute(
                    f"UPDATE {target_table} SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (target_id,),
                )

        # Update flag status
        await cursor.execute(
            f"""
            UPDATE {hub_flags_table_name}
            SET status = 'reviewed', reviewed_by_id = ?
            WHERE id = ?
            """,
            (reviewed_by_id, flag_id),
        )

        await conn.commit()


async def pin_thread(thread_id: int, is_pinned: bool) -> None:
    await execute_db_operation(
        f"""
        UPDATE {hub_threads_table_name}
        SET is_pinned = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND deleted_at IS NULL
        """,
        (is_pinned, thread_id),
    )


async def get_threads_for_task(task_id: int) -> List[Dict]:
    """Get all discussion threads linked to a specific task."""
    rows = await execute_db_operation(
        f"""
        SELECT 
            t.id, t.course_id, t.milestone_id, t.task_id, t.author_id,
            t.title, t.content, t.status, t.upvote_count, t.reply_count,
            t.has_verified_reply, t.is_pinned, t.created_at, t.updated_at,
            u.first_name, u.last_name, u.email
        FROM {hub_threads_table_name} t
        LEFT JOIN {users_table_name} u ON t.author_id = u.id
        WHERE t.task_id = ? AND t.deleted_at IS NULL
        ORDER BY t.upvote_count DESC, t.created_at DESC
        """,
        (task_id,),
        fetch_all=True,
    )
    return [convert_thread_row_to_dict(row) for row in rows]
```

---

### 6. Integrate Reputation with Existing Actions

**Modify existing functions in `db/hub.py`** to trigger reputation updates:

In `create_thread()` -- add at the end:

```python
    # Update reputation: +2 for creating a thread
    await update_reputation(author_id, course_id, 2, "threads_created")
```

In `create_reply()` -- add inside the transaction, after inserting reply:

```python
        # Get course_id from thread
        await cursor.execute(
            f"SELECT course_id FROM {hub_threads_table_name} WHERE id = ?",
            (thread_id,),
        )
        course_row = await cursor.fetchone()
        if course_row:
            # +2 reputation for replying (done outside transaction)
            pass  # call update_reputation after commit

    # After the commit:
    # Fetch course_id and update reputation
    thread_data = await execute_db_operation(
        f"SELECT course_id FROM {hub_threads_table_name} WHERE id = ?",
        (thread_id,),
        fetch_one=True,
    )
    if thread_data:
        await update_reputation(author_id, thread_data[0], 2, "replies_given")
```

In `cast_vote()` -- after updating the vote, update reputation for the content author:

```python
        # Update reputation for the content author
        if new_vote_value is not None:
            # Get course_id from the target
            if target_type == "thread":
                await cursor.execute(
                    f"SELECT course_id, author_id FROM {hub_threads_table_name} WHERE id = ?",
                    (target_id,),
                )
            else:
                await cursor.execute(
                    f"""
                    SELECT t.course_id, r.author_id
                    FROM {hub_replies_table_name} r
                    JOIN {hub_threads_table_name} t ON r.thread_id = t.id
                    WHERE r.id = ?
                    """,
                    (target_id,),
                )
            target_row = await cursor.fetchone()
            # Reputation update will be handled after commit
```

In `verify_reply()` -- add reputation bonus:

```python
        # Get reply author and course_id for reputation
        await cursor.execute(
            f"""
            SELECT r.author_id, t.course_id
            FROM {hub_replies_table_name} r
            JOIN {hub_threads_table_name} t ON r.thread_id = t.id
            WHERE r.id = ?
            """,
            (reply_id,),
        )
        rep_row = await cursor.fetchone()

    # After commit, update reputation
    if rep_row:
        await update_reputation(rep_row[0], rep_row[1], 10, "verified_answers")
```

---

### 7. API Routes

**File:** `sensai-backend/src/api/routes/hub.py`

**Add endpoints:**

```python
from api.db.hub import (
    # ... existing ...
    get_user_reputation as get_user_reputation_from_db,
    get_reputation_leaderboard as get_reputation_leaderboard_from_db,
    bookmark_thread as bookmark_thread_in_db,
    unbookmark_thread as unbookmark_thread_in_db,
    get_user_bookmarks as get_user_bookmarks_from_db,
    is_thread_bookmarked as is_thread_bookmarked_from_db,
    flag_content as flag_content_in_db,
    get_pending_flags as get_pending_flags_from_db,
    review_flag as review_flag_in_db,
    pin_thread as pin_thread_in_db,
    get_threads_for_task as get_threads_for_task_from_db,
)
from api.models import (
    # ... existing ...
    UserReputationResponse,
    ReputationLeaderboardEntry,
    BookmarkRequest,
    FlagRequest,
    ReviewFlagRequest,
    PinThreadRequest,
)


# Reputation
@router.get("/reputation/{user_id}", response_model=UserReputationResponse)
async def get_user_reputation(user_id: int, course_id: int) -> UserReputationResponse:
    return await get_user_reputation_from_db(user_id, course_id)


@router.get("/reputation/leaderboard/{course_id}", response_model=List[ReputationLeaderboardEntry])
async def get_reputation_leaderboard(course_id: int, limit: int = 20) -> List[ReputationLeaderboardEntry]:
    return await get_reputation_leaderboard_from_db(course_id, limit)


# Bookmarks
@router.post("/bookmarks")
async def bookmark_thread(request: BookmarkRequest):
    await bookmark_thread_in_db(request.user_id, request.thread_id)
    return {"success": True}


@router.delete("/bookmarks/{thread_id}")
async def unbookmark_thread(thread_id: int, user_id: int):
    await unbookmark_thread_in_db(user_id, thread_id)
    return {"success": True}


@router.get("/bookmarks", response_model=List[HubThreadResponse])
async def get_user_bookmarks(user_id: int, course_id: int) -> List[HubThreadResponse]:
    return await get_user_bookmarks_from_db(user_id, course_id)


@router.get("/bookmarks/{thread_id}/check")
async def check_bookmark(thread_id: int, user_id: int) -> Dict:
    is_bookmarked = await is_thread_bookmarked_from_db(user_id, thread_id)
    return {"is_bookmarked": is_bookmarked}


# Flags
@router.post("/flags")
async def flag_content(request: FlagRequest):
    flag_id = await flag_content_in_db(
        request.reporter_id, request.target_type, request.target_id, request.reason
    )
    return {"id": flag_id}


@router.get("/flags", response_model=List[Dict])
async def get_pending_flags(course_id: int) -> List[Dict]:
    return await get_pending_flags_from_db(course_id)


@router.put("/flags/{flag_id}")
async def review_flag(flag_id: int, request: ReviewFlagRequest):
    await review_flag_in_db(flag_id, request.reviewed_by_id, request.action)
    return {"success": True}


# Pin
@router.put("/threads/{thread_id}/pin")
async def pin_thread(thread_id: int, request: PinThreadRequest):
    await pin_thread_in_db(thread_id, True)
    return {"success": True}


@router.put("/threads/{thread_id}/unpin")
async def unpin_thread(thread_id: int, request: PinThreadRequest):
    await pin_thread_in_db(thread_id, False)
    return {"success": True}


# Task linking
@router.get("/tasks/{task_id}/threads", response_model=List[HubThreadResponse])
async def get_threads_for_task(task_id: int) -> List[HubThreadResponse]:
    return await get_threads_for_task_from_db(task_id)
```

---

## Frontend Changes

### 8. ReputationBadge Component

**New file:** `sensai-frontend/src/components/hub/ReputationBadge.tsx`

```tsx
"use client";

import { Award } from "lucide-react";

interface ReputationBadgeProps {
  score: number;
  size?: "sm" | "md";
}

function getRank(score: number) {
  if (score >= 200) return { label: "Guru", color: "text-purple-600 dark:text-purple-400" };
  if (score >= 50) return { label: "Expert", color: "text-blue-600 dark:text-blue-400" };
  if (score >= 10) return { label: "Contributor", color: "text-green-600 dark:text-green-400" };
  return { label: "Newcomer", color: "text-gray-500 dark:text-gray-400" };
}

export default function ReputationBadge({ score, size = "sm" }: ReputationBadgeProps) {
  if (score <= 0) return null;
  const rank = getRank(score);
  const iconSize = size === "sm" ? 10 : 14;
  const textClass = size === "sm" ? "text-[10px]" : "text-xs";

  return (
    <span
      className={`inline-flex items-center gap-0.5 ${rank.color} ${textClass}`}
      title={`${rank.label} (${score} rep)`}
    >
      <Award size={iconSize} />
      {score}
    </span>
  );
}
```

---

### 9. Add "Discuss in Hub" to Learner Task Views

**File:** `sensai-frontend/src/components/LearnerCourseView.tsx`

Inside the task dialog (where `LearnerQuizView`, `LearnerAssignmentView`, or `LearningMaterialViewer` render), add a "Discuss" link below or beside the task content:

```tsx
import { MessageSquare } from "lucide-react";

// In the task dialog header or footer area:
{activeTaskItem && (
  <button
    onClick={() => {
      closeDialog();
      router.push(
        `/school/${schoolId}/courses/${courseId}/hub/${activeModuleId}?task_id=${activeTaskItem.id}`
      );
    }}
    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
  >
    <MessageSquare size={12} />
    Discuss in Hub
  </button>
)}
```

When creating a thread from this link, the `task_id` query param pre-fills the task link in `CreateThreadForm`.

**Update `CreateThreadForm.tsx`** to read `task_id` from URL:

```tsx
import { useSearchParams } from "next/navigation";

// Inside the component:
const searchParams = useSearchParams();
const prefilledTaskId = searchParams?.get("task_id");

// Pass to createThread call:
const result = await createThread(milestoneId, {
  title: title.trim(),
  content: content.trim(),
  course_id: courseId,
  user_id: parseInt(user.id),
  task_id: prefilledTaskId ? parseInt(prefilledTaskId) : undefined,
});
```

---

### 10. TaskLinkChip in ThreadCard

**New file:** `sensai-frontend/src/components/hub/TaskLinkChip.tsx`

```tsx
"use client";

import { BookOpen } from "lucide-react";

interface TaskLinkChipProps {
  taskId: number;
  taskTitle?: string;
}

export default function TaskLinkChip({ taskId, taskTitle }: TaskLinkChipProps) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded">
      <BookOpen size={10} />
      {taskTitle || `Task #${taskId}`}
    </span>
  );
}
```

Add to `ThreadCard.tsx` when `thread.task_id` is present:

```tsx
import TaskLinkChip from "./TaskLinkChip";

// In the thread title area:
{thread.task_id && (
  <TaskLinkChip taskId={thread.task_id} />
)}
```

---

### 11. Hub API additions

**File:** `sensai-frontend/src/lib/hub-api.ts`

```typescript
export async function getUserReputation(
  userId: number,
  courseId: number
): Promise<{
  score: number;
  rank: string;
  threads_created: number;
  replies_given: number;
  verified_answers: number;
}> {
  const res = await fetch(
    `${BACKEND_URL}/hubs/reputation/${userId}?course_id=${courseId}`
  );
  if (!res.ok) throw new Error(`Failed to fetch reputation: ${res.status}`);
  return res.json();
}

export async function getReputationLeaderboard(
  courseId: number,
  limit: number = 20
): Promise<Array<{
  user_id: number;
  first_name: string;
  last_name: string;
  score: number;
  rank: string;
}>> {
  const res = await fetch(
    `${BACKEND_URL}/hubs/reputation/leaderboard/${courseId}?limit=${limit}`
  );
  if (!res.ok) throw new Error(`Failed to fetch leaderboard: ${res.status}`);
  return res.json();
}

export async function bookmarkThread(
  userId: number,
  threadId: number
): Promise<void> {
  await fetch(`${BACKEND_URL}/hubs/bookmarks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, thread_id: threadId }),
  });
}

export async function unbookmarkThread(
  threadId: number,
  userId: number
): Promise<void> {
  await fetch(
    `${BACKEND_URL}/hubs/bookmarks/${threadId}?user_id=${userId}`,
    { method: "DELETE" }
  );
}

export async function flagContent(data: {
  reporter_id: number;
  target_type: "thread" | "reply";
  target_id: number;
  reason: string;
}): Promise<{ id: number }> {
  const res = await fetch(`${BACKEND_URL}/hubs/flags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to flag: ${res.status}`);
  return res.json();
}

export async function getThreadsForTask(
  taskId: number
): Promise<HubThread[]> {
  const res = await fetch(`${BACKEND_URL}/hubs/tasks/${taskId}/threads`);
  if (!res.ok) throw new Error(`Failed to fetch task threads: ${res.status}`);
  return res.json();
}
```

---

## Reputation Scoring Summary

| Action | Points | Counter Field | Anti-Gaming Rule |
|--------|--------|--------------|-----------------|
| Create a thread | +2 | `threads_created` | |
| Post a reply | +2 | `replies_given` | |
| Receive an upvote | +1 | `upvotes_received` | Cannot self-vote |
| Receive a downvote | -1 | | Cannot self-vote |
| Reply verified by mentor | +10 | `verified_answers` | Only mentors verify |
| Thread resolved | +3 | | Only author/mentor resolves |
| Frivolous downvoting | -1 (downvoter) | | Costs the downvoter too |

**Rank tiers:**
- **Newcomer**: 0-9 points
- **Contributor**: 10-49 points
- **Expert**: 50-199 points
- **Guru**: 200+ points

---

## Files Summary

| Action | File Path |
|--------|-----------|
| **Modify** | `sensai-backend/src/api/config.py` -- add 3 table name constants |
| **Modify** | `sensai-backend/src/api/db/__init__.py` -- add 3 create table functions, register in `init_db()` |
| **Modify** | `sensai-backend/src/api/db/migration.py` -- update migration |
| **Modify** | `sensai-backend/src/api/models.py` -- add 6 new Pydantic models |
| **Modify** | `sensai-backend/src/api/db/hub.py` -- add ~15 new functions (reputation, bookmark, flag, pin, task link) |
| **Modify** | `sensai-backend/src/api/routes/hub.py` -- add ~12 new endpoints |
| **Modify** | `sensai-backend/src/api/db/hub.py` -- integrate reputation updates into create_thread, create_reply, cast_vote, verify_reply |
| **Create** | `sensai-frontend/src/components/hub/ReputationBadge.tsx` |
| **Create** | `sensai-frontend/src/components/hub/TaskLinkChip.tsx` |
| **Modify** | `sensai-frontend/src/components/hub/ThreadCard.tsx` -- add ReputationBadge + TaskLinkChip |
| **Modify** | `sensai-frontend/src/components/hub/ReplyCard.tsx` -- add ReputationBadge |
| **Modify** | `sensai-frontend/src/components/hub/CreateThreadForm.tsx` -- read task_id from URL |
| **Modify** | `sensai-frontend/src/components/LearnerCourseView.tsx` -- add "Discuss in Hub" link |
| **Modify** | `sensai-frontend/src/lib/hub-api.ts` -- add reputation, bookmark, flag, task-link functions |

---

## Testing Checklist

- [ ] Creating a thread adds +2 to user reputation
- [ ] Posting a reply adds +2 to user reputation
- [ ] Receiving an upvote adds +1 to content author's reputation
- [ ] Verifying a reply adds +10 to reply author's reputation
- [ ] Reputation badge shows next to author names with correct tier
- [ ] Reputation leaderboard shows top contributors for a course
- [ ] Bookmark icon toggles on/off correctly
- [ ] Bookmarked threads appear in user's bookmarks list
- [ ] "Discuss in Hub" button on task views navigates to hub with task_id
- [ ] Thread created from task view shows task link chip
- [ ] Flag button opens reason input and submits flag
- [ ] Mentor sees pending flags in moderation queue
- [ ] Dismissing a flag removes it from queue
- [ ] "Remove" action on flag soft-deletes the flagged content
- [ ] Mentors can pin/unpin threads (pinned threads appear at top of feed)
