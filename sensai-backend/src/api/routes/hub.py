"""Hub (Discussion Board) API routes."""

import asyncio
import json
from datetime import datetime, timezone
from typing import AsyncGenerator

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from fastapi.responses import StreamingResponse

from api.db.hub import (
    create_thread,
    create_reply,
    get_thread_by_id,
    get_threads_for_milestone,
    get_replies_for_thread,
    get_replies_since,
    get_threads_with_embeddings,
    store_thread_embedding,
    upvote_thread,
    upvote_reply,
    verify_reply,
    resolve_thread,
    pin_thread,
    delete_thread,
    delete_reply,
    create_poll_options,
    get_poll_results,
    cast_poll_vote,
)
from api.db.task import get_basic_task_details, get_task_metadata
from api.models import (
    CreateThreadRequest,
    CreateThreadResponse,
    CreateReplyRequest,
    CreateReplyResponse,
    HubThreadResponse,
    HubReplyResponse,
    ThreadDetailResponse,
    HubThreadSortType,
    HubThreadType,
    PollResultResponse,
    PollVoteRequest,
)
from api.utils.db import get_new_db_connection
from api.utils.embeddings import cosine_similarity, get_embedding
from api.utils.logging import logger
from api.config import chat_history_table_name

router = APIRouter(prefix="/hub", tags=["hub"])


# ── Internal helpers ──────────────────────────────────────────────────────────


async def _embed_thread_bg(thread_id: int, title: str, content: str) -> None:
    """Background task: generate + store embedding for a new hub thread."""
    try:
        text = f"{title}\n\n{content}"
        embedding = await get_embedding(text)
        await store_thread_embedding(thread_id, embedding)
    except Exception as exc:
        logger.error(f"Failed to embed thread {thread_id}: {exc}")


async def _get_recent_user_chat(task_id: int, user_id: int, limit: int = 6) -> list[str]:
    """Return the last `limit` user messages for a task, newest-first."""
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            f"""SELECT content FROM {chat_history_table_name}
                WHERE task_id = ? AND user_id = ? AND role = 'user' AND deleted_at IS NULL
                ORDER BY created_at DESC LIMIT ?""",
            (task_id, user_id, limit),
        )
        rows = await cursor.fetchall()
    return [row[0] for row in rows if row[0]]


# ── Thread endpoints ──────────────────────────────────────────────────────────


@router.get("/milestones/{milestone_id}/threads", response_model=list[HubThreadResponse])
async def list_threads(
    milestone_id: int,
    sort: HubThreadSortType = Query(HubThreadSortType.latest),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    threads = await get_threads_for_milestone(
        milestone_id=milestone_id,
        sort=sort.value,
        limit=limit,
        offset=offset,
    )
    return threads


@router.post("/threads", response_model=CreateThreadResponse)
async def create_new_thread(body: CreateThreadRequest, background_tasks: BackgroundTasks):
    if body.thread_type == HubThreadType.poll:
        options = [o.strip() for o in (body.poll_options or []) if o.strip()]
        if len(options) < 2:
            raise HTTPException(status_code=422, detail="Polls require at least 2 non-empty options")
        if len(options) > 10:
            raise HTTPException(status_code=422, detail="Polls allow at most 10 options")

    thread_id = await create_thread(
        course_id=body.course_id,
        milestone_id=body.milestone_id,
        author_id=body.author_id,
        title=body.title,
        content=body.content,
        task_id=body.task_id,
        thread_type=body.thread_type.value,
    )

    if body.thread_type == HubThreadType.poll and body.poll_options:
        clean_options = [o.strip() for o in body.poll_options if o.strip()]
        await create_poll_options(thread_id, clean_options)

    thread = await get_thread_by_id(thread_id)
    if thread is None:
        raise HTTPException(status_code=500, detail="Failed to create thread")

    # Generate and store embedding in the background (non-blocking)
    background_tasks.add_task(_embed_thread_bg, thread_id, body.title, body.content)

    return {"id": thread["id"], "title": thread["title"], "created_at": thread["created_at"]}


@router.get("/threads/{thread_id}", response_model=ThreadDetailResponse)
async def get_thread(thread_id: int):
    thread = await get_thread_by_id(thread_id)
    if thread is None:
        raise HTTPException(status_code=404, detail="Thread not found")
    replies = await get_replies_for_thread(thread_id)
    return {**thread, "replies": replies}


@router.post("/threads/{thread_id}/upvote")
async def upvote_thread_endpoint(thread_id: int):
    thread = await get_thread_by_id(thread_id)
    if thread is None:
        raise HTTPException(status_code=404, detail="Thread not found")
    await upvote_thread(thread_id)
    return {"success": True}


@router.post("/threads/{thread_id}/resolve")
async def resolve_thread_endpoint(thread_id: int):
    thread = await get_thread_by_id(thread_id)
    if thread is None:
        raise HTTPException(status_code=404, detail="Thread not found")
    await resolve_thread(thread_id)
    return {"success": True}


@router.post("/threads/{thread_id}/pin")
async def pin_thread_endpoint(thread_id: int, is_pinned: bool = True):
    thread = await get_thread_by_id(thread_id)
    if thread is None:
        raise HTTPException(status_code=404, detail="Thread not found")
    await pin_thread(thread_id, is_pinned)
    return {"success": True}


@router.delete("/threads/{thread_id}")
async def delete_thread_endpoint(thread_id: int):
    thread = await get_thread_by_id(thread_id)
    if thread is None:
        raise HTTPException(status_code=404, detail="Thread not found")
    await delete_thread(thread_id)
    return {"success": True}


# ── Reply endpoints ───────────────────────────────────────────────────────────


@router.post("/threads/{thread_id}/replies", response_model=CreateReplyResponse)
async def create_new_reply(thread_id: int, body: CreateReplyRequest):
    thread = await get_thread_by_id(thread_id)
    if thread is None:
        raise HTTPException(status_code=404, detail="Thread not found")

    reply_id = await create_reply(
        thread_id=thread_id,
        author_id=body.author_id,
        content=body.content,
    )
    return {"id": reply_id, "thread_id": thread_id, "created_at": datetime.now(timezone.utc)}


@router.post("/threads/{thread_id}/replies/{reply_id}/upvote")
async def upvote_reply_endpoint(thread_id: int, reply_id: int):
    await upvote_reply(reply_id)
    return {"success": True}


@router.post("/threads/{thread_id}/replies/{reply_id}/verify")
async def verify_reply_endpoint(thread_id: int, reply_id: int, verified_by_id: int):
    await verify_reply(reply_id=reply_id, thread_id=thread_id, verified_by_id=verified_by_id)
    return {"success": True}


@router.delete("/threads/{thread_id}/replies/{reply_id}")
async def delete_reply_endpoint(thread_id: int, reply_id: int):
    await delete_reply(reply_id=reply_id, thread_id=thread_id)
    return {"success": True}


# ── Poll endpoints ────────────────────────────────────────────────────────────


@router.get("/threads/{thread_id}/poll", response_model=PollResultResponse)
async def get_poll(
    thread_id: int,
    user_id: int = Query(..., description="ID of the requesting user (to check if they voted)"),
):
    """Return poll options with live vote counts and the user's voting state."""
    thread = await get_thread_by_id(thread_id)
    if thread is None:
        raise HTTPException(status_code=404, detail="Thread not found")
    if thread["thread_type"] != "poll":
        raise HTTPException(status_code=400, detail="Thread is not a poll")
    return await get_poll_results(thread_id, user_id)


@router.post("/threads/{thread_id}/poll/vote", response_model=PollResultResponse)
async def vote_on_poll(thread_id: int, body: PollVoteRequest):
    """Cast a vote on a poll option. Returns the updated poll results.

    Returns 409 if the user has already voted.
    """
    thread = await get_thread_by_id(thread_id)
    if thread is None:
        raise HTTPException(status_code=404, detail="Thread not found")
    if thread["thread_type"] != "poll":
        raise HTTPException(status_code=400, detail="Thread is not a poll")
    try:
        return await cast_poll_vote(thread_id, body.option_id, body.user_id)
    except ValueError:
        raise HTTPException(status_code=409, detail="You have already voted on this poll")


# ── Suggestions ───────────────────────────────────────────────────────────────


@router.get("/suggestions", response_model=list[HubThreadResponse])
async def get_suggestions(
    task_id: int = Query(..., description="Task the student is currently working on"),
    user_id: int = Query(..., description="ID of the student"),
):
    """Return up to 5 hub threads most semantically relevant to what the student is struggling with.

    Flow:
      1. Resolve milestone_id from the task.
      2. Build struggle context from recent chat + task title.
      3. Embed the context.
      4. Cosine-rank all embedded threads in the same milestone.
      5. Return top 5.
    """
    # 1. Resolve task + milestone
    task = await get_basic_task_details(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    metadata = await get_task_metadata(task_id)
    if metadata is None:
        raise HTTPException(status_code=404, detail="Task not linked to any course/milestone")

    milestone_id = metadata["milestone"]["id"]

    # 2. Build struggle context
    recent_messages = await _get_recent_user_chat(task_id, user_id)
    task_title = task.get("title", "")

    if recent_messages:
        chat_snippet = " | ".join(reversed(recent_messages))  # chronological order
        context_text = f"Assignment: {task_title}\n\nStudent messages: {chat_snippet}"
    else:
        context_text = task_title

    # 3. Embed the context
    try:
        query_embedding = await get_embedding(context_text)
    except Exception as exc:
        logger.error(f"Suggestions: embedding failed for task {task_id}: {exc}")
        raise HTTPException(status_code=500, detail="Failed to generate embedding")

    # 4. Fetch threads with embeddings for this milestone and rank
    threads = await get_threads_with_embeddings(milestone_id)
    if not threads:
        return []

    scored = []
    for thread in threads:
        thread_embedding = thread.pop("embedding")
        sim = cosine_similarity(query_embedding, thread_embedding)
        # Boost for upvotes and verified answers
        score = sim * (1 + 0.1 * thread["upvote_count"]) * (1.5 if thread["has_verified_reply"] else 1.0)
        scored.append((score, thread))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [t for _, t in scored[:5]]


# ── SSE stream ────────────────────────────────────────────────────────────────


@router.get("/threads/{thread_id}/stream")
async def stream_replies(
    thread_id: int,
    last_id: int = Query(0, description="Last seen reply id; 0 to receive all"),
):
    """Server-Sent Events endpoint — pushes new replies as they arrive.

    Clients open a persistent connection and receive events as JSON whenever
    a new reply is posted (polled internally every 2 s).  The client should
    track the max reply id it has seen and reconnect with `?last_id=<n>`.
    """
    thread = await get_thread_by_id(thread_id)
    if thread is None:
        raise HTTPException(status_code=404, detail="Thread not found")

    async def event_generator() -> AsyncGenerator[str, None]:
        current_last_id = last_id
        # Send a heartbeat immediately so the browser knows the connection is alive.
        yield "event: ping\ndata: {}\n\n"

        while True:
            await asyncio.sleep(2)

            new_replies = await get_replies_since(
                thread_id=thread_id,
                last_reply_id=current_last_id,
            )

            for reply in new_replies:
                current_last_id = reply["id"]
                # Convert datetime to ISO string for JSON serialisation.
                payload = dict(reply)
                if hasattr(payload.get("created_at"), "isoformat"):
                    payload["created_at"] = payload["created_at"].isoformat()
                yield f"event: reply\ndata: {json.dumps(payload)}\n\n"

            # Send periodic heartbeat so the connection doesn't time out.
            yield "event: ping\ndata: {}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
