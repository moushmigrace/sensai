# Module-Linked Hubs UI Implementation Guide

**CRITICAL INSTRUCTION FOR AI CODE GENERATION:**
Do NOT create a generic, common "Discuss" button or a single forum for the entire course. The core requirement is that **each Module (Milestone) has its own distinct Hub**. The UI must reflect this by dynamically listing the Hubs based on the course modules.

Here is the exact frontend implementation flow required to ensure the Hubs are correctly linked to the Modules.

---

## 1. The "Hubs" Dropdown Navigation Component
Instead of a single "Discuss" button, the main Course layout must feature a **Hubs Dropdown Menu**.

### Technical Flow:
1. Fetch the active `course` data, which contains a list of `milestones` (Modules).
2. Render a dropdown button labeled **"Module Hubs"**.
3. When clicked, iterate (`map`) over the `milestones` list.
4. Render a dropdown link for each milestone.
   - Example: If the course has "Module 1: Graphs" and "Module 2: DP", the dropdown must list "Graphs Hub" and "DP Hub".
5. **Routing:** Each link in the dropdown must route dynamically to the specific milestone's Hub.
   - **Target Route:** `/courses/[courseId]/hubs/[milestoneId]`

*Note to AI:* You must pass the `milestoneId` into the URL params. This is what guarantees that the student is entering the Module-specific Hub, rather than a generic course forum.

---

## 2. The Specific Module Hub Page (`/courses/[courseId]/hubs/[milestoneId]/page.tsx`)

Once the user clicks a specific Module from the dropdown, they navigate to the Hub dedicated *only* to that Module.

### Page Header UI:
- Fetch the specific Milestone using the `[milestoneId]` from the URL params.
- Display a dynamic header: **"{Milestone Name} - Discussion Hub"** (e.g., "Dynamic Programming - Discussion Hub").
- *Why this matters:* This visually confirms to the student that all tasks, quizzes, questions, and answers on this page belong exclusively to this Module.

### Tab Navigation (Inside the Module Hub):
Directly below the header, render the two required tabs:
1. **Tab 1: "Ask a Question"** (Displays a form to post questions, with Debounced Search to prevent duplicates).
2. **Tab 2: "All Discussions"** (Displays the feed of threads linked specifically to this `milestoneId`).

---

## 3. The "Help Others" Mentor Button
In the top right corner of the **Module Hub Page** (next to the Tabs), render an **"Answer"** button.

- **Routing:** Navigates to `/courses/[courseId]/hubs/[milestoneId]/answer`
- *Purpose:* This ensures that mentors are answering questions *specifically* for the current Module, keeping their workflow tightly linked to the syllabus.

---

### Summary Checklist for Code Generation:
- [ ] No generic `/discussions` route. All routes must include `/[milestoneId]`.
- [ ] A Dropdown menu mapping over the Course `milestones`.
- [ ] The Hub page automatically filters threads using `milestone_id = [milestoneId]`.
- [ ] The Hub Page Header dynamically prints the Module's name to confirm the context.
