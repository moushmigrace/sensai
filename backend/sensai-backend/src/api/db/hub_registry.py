"""Registry table `hubs`: 1:1 with milestones for the Hubs feature."""

from typing import Any, Dict, List, Optional

from api.config import (
    hubs_table_name,
    milestones_table_name,
    course_milestones_table_name,
    courses_table_name,
)
from api.utils.db import execute_db_operation


async def create_hubs_table(cursor) -> None:
    await cursor.execute(
        f"""CREATE TABLE IF NOT EXISTS {hubs_table_name} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            milestone_id INTEGER NOT NULL UNIQUE,
            course_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (milestone_id) REFERENCES {milestones_table_name}(id) ON DELETE CASCADE,
            FOREIGN KEY (course_id) REFERENCES {courses_table_name}(id) ON DELETE CASCADE
        )"""
    )
    await cursor.execute(
        f"CREATE INDEX IF NOT EXISTS idx_hubs_course ON {hubs_table_name} (course_id)"
    )


async def ensure_hub_row_for_milestone(
    cursor, milestone_id: int, course_id: int
) -> None:
    """Call after a milestone is linked to a course (same transaction cursor)."""
    await cursor.execute(
        f"""INSERT OR IGNORE INTO {hubs_table_name} (milestone_id, course_id) VALUES (?, ?)""",
        (milestone_id, course_id),
    )


async def backfill_hubs_from_course_milestones(cursor) -> None:
    await cursor.execute(
        f"""
        INSERT OR IGNORE INTO {hubs_table_name} (milestone_id, course_id)
        SELECT DISTINCT cm.milestone_id, cm.course_id
        FROM {course_milestones_table_name} cm
        WHERE cm.deleted_at IS NULL
        """
    )


async def list_hubs_for_course(course_id: int) -> List[Dict[str, Any]]:
    rows = await execute_db_operation(
        f"""
        SELECT h.id, h.milestone_id, m.name
        FROM {hubs_table_name} h
        JOIN {milestones_table_name} m ON m.id = h.milestone_id
        JOIN {course_milestones_table_name} cm
          ON cm.milestone_id = h.milestone_id AND cm.course_id = h.course_id
        WHERE h.course_id = ?
          AND cm.deleted_at IS NULL
          AND m.deleted_at IS NULL
        ORDER BY cm.ordering
        """,
        (course_id,),
        fetch_all=True,
    )
    return [
        {"id": row[0], "milestone_id": row[1], "milestone_name": row[2]}
        for row in (rows or [])
    ]


async def get_hub_by_id(hub_id: int) -> Optional[Dict[str, Any]]:
    row = await execute_db_operation(
        f"""
        SELECT h.id, h.milestone_id, h.course_id, m.name
        FROM {hubs_table_name} h
        JOIN {milestones_table_name} m ON m.id = h.milestone_id
        WHERE h.id = ? AND m.deleted_at IS NULL
        """,
        (hub_id,),
        fetch_one=True,
    )
    if not row:
        return None
    return {
        "id": row[0],
        "milestone_id": row[1],
        "course_id": row[2],
        "milestone_name": row[3],
    }
