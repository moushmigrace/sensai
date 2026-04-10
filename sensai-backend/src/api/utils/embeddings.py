"""Utilities for generating OpenAI embeddings and computing cosine similarity."""

import math

from openai import AsyncOpenAI

from api.utils.logging import logger

EMBEDDING_MODEL = "text-embedding-3-small"


async def get_embedding(text: str) -> list[float]:
    """Generate an embedding vector for the given text using OpenAI."""
    client = AsyncOpenAI()
    try:
        response = await client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=text,
        )
        return response.data[0].embedding
    except Exception as exc:
        logger.error(f"Failed to generate embedding: {exc}")
        raise


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Return the cosine similarity between two vectors (range -1 to 1)."""
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(y * y for y in b))
    denominator = mag_a * mag_b
    if denominator == 0:
        return 0.0
    return dot / denominator
