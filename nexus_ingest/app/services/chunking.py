from __future__ import annotations

from typing import List

try:
    import tiktoken

    _enc = tiktoken.get_encoding("cl100k_base")
except Exception:  # pragma: no cover
    _enc = None

from app.config import settings


def _count_tokens(text: str) -> int:
    if _enc is None:
        return max(1, len(text) // 4)
    return len(_enc.encode(text))


def split_text_into_chunks(text: str) -> List[str]:
    """Recursive-ish token chunking (NEXUS-compatible defaults)."""
    text = (text or "").strip()
    if not text:
        return []

    max_tokens = settings.max_tokens_per_chunk
    overlap = int(max_tokens * settings.text_splitter_overlap_ratio)

    # Prefer paragraph splits first
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    if not paragraphs:
        paragraphs = [text]

    chunks: List[str] = []
    current: List[str] = []
    current_tokens = 0

    def flush() -> None:
        nonlocal current, current_tokens
        if current:
            chunks.append("\n\n".join(current).strip())
            current = []
            current_tokens = 0

    for para in paragraphs:
        pt = _count_tokens(para)
        if pt > max_tokens:
            flush()
            # hard split long paragraph by approximate chars
            step = max(200, max_tokens * 3)
            for i in range(0, len(para), step):
                piece = para[i : i + step]
                chunks.append(piece)
            continue
        if current_tokens + pt > max_tokens and current:
            flush()
            # overlap: keep tail of previous chunk text if possible
            if chunks and overlap > 0:
                prev = chunks[-1]
                # rough overlap by last N chars
                tail = prev[-overlap * 4 :]
                current = [tail, para]
                current_tokens = _count_tokens("\n\n".join(current))
            else:
                current = [para]
                current_tokens = pt
        else:
            current.append(para)
            current_tokens += pt

    flush()
    return [c for c in chunks if c.strip()]
