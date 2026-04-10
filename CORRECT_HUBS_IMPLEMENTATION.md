# CORRECT HUBS IMPLEMENTATION — UI & BACKEND MAPPING

This document contains the exact instructions for both the frontend layout layout and the permanent backend relational mapping for the Hubs feature. 

Please follow these instructions strictly to ensure the "Knowledge Linking" acts dynamically and automatically.

---

## 1. FRONTEND: The Global "HUB" Dropdown (Outside the Course Cards)

The current UI places a "Discuss" button inside the module card. **Remove this.**
The requirement is to have a **Common "HUB" Button separated entirely from the individual course cards.**

### UI Layout Directives for AI:
1. **Location:** Place a large, standalone button labeled **`HUB`** at the top of the Course Dashboard (or in the main global sidebar), completely outside of the individual module/course cards.
2. **Behavior:** When the `HUB` button is clicked, it must act as a **Dropdown Menu**.
3. **Dropdown Content:** The dropdown must dynamically map and list all the Hubs that exist for the current course (e.g., *Introduction Hub*, *Dynamic Programming Hub*).
4. **Navigation:** When the user selects a specific Hub from the dropdown, navigate them to the UI exactly as designed in the screenshots (The tabs showing "Ask a Question" and "All Discussions").
   - **Target Route:** `/courses/[courseId]/hubs/[hubId]`

---

## 2. BACKEND: Perfect Auto-Creation & Knowledge Mapping

To fulfill the explicit requirement: *"hubs should be automatically created when a module is created, also automatically mapped to any tasks, assessments, quiz for that particular hub..."*

We must implement a strict **Backend Hubs Entity and Automation Hook.**

### A. The Database Schema (Raw SQLite)
We must create an explicit `hubs` table that shares a 1-to-1 relationship with `milestones` (Modules).

```sql
/* 1. Explicit Hubs Table */
CREATE TABLE IF NOT EXISTS hubs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    milestone_id INTEGER NOT NULL UNIQUE, /* 1-to-1 mapping with Module */
    course_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

/* 2. Update Hub Threads to map to the Hub */
CREATE TABLE IF NOT EXISTS hub_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hub_id INTEGER NOT NULL,
    task_id INTEGER, /* Links question to specific Quiz/Assessment */
    author_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    upvotes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hub_id) REFERENCES hubs(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
```

### B. The "Auto-Creation" Service Logic (Python / FastAPI)
The AI must intercept the API endpoint where a Module (Milestone) is created and automatically trigger the Hub creation.

**AI Directive for `backend/sensai-backend`:**
Locate the `src/api/routes` or `src/api/db` functions handling Milestone creation. 
Immediately after `INSERT INTO milestones...`, you must execute:
```sql
INSERT INTO hubs (milestone_id, course_id) VALUES (?, ?);
```
*Why this works gracefully:* Because of this hook, the millisecond a new module is created by an admin, an empty, fully functional Hub is born. 

### C. The "Auto-Mapping" to Tasks/Quizzes
You requested that the Hub automatically maps to any quizzes or assessments inside that module.

**How this architecture guarantees perfect mapping:**
Your codebase already uses a `course_tasks` table to link specific `tasks` (Quizzes/Assessments) to a `milestone_id`.
Because the `Hub` is mathematically locked 1-to-1 with the `milestone_id`, **every single Task, Quiz, and Assessment placed inside that module is automatically inherited by the Hub.**

**Frontend Linking Directive:**
Inside the "Ask a Question" form in the Hub frontend, query the backend to fetch all tasks where `milestone_id == currentHub.milestone_id`. Put those tasks in a dropdown so the student can physically link their question to the specific Quiz when they post.

---
**AI Instruction:** Consume this README to completely rebuild the Dropdown UI outside the course cards and strictly implement the auto-creation backend logic hooks.
