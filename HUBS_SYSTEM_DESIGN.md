# Learning Network Platform — Complete System Design & DB Architecture
This document details the **existing system architecture**, the **existing database design**, and the comprehensive **Hubs system design to build on top** to support the Learning Network Platform, Reputation system, and future AI capabilities.

---

## 1. Existing System Structure & Flow

Based on a thorough review of the `backend/sensai-backend` and `frontend/sensai-frontend` directories, your current platform operates on a robust, lightweight stack.

### Stack Details
- **Frontend (`sensai-frontend`):** A React-based Next.js application utilizing TypeScript and Tailwind CSS for styling. It manages complex user interfaces for learning, quiz taking, and course navigation.
- **Backend (`sensai-backend`):** A Python Fast-API application. It uses Pydantic (`models.py`) to validate incoming JSON requests and outbound responses. 
- **Database Engine:** It relies heavily on raw SQLite wrapped with asynchronous execution (`aiosqlite`), managed within `src/api/db/__init__.py`.

### Existing User Flow
1. A Learner signs up/logs in and is tied to a specific `user_id`.
2. Through `user_cohorts`, they are mapped to an active `Cohort`.
3. The Cohort grants them access to a `Course`. 
4. The Course contains `Milestones` (which function conceptually as "Modules" or "Chapters").
5. Each Milestone acts as a container for learning modules, specifically pointing to `Tasks` (Quizzes, Subjective Assignments, Reading Materials).

---

## 2. Existing DB Design

Your current architecture heavily relies on relational Mapping Tables to tie entities together loosely. 

**Core Tables:**
- `organizations`: Top-level tenant.
- `users`: Stores all learners and mentors.
- `cohorts`: Groups users together.
- `courses`: The core learning product.
- `milestones`: The "Modules" inside a course.
- `tasks`: The actual unit of learning (e.g., A quiz).
- `questions`: Tied to tasks.

**Crucial Relational Maps (The "Glue"):**
- `user_cohorts`: Maps Users ↔ Cohorts (includes roles like `learner` vs `mentor`).
- `course_cohorts`: Maps Courses ↔ Cohorts.
- `course_milestones`: Maps Courses ↔ Milestones (defines the syllabus order).
- `course_tasks`: Maps Tasks ↔ Milestones ↔ Courses.

---

## 3. The New Hubs System Structure (Building on Top)

To build the Hubs feature efficiently without refactoring the old code, we will **use `Milestones` as the Hub boundary.** 

Automatically, when a user accesses a course, they can see a Hub for every Milestone that exists inside that Course.

### New Frontend Additions (`sensai-frontend`)
1. **Navigation:** Insert a "Hubs" dropdown in the main Course UI that fetches the Active Milestones.
2. **Hub Layout components:** 
   - `HubFeed.tsx`: Renders the sorted list of threads.
   - `HubThreadDetail.tsx`: Renders the question and all nested answers.
   - `DebounceSearchInput.tsx`: The input field that queries the backend in real-time to prevent duplicate questions.
3. **Mentor Dashboard:** An `Answer` page specifically filtering for zero-reply threads so Mentors can clear backlogs quickly.

### New Backend Additions (`sensai-backend`)
1. **New Router:** A new `src/api/routes/hubs.py` defining endpoints:
   - `GET /api/hubs/{milestone_id}/threads` (Get all questions for a module)
   - `POST /api/hubs/threads` (Ask a question)
   - `POST /api/hubs/threads/{thread_id}/replies` (Answer a question)
   - `POST /api/hubs/votes` (Upvote/Downvote)
   - `PUT /api/hubs/replies/{reply_id}/verify` (Mentor hits 'Verified')
2. **Reputation Logic:** Injecting logic in the voting/verification endpoints to automatically tally points to the `UserReputation` table.

---

## 4. The New Hubs Database Design (Optimal for Future AI)

This is the exact database schema to inject into `backend/sensai-backend/src/api/db/__init__.py`. 
It is highly optimized. Notice we are already adding `vector_embedding` and `ai_quality_score` columns. Even if they are `NULL` today, adding them now prevents painful database migrations when you wire up the OpenAI Knowledge Graph later.

### A. The Threads Table (Questions)
```sql
CREATE TABLE IF NOT EXISTS hub_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    milestone_id INTEGER NOT NULL, /* Maps directly to the existing syllabus */
    task_id INTEGER, /* Optional link if asking about a specific quiz */
    author_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    upvotes INTEGER DEFAULT 0,
    status TEXT DEFAULT 'open', /* 'open', 'resolved' */
    ai_quality_score INTEGER, /* Reserved for AI judging */
    vector_embedding TEXT, /* Reserved for OpenAI Semantics/Duplicates */
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_hub_threads_milestone ON hub_threads (milestone_id);
```

### B. The Replies Table (Answers)
```sql
CREATE TABLE IF NOT EXISTS hub_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    upvotes INTEGER DEFAULT 0,
    is_verified BOOLEAN DEFAULT 0, /* Mentor checking mechanism */
    verified_by_id INTEGER, /* Links to the Mentor who verified it */
    ai_quality_score INTEGER, /* Reserved for OpenAI validation */
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (thread_id) REFERENCES hub_threads(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_hub_replies_thread ON hub_replies (thread_id);
```

### C. The Votes Tracking Table
*Ensures users cannot blindly upvote the same comment 50 times.*
```sql
CREATE TABLE IF NOT EXISTS hub_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    item_type TEXT NOT NULL, /* 'thread' or 'reply' */
    item_id INTEGER NOT NULL, /* The Thread ID or Reply ID */
    vote_value INTEGER NOT NULL, /* 1 or -1 */
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, item_type, item_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_hub_votes_user ON hub_votes(user_id);
```

### D. The Gamification / Reputation Table
*Translates Upvotes and Verifications into a persistent global Knowledge Graph metric.*
```sql
CREATE TABLE IF NOT EXISTS user_reputations (
    user_id INTEGER PRIMARY KEY,
    score INTEGER DEFAULT 0, /* Peer Upvote = +1, Mentor Verification = +10 */
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## 5. Why this Architecture is "Perfect" for your AI Future
By structuring the Hub tightly around your **Milestones (Modules)** and including **Vector fields** immediately:
1. When you turn on OpenAI, you can run an embedding process on the `hub_threads.title` and store the array string in `vector_embedding`. Then, your Debounced search turns from standard text search into **Semantic AI Search** instantly catching duplicates.
2. The Database serves as a definitive **Knowledge Graph**. Because every Answer (`HubReply`) is tied to a user (`author_id`), and that Answer is tied to a `milestone_id` representing a skill... your Database inherently "knows" which users are the top experts for every single domain in your learning application.
