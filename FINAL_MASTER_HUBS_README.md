# PERFECT HUBS IMPLEMENTATION — UNIFIED MASTER GUIDE

This document serves as the absolute, conflict-free blueprint for creating the Learning Network Hubs. It perfectly marries the **Global Hub UI Dropdown** with the **Backend Auto-Creation Schema** and **Task-Level Knowledge Linking**.

Feed this guide directly to your AI implementation tool to build the feature exactly as requested without any generic placeholders or mismatched relations.

---

## 1. BACKEND: The "Auto-Creation" Database Schema
To ensure every module automatically gets a Hub, we establish a strict 1-to-1 relationship between `milestones` (Modules) and `hubs`.

### A. SQLite Table Structure
Inject these tables into `backend/sensai-backend/src/api/db/__init__.py`:

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

/* 2. Hub Threads (Mapped directly to Hubs and Tasks) */
CREATE TABLE IF NOT EXISTS hub_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hub_id INTEGER NOT NULL,
    task_id INTEGER, /* Critical for Knowledge Linking to specific quizzes */
    author_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    upvotes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hub_id) REFERENCES hubs(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

/* (You also need the hub_replies and hub_votes tables as previously defined) */
```

### B. The Auto-Creation API Hook
Inside the backend FastAPI route that handles creating a new Module/Milestone (e.g., `POST /courses/{course_id}/milestones`), the code **MUST** automatically trigger a Hub creation immediately after inserting the milestone.
```sql
INSERT INTO hubs (milestone_id, course_id) VALUES (?, ?);
```

---

## 2. FRONTEND: Global Navigation & UI Layout

Do NOT put a "Discuss" button inside the course/module cards. Do not create a single, generic forum.

### A. The Global "HUB" Dropdown Menu
1. Location: At the top level of the Dashboard or Course View (outside of the module cards).
2. UI: A standalone button labeled **`HUB ▾`**.
3. Logic: When clicked, it maps over the `milestones` (Modules) of the current course.
4. Render: List each module hub by name (e.g., "Intro Module Hub", "DP Module Hub").
5. Routing: Clicking a dropdown item navigates definitively to `/courses/[courseId]/hubs/[milestoneId]`.

### B. The Hub Detail Page (`/hubs/[milestoneId]`)
Once routed into the specific Hub, the UI must definitively prove connection to the module.
- **Dynamic Header:** Display `"{Milestone Name} - Discussion Hub"` at the top.
- **Tabs:** Render Tab 1 (`Ask a Question`) and Tab 2 (`All Discussions`).
- **Mentor Button:** Render the `Answer` button at the top right, routing exactly to `/courses/[courseId]/hubs/[milestoneId]/answer`.

---

## 3. KNOWLEDGE LINKING: Auto-Mapping to Tasks & Quizzes
Because the `Hub` is locked mathematically to the `milestone_id`, every Task, Assessment, and Quiz inside that module is automatically owned by that Hub. We must expose this link in the UI.

### A. Updating the "Ask a Question" Form
Inside the "Ask a Question" tab UI:
- Query the backend to fetch all `tasks` where the task's `milestone_id` matches the current Hub's `milestone_id`.
- Add a dropdown field titled **"Related Task / Quiz (Optional)"** above the Title input.
- When the student submits the question, pass the selected `task_id` into the `hub_threads` creation POST endpoint.

### B. The "All Discussions" Feed Badges
Inside the "All Discussions" feed UI:
- When mapping the `threads` cards, if the thread contains a `task_id`, render a colorful **Task Badge** (e.g., `[📝 New DP Quiz]`) immediately next to the thread title.
- This creates the visual **Knowledge Graph**, allowing peers to instantly see exactly which specific assessments questions belong to.

---
**FINAL DIRECTIVE TO AI:** Build exactly this blueprint. Do not create a generic root `/discussions` route. Strictly follow the `milestone_id` mapping for URL routes and task-linking.
