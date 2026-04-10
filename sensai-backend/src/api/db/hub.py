"""DB helper functions for the Hub discussion feature."""

import json

from api.config import (
    hub_threads_table_name,
    hub_replies_table_name,
    hub_thread_embeddings_table_name,
    hub_poll_options_table_name,
    hub_poll_votes_table_name,
    users_table_name,
)
from api.utils.db import get_new_db_connection


# ── Threads ──────────────────────────────────────────────────────────────────


async def create_thread(
    course_id: int,
    milestone_id: int,
    author_id: int,
    title: str,
    content: str,
    task_id: int | None = None,
    thread_type: str = "question",
) -> int:
    """Insert a new thread and return its id."""
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            f"""INSERT INTO {hub_threads_table_name}
                (course_id, milestone_id, task_id, author_id, title, content, thread_type)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (course_id, milestone_id, task_id, author_id, title, content, thread_type),
        )
        thread_id = cursor.lastrowid
        await conn.commit()
    return thread_id


async def get_threads_for_milestone(
    milestone_id: int,
    sort: str = "latest",
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """Return threads for a milestone ordered by pinned flag then sort criteria."""
    if sort == "top":
        order_clause = "t.is_pinned DESC, t.upvote_count DESC, t.created_at DESC"
    else:
        order_clause = "t.is_pinned DESC, t.created_at DESC"

    async with get_new_db_connection() as conn:
        conn.row_factory = None
        cursor = await conn.cursor()
        await cursor.execute(
            f"""SELECT
                    t.id, t.course_id, t.milestone_id, t.task_id,
                    t.author_id, u.first_name, u.last_name,
                    t.title, t.content, t.status,
                    t.upvote_count, t.reply_count, t.has_verified_reply, t.is_pinned,
                    t.created_at, t.thread_type
                FROM {hub_threads_table_name} t
                JOIN {users_table_name} u ON u.id = t.author_id
                WHERE t.milestone_id = ?
                  AND t.deleted_at IS NULL
                ORDER BY {order_clause}
                LIMIT ? OFFSET ?""",
            (milestone_id, limit, offset),
        )
        rows = await cursor.fetchall()

    return [_row_to_thread_dict(r) for r in rows]


async def get_thread_by_id(thread_id: int) -> dict | None:
    """Return a single thread with author info, or None if not found."""
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            f"""SELECT
                    t.id, t.course_id, t.milestone_id, t.task_id,
                    t.author_id, u.first_name, u.last_name,
                    t.title, t.content, t.status,
                    t.upvote_count, t.reply_count, t.has_verified_reply, t.is_pinned,
                    t.created_at, t.thread_type
                FROM {hub_threads_table_name} t
                JOIN {users_table_name} u ON u.id = t.author_id
                WHERE t.id = ?
                  AND t.deleted_at IS NULL""",
            (thread_id,),
        )
        row = await cursor.fetchone()

    if row is None:
        return None
    return _row_to_thread_dict(row)


async def upvote_thread(thread_id: int) -> None:
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            f"UPDATE {hub_threads_table_name} SET upvote_count = upvote_count + 1 WHERE id = ?",
            (thread_id,),
        )
        await conn.commit()


async def resolve_thread(thread_id: int) -> None:
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            f"UPDATE {hub_threads_table_name} SET status = 'resolved' WHERE id = ?",
            (thread_id,),
        )
        await conn.commit()


async def pin_thread(thread_id: int, is_pinned: bool) -> None:
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            f"UPDATE {hub_threads_table_name} SET is_pinned = ? WHERE id = ?",
            (1 if is_pinned else 0, thread_id),
        )
        await conn.commit()


async def delete_thread(thread_id: int) -> None:
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            f"UPDATE {hub_threads_table_name} SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
            (thread_id,),
        )
        await conn.commit()


# ── Replies ───────────────────────────────────────────────────────────────────


async def create_reply(thread_id: int, author_id: int, content: str) -> int:
    """Insert a reply and increment the parent thread's reply_count. Returns reply id."""
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            f"""INSERT INTO {hub_replies_table_name} (thread_id, author_id, content)
                VALUES (?, ?, ?)""",
            (thread_id, author_id, content),
        )
        reply_id = cursor.lastrowid

        await cursor.execute(
            f"UPDATE {hub_threads_table_name} SET reply_count = reply_count + 1 WHERE id = ?",
            (thread_id,),
        )
        await conn.commit()
    return reply_id


async def get_replies_for_thread(thread_id: int) -> list[dict]:
    """Return all replies for a thread ordered by id asc."""
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            f"""SELECT
                    r.id, r.thread_id, r.author_id, u.first_name, u.last_name,
                    r.content, r.upvote_count, r.is_verified, r.created_at
                FROM {hub_replies_table_name} r
                JOIN {users_table_name} u ON u.id = r.author_id
                WHERE r.thread_id = ?
                  AND r.deleted_at IS NULL
                ORDER BY r.id ASC""",
            (thread_id,),
        )
        rows = await cursor.fetchall()

    return [_row_to_reply_dict(r) for r in rows]


async def get_replies_since(thread_id: int, last_reply_id: int) -> list[dict]:
    """Return replies newer than last_reply_id — used for SSE polling."""
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            f"""SELECT
                    r.id, r.thread_id, r.author_id, u.first_name, u.last_name,
                    r.content, r.upvote_count, r.is_verified, r.created_at
                FROM {hub_replies_table_name} r
                JOIN {users_table_name} u ON u.id = r.author_id
                WHERE r.thread_id = ?
                  AND r.id > ?
                  AND r.deleted_at IS NULL
                ORDER BY r.id ASC""",
            (thread_id, last_reply_id),
        )
        rows = await cursor.fetchall()

    return [_row_to_reply_dict(r) for r in rows]


async def upvote_reply(reply_id: int) -> None:
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            f"UPDATE {hub_replies_table_name} SET upvote_count = upvote_count + 1 WHERE id = ?",
            (reply_id,),
        )
        await conn.commit()


async def verify_reply(reply_id: int, thread_id: int, verified_by_id: int) -> None:
    """Mark reply as verified and set has_verified_reply on the parent thread."""
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            f"""UPDATE {hub_replies_table_name}
                SET is_verified = 1, verified_by_id = ?
                WHERE id = ?""",
            (verified_by_id, reply_id),
        )
        await cursor.execute(
            f"UPDATE {hub_threads_table_name} SET has_verified_reply = 1 WHERE id = ?",
            (thread_id,),
        )
        await conn.commit()


async def delete_reply(reply_id: int, thread_id: int) -> None:
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            f"UPDATE {hub_replies_table_name} SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
            (reply_id,),
        )
        await cursor.execute(
            f"""UPDATE {hub_threads_table_name}
                SET reply_count = MAX(0, reply_count - 1)
                WHERE id = ?""",
            (thread_id,),
        )
        await conn.commit()


# ── Embeddings ────────────────────────────────────────────────────────────────


async def store_thread_embedding(thread_id: int, embedding: list[float]) -> None:
    """Upsert the embedding vector for a hub thread (stored as a JSON array)."""
    embedding_json = json.dumps(embedding)
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            f"""INSERT INTO {hub_thread_embeddings_table_name} (thread_id, embedding)
                VALUES (?, ?)
                ON CONFLICT(thread_id) DO UPDATE SET embedding = excluded.embedding""",
            (thread_id, embedding_json),
        )
        await conn.commit()


async def get_threads_with_embeddings(milestone_id: int) -> list[dict]:
    """Return all non-deleted threads for a milestone that have a stored embedding."""
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            f"""SELECT
                    t.id, t.course_id, t.milestone_id, t.task_id,
                    t.author_id, u.first_name, u.last_name,
                    t.title, t.content, t.status,
                    t.upvote_count, t.reply_count, t.has_verified_reply, t.is_pinned,
                    t.created_at, t.thread_type, e.embedding
                FROM {hub_threads_table_name} t
                JOIN {users_table_name} u ON u.id = t.author_id
                JOIN {hub_thread_embeddings_table_name} e ON e.thread_id = t.id
                WHERE t.milestone_id = ?
                  AND t.deleted_at IS NULL""",
            (milestone_id,),
        )
        rows = await cursor.fetchall()

    result = []
    for row in rows:
        thread = _row_to_thread_dict(row[:16])
        thread["embedding"] = json.loads(row[16])
        result.append(thread)
    return result


# ── Private helpers ───────────────────────────────────────────────────────────


def _row_to_thread_dict(row: tuple) -> dict:
    (
        id_, course_id, milestone_id, task_id,
        author_id, first_name, last_name,
        title, content, status,
        upvote_count, reply_count, has_verified_reply, is_pinned,
        created_at, thread_type,
    ) = row
    return {
        "id": id_,
        "course_id": course_id,
        "milestone_id": milestone_id,
        "task_id": task_id,
        "author": {"id": author_id, "first_name": first_name, "last_name": last_name},
        "title": title,
        "content": content,
        "status": status,
        "thread_type": thread_type or "question",
        "upvote_count": upvote_count,
        "reply_count": reply_count,
        "has_verified_reply": bool(has_verified_reply),
        "is_pinned": bool(is_pinned),
        "created_at": created_at,
    }


# ── Poll helpers ─────────────────────────────────────────────────────────────


async def create_poll_options(thread_id: int, options: list[str]) -> None:
    """Insert poll option rows for a newly created poll thread."""
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        for i, text in enumerate(options):
            await cursor.execute(
                f"""INSERT INTO {hub_poll_options_table_name}
                    (thread_id, text, position) VALUES (?, ?, ?)""",
                (thread_id, text.strip(), i),
            )
        await conn.commit()


async def get_poll_results(thread_id: int, user_id: int) -> dict:
    """Return options with live vote counts and whether this user has voted."""
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            f"""SELECT
                    o.id, o.text, o.vote_count, o.position,
                    CASE WHEN v.user_id IS NOT NULL THEN 1 ELSE 0 END AS voted
                FROM {hub_poll_options_table_name} o
                LEFT JOIN {hub_poll_votes_table_name} v
                    ON v.option_id = o.id AND v.user_id = ?
                WHERE o.thread_id = ? AND o.deleted_at IS NULL
                ORDER BY o.position""",
            (user_id, thread_id),
        )
        rows = await cursor.fetchall()

    total_votes = sum(r[2] for r in rows)
    user_voted = any(r[4] for r in rows)
    user_option_id = next((r[0] for r in rows if r[4]), None)

    return {
        "total_votes": total_votes,
        "user_voted": bool(user_voted),
        "user_option_id": user_option_id,
        "options": [
            {
                "id": r[0],
                "text": r[1],
                "vote_count": r[2],
                "position": r[3],
                "voted": bool(r[4]),
            }
            for r in rows
        ],
    }


async def cast_poll_vote(thread_id: int, option_id: int, user_id: int) -> dict:
    """Record a vote. Raises ValueError('already_voted') if user already voted."""
    async with get_new_db_connection() as conn:
        cursor = await conn.cursor()
        await cursor.execute(
            f"""INSERT OR IGNORE INTO {hub_poll_votes_table_name}
                (thread_id, option_id, user_id) VALUES (?, ?, ?)""",
            (thread_id, option_id, user_id),
        )
        inserted = cursor.rowcount
        if inserted == 0:
            raise ValueError("already_voted")
        await cursor.execute(
            f"UPDATE {hub_poll_options_table_name} SET vote_count = vote_count + 1 WHERE id = ?",
            (option_id,),
        )
        await conn.commit()
    return await get_poll_results(thread_id, user_id)


def _row_to_reply_dict(row: tuple) -> dict:
    (
        id_, thread_id, author_id, first_name, last_name,
        content, upvote_count, is_verified, created_at,
    ) = row
    return {
        "id": id_,
        "thread_id": thread_id,
        "author": {"id": author_id, "first_name": first_name, "last_name": last_name},
        "content": content,
        "upvote_count": upvote_count,
        "is_verified": bool(is_verified),
        "created_at": created_at,
    }
