# Learning Network Platform -- Hubs, Reputation & Knowledge Graphs

## Master Implementation Plan

This document indexes the **6-stage feature rollout** for the Learning Network Platform. Each stage is a self-contained, deployable feature upgrade. Deploy one stage, the site gains a working feature. Deploy the next, another feature layers on top.

---

## Architecture Foundation

**Key Decision:** A Hub is NOT a separate database entity. A Hub is a **discussion layer on top of an existing Milestone (Module)**. This avoids schema bloat and leverages the existing `milestones` + `course_milestones` + `course_tasks` relationships. The URL pattern `/school/[id]/courses/[courseId]/hub/[milestoneId]` naturally scopes all threads.

**Tech Stack (unchanged):**
- Backend: FastAPI + SQLite (aiosqlite) + raw SQL
- Frontend: Next.js 15 App Router + React 19 + Tailwind v4 + Radix/shadcn-pattern
- Auth: NextAuth + Google OAuth (user roles from `user_cohorts.role`)
- Search: SQLite FTS5 (full-text search)

**Cross-Cohort Knowledge:** Threads are scoped to `course_id + milestone_id`, NOT to a specific cohort. All cohorts studying the same course share the same hub. Knowledge persists and compounds across cohorts.

---

## Stage Overview

| Stage | Feature | What Ships | Depends On |
|-------|---------|-----------|------------|
| **1** | [Hub Foundation & Navigation](STAGE-1-hub-foundation-navigation.md) | Hub entry point in UI, DB tables, route skeleton, empty hub shell | Nothing |
| **2** | [Thread Creation & Discussion Feed](STAGE-2-thread-creation-feed.md) | Create threads, browsable feed, sorting tabs, duplicate detection | Stage 1 |
| **3** | [Thread Detail & Reply System](STAGE-3-thread-detail-replies.md) | Full Q&A flow: click thread, see detail, post replies, reply sorting | Stage 2 |
| **4** | [Voting & Mentor Verification](STAGE-4-voting-verification.md) | Upvote/downvote, mentor verify answers, thread resolution | Stage 3 |
| **5** | [Search & Help Others Queue](STAGE-5-search-help-others.md) | FTS5 search, search bar, mentor "Help Others" answer queue | Stage 4 |
| **6** | [Reputation, Knowledge Linking & Moderation](STAGE-6-reputation-linking-moderation.md) | Reputation scores, task linking, bookmarks, flags, pin threads | Stage 5 |

---

## Database Tables Introduced (by Stage)

| Stage | Table | Purpose |
|-------|-------|---------|
| 1 | `hub_threads` | Discussion threads scoped to milestone + course |
| 1 | `hub_replies` | Replies/answers to threads |
| 4 | `hub_votes` | Upvote/downvote tracking (one per user per item) |
| 5 | `hub_threads_fts` | FTS5 virtual table for full-text search |
| 6 | `user_reputation` | Per-user, per-course reputation scores |
| 6 | `hub_bookmarks` | User bookmarked threads |
| 6 | `hub_flags` | Content flags for moderation |

---

## API Endpoints Introduced (by Stage)

| Stage | Method | Endpoint | Purpose |
|-------|--------|----------|---------|
| 1 | GET | `/hubs/{milestone_id}/threads` | List threads (paginated, sorted) |
| 1 | GET | `/hubs/{milestone_id}/threads/count` | Thread count |
| 1 | GET | `/hubs/stats/course/{course_id}` | Hub stats per milestone |
| 2 | POST | `/hubs/{milestone_id}/threads` | Create thread |
| 2 | GET | `/hubs/{milestone_id}/threads/search` | Search threads |
| 3 | GET | `/hubs/threads/{thread_id}` | Thread detail + replies |
| 3 | POST | `/hubs/threads/{thread_id}/replies` | Create reply |
| 3 | DELETE | `/hubs/threads/{thread_id}` | Delete thread |
| 3 | DELETE | `/hubs/replies/{reply_id}` | Delete reply |
| 4 | POST | `/hubs/votes` | Cast/toggle vote |
| 4 | GET | `/hubs/threads/{thread_id}/votes` | Get user's votes |
| 4 | PUT | `/hubs/replies/{reply_id}/verify` | Mentor verify reply |
| 4 | PUT | `/hubs/threads/{thread_id}/resolve` | Resolve thread |
| 5 | GET | `/hubs/{milestone_id}/threads/needs-attention` | Mentor answer queue |
| 6 | GET | `/hubs/reputation/{user_id}` | User reputation |
| 6 | GET | `/hubs/reputation/leaderboard/{course_id}` | Top contributors |
| 6 | POST | `/hubs/bookmarks` | Bookmark thread |
| 6 | DELETE | `/hubs/bookmarks/{thread_id}` | Unbookmark |
| 6 | GET | `/hubs/bookmarks` | List bookmarks |
| 6 | POST | `/hubs/flags` | Flag content |
| 6 | GET | `/hubs/flags` | Pending flags |
| 6 | PUT | `/hubs/flags/{flag_id}` | Review flag |
| 6 | PUT | `/hubs/threads/{thread_id}/pin` | Pin thread |
| 6 | GET | `/hubs/tasks/{task_id}/threads` | Threads for task |

---

## Frontend Routes Introduced

```
src/app/school/[id]/courses/[courseId]/hub/
  ├── layout.tsx                               (Stage 1)
  ├── page.tsx                                 (Stage 1 -- redirects to first module)
  └── [milestoneId]/
       ├── page.tsx                            (Stage 1 shell, Stage 2 feed)
       ├── ask/page.tsx                        (Stage 2)
       ├── answer/page.tsx                     (Stage 5)
       └── t/[threadId]/
            └── page.tsx                       (Stage 3)
```

---

## Frontend Components Introduced

| Stage | Component | Location |
|-------|-----------|----------|
| 2 | `CreateThreadForm` | `src/components/hub/CreateThreadForm.tsx` |
| 2 | `ThreadCard` | `src/components/hub/ThreadCard.tsx` |
| 2 | `ThreadFeed` | `src/components/hub/ThreadFeed.tsx` |
| 3 | `ReplyCard` | `src/components/hub/ReplyCard.tsx` |
| 4 | `VoteButton` | `src/components/hub/VoteButton.tsx` |
| 4 | `VerifyButton` | `src/components/hub/VerifyButton.tsx` |
| 5 | `HubSearchBar` | `src/components/hub/HubSearchBar.tsx` |
| 6 | `ReputationBadge` | `src/components/hub/ReputationBadge.tsx` |
| 6 | `TaskLinkChip` | `src/components/hub/TaskLinkChip.tsx` |

---

## Reputation Scoring System

| Action | Points | Anti-Gaming |
|--------|--------|-------------|
| Create thread | +2 | |
| Post reply | +2 | |
| Receive upvote | +1 | Self-vote blocked |
| Receive downvote | -1 | Self-vote blocked |
| Verified by mentor | +10 | Mentors only |
| Thread resolved | +3 | Author/mentor only |
| Downvoting others | -1 (costs you too) | Discourages frivolous downvoting |

**Rank Tiers:** Newcomer (0-9) < Contributor (10-49) < Expert (50-199) < Guru (200+)

---

## Files Modified Across All Stages

### Backend Modified
- `sensai-backend/src/api/config.py` -- 6 new table name constants
- `sensai-backend/src/api/models.py` -- ~20 new Pydantic models/enums
- `sensai-backend/src/api/db/__init__.py` -- 7 new create table functions
- `sensai-backend/src/api/db/migration.py` -- hub migration function
- `sensai-backend/src/api/main.py` -- register hub router

### Backend New
- `sensai-backend/src/api/db/hub.py` -- all hub DB operations (~30 functions)
- `sensai-backend/src/api/routes/hub.py` -- all hub API endpoints (~24 endpoints)

### Frontend New
- 6 page routes under `src/app/school/[id]/courses/[courseId]/hub/`
- 9 components under `src/components/hub/`
- `src/types/hub.ts` -- TypeScript interfaces
- `src/lib/hub-api.ts` -- API fetch functions

### Frontend Modified
- `src/components/CourseModuleList.tsx` -- "Discuss" link button
- `src/components/LearnerCourseView.tsx` -- "Discuss in Hub" from task dialog
- `src/types/index.ts` -- re-export hub types

---

## How to Implement

1. Read Stage 1 file, implement all changes, test, deploy
2. Read Stage 2 file, implement all changes, test, deploy
3. Continue sequentially through Stage 6
4. Each stage builds on the previous -- no conflicts between stages
5. Each stage file contains exact file paths, code snippets, and testing checklists
