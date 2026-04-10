"""Hub (Discussion Board) API routes."""

import asyncio
import json
from datetime import datetime, timezone
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from api.db.hub_registry import get_hub_by_id, list_hubs_for_course
from api.db.hub import (
    create_thread,
    create_reply,
    get_thread_by_id,
    get_threads_for_milestone,
    get_replies_for_thread,
    get_replies_since,
    upvote_thread,
    upvote_reply,
    verify_reply,
    resolve_thread,
    pin_thread,
    delete_thread,
    delete_reply,
)
from api.models import (
    CreateThreadRequest,
    CreateThreadResponse,
    CreateReplyRequest,
    CreateReplyResponse,
    HubThreadResponse,
    HubReplyResponse,
    ThreadDetailResponse,
    HubThreadSortType,
)

router = APIRouter(prefix="/hub", tags=["hub"])


# ── Hub registry (1:1 with milestones) ──────────────────────────────────────


@router.get("/courses/{course_id}/hubs")
async def list_course_hubs(course_id: int):
    """All hubs for a course (for global HUB dropdown)."""
    return await list_hubs_for_course(course_id)


@router.get("/hubs/{hub_id}")
async def get_hub(hub_id: int):
    """Resolve hub id → milestone_id + course_id for routing."""
    hub = await get_hub_by_id(hub_id)
    if hub is None:
        raise HTTPException(status_code=404, detail="Hub not found")
    return hub


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
async def create_new_thread(body: CreateThreadRequest):
    thread_id = await create_thread(
        course_id=body.course_id,
        milestone_id=body.milestone_id,
        author_id=body.author_id,
        title=body.title,
        content=body.content,
        task_id=body.task_id,
    )
    thread = await get_thread_by_id(thread_id)
    if thread is None:
        raise HTTPException(status_code=500, detail="Failed to create thread")
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
