from __future__ import annotations

from typing import List, Optional

import requests

from app.config import settings
from app.services.llm import openai_headers


def embed_texts(
    texts: List[str],
    *,
    batch_size: Optional[int] = None,
    model: Optional[str] = None,
    base_url: Optional[str] = None,
) -> List[List[float]]:
    """POST {base}/v1/embeddings — EmbeddingGemma via LiteLLM / OpenAI-compatible gateway."""
    if not texts:
        return []

    url_base = (base_url or settings.vllm_embed_base_url).rstrip("/")
    model_name = (model or settings.embedding_model).strip()
    batch_size = batch_size or settings.embedding_batch_size
    url = f"{url_base}/v1/embeddings"
    headers = openai_headers()

    all_embeddings: List[List[float]] = []
    for start in range(0, len(texts), batch_size):
        batch = texts[start : start + batch_size]
        resp = requests.post(
            url,
            headers=headers,
            json={
                "model": model_name,
                "input": batch,
                "encoding_format": "float",
            },
            timeout=300,
        )
        if not resp.ok:
            raise RuntimeError(f"Embed error {resp.status_code}: {resp.text[:500]}")
        data = resp.json()
        # OpenAI format: data sorted by index
        items = sorted(data["data"], key=lambda x: x["index"])
        all_embeddings.extend([item["embedding"] for item in items])
    return all_embeddings
