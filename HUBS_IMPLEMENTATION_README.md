# Learning Network Platform — Hubs, Reputation & Knowledge Graphs
## Implementation Plan & Code Architecture

### 1. Overview and Feedback on Plan

The proposed feature for **Topic-Based Hubs** is an excellent approach to solving the fragmented learning experience. Tying Q&A explicitly to the syllabus (modules) and elevating high-quality content via voting and verification ensures the hub becomes an asset rather than a noisy forum.

**Feedback / Adjustments for Better Architecture:**
1. **Module vs. Milestone:** In the backend `models.py`, what you architecturally call a "Module" is defined under the `Milestone` model (`Milestone` and `Task` relationships). So, technically, a "Hub" is directly tied to a **Milestone**. We don't need a separate "Hub" table; a Hub is functionally a view of Discussions filtered by `milestone_id`.
2. **Tab Naming UX:** Instead of "My Questions" (which implies *only* questions you asked), we should name the tabs **"Ask a Question"** and **"All Discussions"** to make navigation instantly clear to new users. 
3. **Duplicate Checking:** Searching for duplicates on the fly is brilliant. We can implement a server-side Debounced Text Search API across Thread titles/content. In the future, we can upgrade this to vector-based semantic search.
4. **The "Answer" View:** The button that takes you to a rect-card list of questions should filter strictly for "Unanswered" or "Unverified" questions, making it a powerful tool for mentors to clear backlogs.

---

## 2. Database Schema Additions (`backend/sensai-backend/src/api/models.py`)

We need to create the new data structures for SQLAlchemy / Pydantic. 

```python
class HubThreadStatus(str, Enum):
    OPEN = "open"
    RESOLVED = "resolved"

class HubThread(BaseModel):
    id: int
    course_id: int
    milestone_id: int  # The Module this thread belongs to
    task_id: Optional[int] = None # If linked directly to a quiz/assignment
    author_id: int
    title: str
    content: str
    upvotes: int = 0
    status: HubThreadStatus = HubThreadStatus.OPEN
    created_at: datetime
    updated_at: datetime

class HubReply(BaseModel):
    id: int
    thread_id: int
    author_id: int
    content: str
    upvotes: int = 0
    is_verified: bool = False
    verified_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

class VoteType(str, Enum):
    UPVOTE = "upvote"
    DOWNVOTE = "downvote"

class HubVote(BaseModel):
    id: int
    user_id: int
    item_type: Literal["thread", "reply"]
    item_id: int
    vote: VoteType

class UserReputation(BaseModel):
    user_id: int
    score: int = 0
```

---

## 3. Feature-by-Feature Implementation Guide

### Feature 1: Hub Routing & Navigation
**Goal:** Automatically assign Hub access when a Milestone exists.
- **Frontend (`frontend/sensai-frontend`):**
  - Update the Course Sidebar/Navbar. Fetch all `milestones` for a user's enrolled course.
  - Render a "Hubs" dropdown. List each module name (e.g., "Hub: Dynamic Programming").
  - Target Route: `/courses/[courseId]/hubs/[milestoneId]`
- **Backend (`backend/sensai-backend`):**
  - Ensure the existing endpoint extracting course structure includes active milestone IDs to feed the frontend dropdown. 

### Feature 2: Hub Feed ("All Discussions" / "General")
**Goal:** Display threads for a specific module, sorted by quality.
- **Frontend:**
  - Build `HubLayout` component.
  - Implement sorting toggles: "Top Voted", "Recent", "Verified".
  - Thread Card UI: Title, short preview, author name, upvote count, and a checkmark if it has a verified reply.
- **Backend:**
  - Create endpoint: `GET /api/hubs/{milestone_id}/threads?sort=top`
  - Logic: Fetch `HubThread`. Left join `HubReply` to identify if any reply `is_verified`. Sort appropriately.

### Feature 3: Asking a Question & Duplicate Detection
**Goal:** Prevent visual clutter by catching similar questions before posting.
- **Frontend:**
  - Add a "Start Discussion" button that opens a Modal or navigates to an input form.
  - On input change (`title`), trigger a debounced fetch (`useEffect` delay ~500ms).
  - If matches exist, block submission minimally and show an alert: "⚠️ Similar questions exist: [Link]". Allow overriding if it's uniquely different.
- **Backend:**
  - Create endpoint: `GET /api/hubs/{milestone_id}/threads/search?q={query}`
  - Logic: Use PostgreSQL `ILIKE` or `to_tsvector` full-text search against the `title` and `content`.

### Feature 4: Thread Detail View & Replies
**Goal:** Expand a thread and view answers. Verified and top-voted answers stick to the top.
- **Frontend:**
  - Target Route: `/courses/[courseId]/hubs/[milestoneId]/t/[threadId]`
  - Render main thread content.
  - Fetch and render replies. The sorting order enforced by backend handles the default view.
  - Add "Post Reply" rich text editor at the bottom.
- **Backend:**
  - Create endpoint: `GET /api/threads/{thread_id}/replies`
  - Logic: Sort logic MUST be `ORDER BY is_verified DESC, upvotes DESC, created_at ASC`.
  - Create endpoint: `POST /api/threads/{thread_id}/replies` payload: `{ content }`

### Feature 5: Voting & Mentor Verification
**Goal:** Empower mentors and gamify quality answers.
- **Frontend:**
  - Add `ChevronUp` and `ChevronDown` icons on Thread and Reply components.
  - If `currentUser.role === "mentor"` (fetch via user context), show a "Verify" shield icon on replies.
  - When verify is clicked, optimistic UI update creates a green tick.
- **Backend:**
  - Create endpoint: `POST /api/votes` payload `{ item_type: "reply", item_id: 123, vote: "upvote" }`.
    - Check if vote exists. Adjust `upvotes` increment/decrement in DB.
    - Adjust `UserReputation` table (+1 for upvoted user, -1 for downvote).
  - Create endpoint: `PUT /api/replies/{reply_id}/verify` (Protected Mentor Route)
    - Sets `is_verified = True`.
    - Adjust `UserReputation` table (+10 score bonus to the reply author).

### Feature 6: "Help Others" Mentor View (The 'Answer' Feature)
**Goal:** An unblocked flow for experts to rapidly clear unanswered questions.
- **Frontend:**
  - Top-Right button fixed in Hub: "Answer Hub".
  - Route: `/courses/[courseId]/hubs/[milestoneId]/answer`
  - Displays a clean list of threads filtering out anything that is resolved or has a verified answer.
- **Backend:**
  - Create endpoint: `GET /api/hubs/{milestone_id}/threads/needs-attention`
  - Logic: Filter threads where `status == open` AND `reply_count == 0` OR `verified_reply_count == 0`.

---

## Next Steps for Development
1. Start with the **Backend** models in `models.py`. Update SQL schemas/Alembic if applicable.
2. Build the exact API routes mentioned above. Use mock JSON data to test.
3. Move to the **Frontend** inside `sensai-frontend` and construct the Layout wrapper for `/hubs`.
4. Implement the Duplicate Search as soon as basic Q&A is wired up.
