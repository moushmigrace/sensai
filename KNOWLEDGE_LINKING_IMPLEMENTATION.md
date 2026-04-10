# Knowledge Linking Implementation: Mapping Hubs to Tasks

Based on the UI screenshots, the basic Hub layout is correct, but it is missing the critical **Knowledge Linking** aspect. 
You specifically requested that the Hubs be *"automatically mapped to the modules and the task/assessments/quiz inside those modules."* 

Currently, the "Ask a Question" form only takes a Title and Details. To create a true Knowledge Graph, we must allow students to link their questions directly to the specific tasks within the module.

Here is the exact implementation to feed to your AI to fix this:

---

## 1. Updating the "Ask a Question" Form (Image 1 Fix)
When a student asks a question inside the Module Hub, they need to be able to tag the exact Quiz, Assessment, or Learning Material they are struggling with.

**AI Implementation Instructions:**
- Inside the `/courses/[courseId]/hubs/[milestoneId]` page, fetch all the **Tasks** that belong to `milestoneId`.
- In the "Ask a Question" form, right above the "Title" input, add a new dropdown field: **"Related Task / Quiz (Optional)"**.
- This dropdown should list all tasks inside the current module (e.g., "New learning material", "New quiz").
- When the form is submitted, pass the selected `task_id` to the backend. (The `hub_threads` database table already has a `task_id` column explicitly for this!).

## 2. Updating the "All Discussions" Feed (Image 2 Fix)
To make the Knowledge Graph visible to everyone, we need to show these task links in the discussion feed.

**AI Implementation Instructions:**
- When rendering the list of threads in the "All Discussions" tab, check if the thread has a `task_id`.
- If it does, render a small, colored **Task Badge** next to the thread title. 
  - *Example UI:* `[📝 New quiz (1 question)] How do I optimize the array here?`
- *Why this is important:* When other students are stuck on the same quiz, they can immediately spot discussions linked specifically to that quiz.

## 3. The "Common Hubs" Dropdown Navigation (Image 4 Fix)
You mentioned wanting a "common hubs inside course, upon clicking that it acts as a drop down listing all the hubs of each module". 

From your 4th screenshot, you currently have both a `Module Hubs v` dropdown at the top, AND a `Discuss` button on the module card itself. 

**AI Implementation Instructions to optimize the Knowledge Flow:**
1. **The Dropdown:** Keep the `Module Hubs v` dropdown exactly where it is. When clicked, it should loop through the Modules and render nested links. For example:
   - Module 1: DSA Introduction
   - Module 2: Dynamic Programming
   *(Clicking any of these routes to that module's specific Hub).*
2. **The "Discuss" Button:** The `Discuss` button on the module card (shown in image 4) is actually **perfect UX**. Leave it there! When a user clicks `Discuss` on the "New Module" card, it should route them directly to `/courses/[courseId]/hubs/[milestoneId]`. 
3. **Task-Level Deep Links (Optional but powerful):** If you want ultimate knowledge linking, add a tiny chat icon next to the "New quiz" row in the module card. Clicking it takes the user to the Hub, *with that specific quiz pre-selected in the Hub's feed filter!*

---

### Give this exact command to your AI:
> *"Update the Hub UI to reflect true Knowledge Linking. In the 'Ask a Question' form, add a dropdown that lets the user select the specific Task/Quiz from the current module and save the `task_id`. In the 'All Discussions' feed, render a Badge showing which Task/Quiz the thread is linked to. This ensures questions are tightly mapped to the course content as requested."*
