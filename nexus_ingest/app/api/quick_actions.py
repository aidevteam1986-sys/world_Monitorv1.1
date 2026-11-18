from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.config import settings
from app.es_client import is_es_available, search_by_document_id
from app.models import DocumentGenerateRequest
from app.services.document_service import document_service
from app.services.llm import LLMClient

router = APIRouter(prefix="/production/quick", tags=["Quick Actions"])

_MAX_DOC_CHARS = 48_000


def _truncate(text: str, limit: int = _MAX_DOC_CHARS) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "\n\n[Document truncated for model context limit]"


@router.post("/generate/{document_id}")
async def generate_document_text(document_id: str, payload: DocumentGenerateRequest):
    """On-demand Qwen gist (1 line) or summary (~120 words)."""
    if not is_es_available():
        raise HTTPException(status_code=503, detail="Elasticsearch unavailable")

    doc = document_service.get_validated_document(document_id)
    if not doc:
        # also try search_by_document_id directly
        hit = search_by_document_id(settings.es_validated_index, document_id)
        doc = hit["_source"] if hit else None
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    full_text = _truncate(doc.get("full_text") or "")
    title = doc.get("title") or doc.get("filename") or "Document"
    if not full_text:
        raise HTTPException(status_code=400, detail="Document has no text to summarize")

    mode = (payload.mode or "gist").lower()
    if mode == "summary":
        prompt = (
            f"Title: {title}\n"
            f"{full_text}\n\n"
            "Summarize the document in EXACTLY 120 WORDS without missing the core theme "
            "and most important factual details such as dates or events.\n"
            "Preserve key facts (who, what, where, why, how, outcomes) when present.\n"
            "Do NOT include introductory phrases like 'Here is a summary'.\n"
            "Output ONLY the summary text."
        )
    else:
        mode = "gist"
        prompt = f"""Document Title: {title}

Document Content:
{full_text}

Create a Concise Gist of the complete document. NOT more than 1 line"""

    client = LLMClient(model_name=settings.resolve_quick_model)
    try:
        content = client.generate(prompt, temperature=0.3).strip()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"LLM failed: {exc}") from exc

    return {
        "status": "ok",
        "data": {
            "document_id": document_id,
            "mode": mode,
            "content": content,
        },
    }
