"""Read APIs for WorldMonitor panels (validated docs from Elasticsearch)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query

from app.config import settings
from app.es_client import get_es, is_es_available
from app.services.document_service import document_service

router = APIRouter(prefix="/panels", tags=["Panels"])

# Panel DomainKind → taxonomy domain keyword stored on validated docs
DOMAIN_ALIASES = {
    "political": ["political", "politics", "pol"],
    "diplomatic": ["diplomatic", "diplomacy", "dipl"],
    "international": ["international", "int", "int/info", "multilateral"],
    "cyber": ["cyber", "security"],
    "economy": ["economy", "economic", "eco"],
    "tech": ["tech", "technological", "technology"],
    "health": ["health", "env", "environment", "envmtl", "health & env"],
}


def _normalize_domain(domain: str) -> str:
    return (domain or "").strip().lower()


def _domain_terms(domain: str) -> List[str]:
    key = _normalize_domain(domain)
    terms = DOMAIN_ALIASES.get(key, [key])
    # Also accept exact original casing variants from older seeds
    return list(dict.fromkeys([*terms, key, domain.strip()]))


@router.get("/documents")
async def list_panel_documents(
    domain: Optional[str] = Query(None, description="DomainKind e.g. political"),
    size: int = Query(40, ge=1, le=200),
):
    """List validated documents for a dashboard domain panel."""
    if not is_es_available():
        raise HTTPException(status_code=503, detail="Elasticsearch unavailable")

    es = get_es()
    if domain:
        terms = _domain_terms(domain)
        query: Dict[str, Any] = {
            "bool": {
                "should": [
                    {"terms": {"domains": terms}},
                    {"terms": {"domains.keyword": terms}},
                ],
                "minimum_should_match": 1,
            }
        }
    else:
        query = {"match_all": {}}

    try:
        resp = es.search(
            index=settings.es_validated_index,
            body={
                "query": query,
                "size": size,
                "sort": [{"validated_at": {"order": "desc", "unmapped_type": "date"}}],
                "_source": {
                    "excludes": ["full_text"],
                },
            },
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"ES search failed: {exc}") from exc

    hits = resp.get("hits", {}).get("hits", [])
    items = []
    for hit in hits:
        src = hit.get("_source") or {}
        items.append(
            {
                "document_id": src.get("document_id") or hit.get("_id"),
                "title": src.get("title") or src.get("filename") or "Document",
                "filename": src.get("filename") or "",
                "domains": src.get("domains") or [],
                "categories": src.get("categories") or [],
                "subjects": src.get("subjects") or [],
                "source": src.get("source") or "",
                "geo_tag": src.get("geo_tag") or "",
                "confidence": src.get("confidence"),
                "validated_at": src.get("validated_at"),
                "linked_threats": src.get("linked_threats") or [],
            }
        )

    return {
        "status": "ok",
        "domain": domain,
        "count": len(items),
        "items": items,
    }


@router.get("/documents/{document_id}")
async def get_panel_document(document_id: str):
    """Full validated document (includes text) for panel detail / gist input."""
    doc = document_service.get_validated_document(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"status": "ok", "data": doc}
