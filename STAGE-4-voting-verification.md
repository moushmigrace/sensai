# Stage 4: Voting & Mentor Verification

## Feature Delivered

After this stage, users can **upvote and downvote** threads and replies. **Mentors** can **verify** the best answer on a thread and **resolve** threads. This is the quality-signal layer that separates high-value content from noise.

---

## What Ships to Users

- Upvote/downvote arrows on every thread card and reply card (click to toggle)
- Optimistic UI: vote count updates instantly before server confirms
- Self-vote prevention: users cannot vote on their own content
- One vote per user per item (toggle: click again to remove vote)
- Mentors see a "Verify" shield icon on replies (not visible to learners)
- Clicking Verify marks the reply with a green checkmark badge
- Thread author and mentors see a "Mark Resolved" button on thread detail
- Verified replies float to the top of the reply list
- Thread cards in the feed show a green check when they have a verified reply

---

## Prerequisites

Stages 1-3 must be completed.

---

## Backend Changes

### 1. Config Constants

**File:** `sensai-backend/src/api/config.py`

**Add:**

```python
hub_votes_table_name = "hub_votes"
```

---

### 2. Database Table

**File:** `sensai-backend/src/api/db/__init__.py`

**Add import:**

```python
from api.config import hub_votes_table_name
```

**Add table creation function:**

```python
async def create_hub_votes_table(cursor):
    await cursor.execute(
        f"""CREATE TABLE IF NOT EXISTS {hub_votes_table_name} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                target_type TEXT NOT NULL,
                target_id INTEGER NOT NULL,
                vote_value INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, target_type, target_id),
                FOREIGN KEY (user_id) REFERENCES {users_table_name}(id) ON DELETE CASCADE
            )"""
    )

    await cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_hub_vote_user ON {hub_votes_table_name} (user_id)"
    )
    await cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_hub_vote_target ON {hub_votes_table_name} (target_type, target_id)"
    )
```

**Register in `init_db()`** (add call before `await conn.commit()`):

```python
            await create_hub_votes_table(cursor)
```

---

### 3. Migration

**File:** `sensai-backend/src/api/db/migration.py`

**Update `create_hub_tables_migration()`:**

```python
async def create_hub_tables_migration():
    """Migration: Creates hub tables if they don't exist."""
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()

        from api.db import (
            create_hub_threads_table,
            create_hub_replies_table,
            create_hub_votes_table,
        )

        await create_hub_threads_table(cursor)
        await create_hub_replies_table(cursor)
        await create_hub_votes_table(cursor)

        await conn.commit()
```

---

### 4. Pydantic Models

**File:** `sensai-backend/src/api/models.py`

**Add:**

```python
class VoteTargetType(str, Enum):
    THREAD = "thread"
    REPLY = "reply"

    def __str__(self):
        return self.value


class CastVoteRequest(BaseModel):
    user_id: int
    target_type: VoteTargetType
    target_id: int
    vote_value: int  # +1 or -1


class CastVoteResponse(BaseModel):
    new_vote_value: Optional[int] = None  # null means vote was removed
    new_count: int


class VerifyReplyRequest(BaseModel):
    user_id: int  # the mentor verifying


class ResolveThreadRequest(BaseModel):
    user_id: int  # the user resolving (must be author or mentor)
```

---

### 5. DB Helper Functions

**File:** `sensai-backend/src/api/db/hub.py`

**Add import:**

```python
from api.config import (
    hub_threads_table_name,
    hub_replies_table_name,
    hub_votes_table_name,
    users_table_name,
)
```

**Add functions:**

```python
async def cast_vote(
    user_id: int, target_type: str, target_id: int, vote_value: int
) -> Dict:
    """
    Cast, change, or remove a vote.
    - If no existing vote: insert new vote
    - If same vote exists: remove it (toggle off)
    - If opposite vote exists: switch it
    Returns: {"new_vote_value": int|None, "new_count": int}
    """
    target_table = hub_threads_table_name if target_type == "thread" else hub_replies_table_name

    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()

        # Check if user is voting on their own content
        await cursor.execute(
            f"SELECT author_id FROM {target_table} WHERE id = ? AND deleted_at IS NULL",
            (target_id,),
        )
        owner_row = await cursor.fetchone()
        if not owner_row:
            raise ValueError("Target not found")
        if owner_row[0] == user_id:
            raise ValueError("Cannot vote on your own content")

        # Check for existing vote
        await cursor.execute(
            f"""
            SELECT id, vote_value FROM {hub_votes_table_name}
            WHERE user_id = ? AND target_type = ? AND target_id = ?
            """,
            (user_id, target_type, target_id),
        )
        existing = await cursor.fetchone()

        new_vote_value = None

        if existing:
            existing_id, existing_value = existing
            if existing_value == vote_value:
                # Same vote -> toggle off (remove)
                await cursor.execute(
                    f"DELETE FROM {hub_votes_table_name} WHERE id = ?",
                    (existing_id,),
                )
                # Undo the vote on target
                await cursor.execute(
                    f"UPDATE {target_table} SET upvote_count = upvote_count - ? WHERE id = ?",
                    (existing_value, target_id),
                )
                new_vote_value = None
            else:
                # Opposite vote -> switch
                await cursor.execute(
                    f"UPDATE {hub_votes_table_name} SET vote_value = ? WHERE id = ?",
                    (vote_value, existing_id),
                )
                # Remove old vote effect + apply new
                delta = vote_value - existing_value  # e.g., +1 - (-1) = +2
                await cursor.execute(
                    f"UPDATE {target_table} SET upvote_count = upvote_count + ? WHERE id = ?",
                    (delta, target_id),
                )
                new_vote_value = vote_value
        else:
            # No existing vote -> insert
            await cursor.execute(
                f"""
                INSERT INTO {hub_votes_table_name} (user_id, target_type, target_id, vote_value)
                VALUES (?, ?, ?, ?)
                """,
                (user_id, target_type, target_id, vote_value),
            )
            await cursor.execute(
                f"UPDATE {target_table} SET upvote_count = upvote_count + ? WHERE id = ?",
                (vote_value, target_id),
            )
            new_vote_value = vote_value

        # Fetch updated count
        await cursor.execute(
            f"SELECT upvote_count FROM {target_table} WHERE id = ?",
            (target_id,),
        )
        count_row = await cursor.fetchone()

        await conn.commit()

        return {
            "new_vote_value": new_vote_value,
            "new_count": count_row[0] if count_row else 0,
        }


async def get_user_votes_for_thread(user_id: int, thread_id: int) -> Dict:
    """Get user's votes for a thread and all its replies."""
    rows = await execute_db_operation(
        f"""
        SELECT target_type, target_id, vote_value
        FROM {hub_votes_table_name}
        WHERE user_id = ? AND (
            (target_type = 'thread' AND target_id = ?)
            OR (target_type = 'reply' AND target_id IN (
                SELECT id FROM {hub_replies_table_name} WHERE thread_id = ? AND deleted_at IS NULL
            ))
        )
        """,
        (user_id, thread_id, thread_id),
        fetch_all=True,
    )

    votes = {}
    for row in rows:
        key = f"{row[0]}_{row[1]}"  # e.g. "thread_5" or "reply_12"
        votes[key] = row[2]
    return votes


async def verify_reply(reply_id: int, verified_by_id: int) -> None:
    """Mark a reply as verified by a mentor. Also update thread's has_verified_reply."""
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()

        # Get thread_id
        await cursor.execute(
            f"SELECT thread_id FROM {hub_replies_table_name} WHERE id = ? AND deleted_at IS NULL",
            (reply_id,),
        )
        row = await cursor.fetchone()
        if not row:
            raise ValueError("Reply not found")

        thread_id = row[0]

        # Mark reply as verified
        await cursor.execute(
            f"""
            UPDATE {hub_replies_table_name}
            SET is_verified = TRUE, verified_by_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (verified_by_id, reply_id),
        )

        # Update thread's has_verified_reply flag
        await cursor.execute(
            f"""
            UPDATE {hub_threads_table_name}
            SET has_verified_reply = TRUE, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (thread_id,),
        )

        await conn.commit()


async def resolve_thread(thread_id: int) -> None:
    await execute_db_operation(
        f"""
        UPDATE {hub_threads_table_name}
        SET status = 'resolved', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND deleted_at IS NULL
        """,
        (thread_id,),
    )
```

---

### 6. API Routes

**File:** `sensai-backend/src/api/routes/hub.py`

**Add imports:**

```python
from api.db.hub import (
    # ... existing ...
    cast_vote as cast_vote_in_db,
    get_user_votes_for_thread as get_user_votes_for_thread_from_db,
    verify_reply as verify_reply_in_db,
    resolve_thread as resolve_thread_in_db,
)
from api.models import (
    # ... existing ...
    CastVoteRequest,
    CastVoteResponse,
    VerifyReplyRequest,
    ResolveThreadRequest,
)
```

**Add endpoints:**

```python
@router.post("/votes", response_model=CastVoteResponse)
async def cast_vote(request: CastVoteRequest) -> CastVoteResponse:
    try:
        result = await cast_vote_in_db(
            user_id=request.user_id,
            target_type=request.target_type.value,
            target_id=request.target_id,
            vote_value=request.vote_value,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/threads/{thread_id}/votes")
async def get_user_votes(thread_id: int, user_id: int) -> Dict:
    return await get_user_votes_for_thread_from_db(user_id, thread_id)


@router.put("/replies/{reply_id}/verify")
async def verify_reply(reply_id: int, request: VerifyReplyRequest):
    try:
        await verify_reply_in_db(reply_id, request.user_id)
        return {"success": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/threads/{thread_id}/resolve")
async def resolve_thread(thread_id: int, request: ResolveThreadRequest):
    await resolve_thread_in_db(thread_id)
    return {"success": True}
```

---

## Frontend Changes

### 7. API Functions

**File:** `sensai-frontend/src/lib/hub-api.ts`

**Add:**

```typescript
export async function castVote(data: {
  user_id: number;
  target_type: "thread" | "reply";
  target_id: number;
  vote_value: number;
}): Promise<{ new_vote_value: number | null; new_count: number }> {
  const res = await fetch(`${BACKEND_URL}/hubs/votes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Vote failed: ${res.status}`);
  }
  return res.json();
}

export async function getUserVotes(
  threadId: number,
  userId: number
): Promise<Record<string, number>> {
  const res = await fetch(
    `${BACKEND_URL}/hubs/threads/${threadId}/votes?user_id=${userId}`
  );
  if (!res.ok) throw new Error(`Failed to fetch votes: ${res.status}`);
  return res.json();
}

export async function verifyReply(
  replyId: number,
  userId: number
): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/hubs/replies/${replyId}/verify`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) throw new Error(`Failed to verify reply: ${res.status}`);
}

export async function resolveThread(
  threadId: number,
  userId: number
): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/hubs/threads/${threadId}/resolve`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) throw new Error(`Failed to resolve thread: ${res.status}`);
}
```

---

### 8. VoteButton Component

**New file:** `sensai-frontend/src/components/hub/VoteButton.tsx`

```tsx
"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { castVote } from "@/lib/hub-api";
import { ChevronUp, ChevronDown } from "lucide-react";

interface VoteButtonProps {
  targetType: "thread" | "reply";
  targetId: number;
  currentCount: number;
  userVote: number | null; // +1, -1, or null
  onVoteChange?: (newCount: number, newVote: number | null) => void;
}

export default function VoteButton({
  targetType,
  targetId,
  currentCount,
  userVote,
  onVoteChange,
}: VoteButtonProps) {
  const { user } = useAuth();
  const [count, setCount] = useState(currentCount);
  const [vote, setVote] = useState(userVote);
  const [isVoting, setIsVoting] = useState(false);

  const handleVote = async (value: number) => {
    if (!user?.id || isVoting) return;

    // Optimistic update
    const prevCount = count;
    const prevVote = vote;

    let optimisticCount = count;
    if (vote === value) {
      // Toggle off
      optimisticCount -= value;
      setVote(null);
    } else if (vote !== null) {
      // Switch vote
      optimisticCount += value - vote;
      setVote(value);
    } else {
      // New vote
      optimisticCount += value;
      setVote(value);
    }
    setCount(optimisticCount);

    setIsVoting(true);
    try {
      const result = await castVote({
        user_id: parseInt(user.id),
        target_type: targetType,
        target_id: targetId,
        vote_value: value,
      });
      setCount(result.new_count);
      setVote(result.new_vote_value);
      onVoteChange?.(result.new_count, result.new_vote_value);
    } catch (err) {
      // Revert on error
      setCount(prevCount);
      setVote(prevVote);
      console.error("Vote failed:", err);
    } finally {
      setIsVoting(false);
    }
  };

  return (
    <div className="flex flex-col items-center min-w-[36px]">
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleVote(1);
        }}
        disabled={isVoting}
        className={`p-0.5 rounded transition-colors ${
          vote === 1
            ? "text-orange-500"
            : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        }`}
      >
        <ChevronUp size={18} />
      </button>
      <span
        className={`text-sm font-medium ${
          vote === 1
            ? "text-orange-500"
            : vote === -1
            ? "text-blue-500"
            : ""
        }`}
      >
        {count}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleVote(-1);
        }}
        disabled={isVoting}
        className={`p-0.5 rounded transition-colors ${
          vote === -1
            ? "text-blue-500"
            : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        }`}
      >
        <ChevronDown size={18} />
      </button>
    </div>
  );
}
```

---

### 9. VerifyButton Component

**New file:** `sensai-frontend/src/components/hub/VerifyButton.tsx`

```tsx
"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { verifyReply } from "@/lib/hub-api";
import { ShieldCheck } from "lucide-react";

interface VerifyButtonProps {
  replyId: number;
  isVerified: boolean;
  userRole: string; // "mentor" | "learner" | "admin"
  onVerified?: () => void;
}

export default function VerifyButton({
  replyId,
  isVerified,
  userRole,
  onVerified,
}: VerifyButtonProps) {
  const { user } = useAuth();
  const [verified, setVerified] = useState(isVerified);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Only mentors and admins can verify
  if (userRole !== "mentor" && userRole !== "admin") return null;
  if (verified) return null; // Already verified

  const handleVerify = async () => {
    if (!user?.id || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await verifyReply(replyId, parseInt(user.id));
      setVerified(true);
      onVerified?.();
    } catch (err) {
      console.error("Verify failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <button
      onClick={handleVerify}
      disabled={isSubmitting}
      className="flex items-center gap-1 text-xs text-gray-500 hover:text-green-600 dark:text-gray-400 dark:hover:text-green-400 transition-colors"
      title="Verify this answer as correct"
    >
      <ShieldCheck size={14} />
      {isSubmitting ? "Verifying..." : "Verify"}
    </button>
  );
}
```

---

### 10. Update ThreadCard to use VoteButton

**File:** `sensai-frontend/src/components/hub/ThreadCard.tsx`

Replace the static vote column:

```tsx
// Before (static):
<div className="flex flex-col items-center min-w-[40px] pt-0.5">
  <ChevronUp size={16} className="text-gray-400" />
  <span className="text-sm font-medium">{thread.upvote_count}</span>
</div>

// After (interactive):
import VoteButton from "./VoteButton";

<VoteButton
  targetType="thread"
  targetId={thread.id}
  currentCount={thread.upvote_count}
  userVote={null}  // will be populated after Stage 4 API integration
/>
```

---

### 11. Update ReplyCard to use VoteButton and VerifyButton

**File:** `sensai-frontend/src/components/hub/ReplyCard.tsx`

Replace the static vote column and add VerifyButton:

```tsx
import VoteButton from "./VoteButton";
import VerifyButton from "./VerifyButton";

// Props change:
interface ReplyCardProps {
  reply: HubReply;
  userRole?: string;
  userVote?: number | null;
  onVerified?: () => void;
}

// In the component:
// Replace static ChevronUp with:
<VoteButton
  targetType="reply"
  targetId={reply.id}
  currentCount={reply.upvote_count}
  userVote={userVote ?? null}
/>

// Add after the reply content, before the author info:
<div className="flex items-center gap-3 mt-3">
  <VerifyButton
    replyId={reply.id}
    isVerified={reply.is_verified}
    userRole={userRole || "learner"}
    onVerified={onVerified}
  />
</div>
```

---

### 12. Update Thread Detail Page to Load User Votes and Resolve

**File:** `sensai-frontend/src/app/school/[id]/courses/[courseId]/hub/[milestoneId]/t/[threadId]/page.tsx`

Add to the thread detail page:

```tsx
import { getUserVotes, resolveThread } from "@/lib/hub-api";
import VoteButton from "@/components/hub/VoteButton";
import VerifyButton from "@/components/hub/VerifyButton";

// Add state:
const [userVotes, setUserVotes] = useState<Record<string, number>>({});
const [userRole, setUserRole] = useState<string>("learner");

// In loadThread, after setting thread and replies:
if (user?.id) {
  const votes = await getUserVotes(parseInt(threadId), parseInt(user.id));
  setUserVotes(votes);
}

// Add a "Mark Resolved" button (visible to thread author and mentors):
{thread && user && (parseInt(user.id) === thread.author_id || userRole === "mentor") && thread.status !== "resolved" && (
  <button
    onClick={async () => {
      await resolveThread(thread.id, parseInt(user.id));
      await loadThread();
    }}
    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
  >
    <CheckCircle size={14} />
    Mark as Resolved
  </button>
)}

// Pass userVotes to ReplyCard:
<ReplyCard
  key={reply.id}
  reply={reply}
  userRole={userRole}
  userVote={userVotes[`reply_${reply.id}`] ?? null}
  onVerified={loadThread}
/>
```

---

## Files Summary

| Action | File Path |
|--------|-----------|
| **Modify** | `sensai-backend/src/api/config.py` -- add `hub_votes_table_name` |
| **Modify** | `sensai-backend/src/api/db/__init__.py` -- add `create_hub_votes_table()`, register in `init_db()` |
| **Modify** | `sensai-backend/src/api/db/migration.py` -- update migration to include votes table |
| **Modify** | `sensai-backend/src/api/models.py` -- add `VoteTargetType`, `CastVoteRequest`, `CastVoteResponse`, `VerifyReplyRequest`, `ResolveThreadRequest` |
| **Modify** | `sensai-backend/src/api/db/hub.py` -- add `cast_vote()`, `get_user_votes_for_thread()`, `verify_reply()`, `resolve_thread()` |
| **Modify** | `sensai-backend/src/api/routes/hub.py` -- add `POST /votes`, `GET /threads/{id}/votes`, `PUT /replies/{id}/verify`, `PUT /threads/{id}/resolve` |
| **Modify** | `sensai-frontend/src/lib/hub-api.ts` -- add `castVote()`, `getUserVotes()`, `verifyReply()`, `resolveThread()` |
| **Create** | `sensai-frontend/src/components/hub/VoteButton.tsx` |
| **Create** | `sensai-frontend/src/components/hub/VerifyButton.tsx` |
| **Modify** | `sensai-frontend/src/components/hub/ThreadCard.tsx` -- replace static vote with VoteButton |
| **Modify** | `sensai-frontend/src/components/hub/ReplyCard.tsx` -- add VoteButton + VerifyButton |
| **Modify** | Thread detail page -- add user vote loading, resolve button, pass votes to cards |

---

## Testing Checklist

- [ ] Upvote a thread -> count goes up, arrow turns orange
- [ ] Click upvote again -> toggles off, count goes back down
- [ ] Downvote after upvote -> switches vote, count changes by 2
- [ ] Cannot vote on own thread/reply -> error handled gracefully
- [ ] Mentor sees "Verify" button on unverified replies
- [ ] Learner does NOT see "Verify" button
- [ ] Clicking Verify -> green checkmark appears, reply moves to top on reload
- [ ] Thread card shows green checkmark when thread has verified reply
- [ ] Thread author sees "Mark Resolved" button
- [ ] Clicking "Mark Resolved" -> status changes to "Resolved"
- [ ] Vote state persists across page reloads
