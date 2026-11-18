from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models import TaxonomyDomainCreate
from app.services.taxonomy_service import taxonomy_service

router = APIRouter(prefix="/admin/taxonomy", tags=["Taxonomy"])


@router.get("/domains")
async def list_domains():
    return {"domains": taxonomy_service.get_all_domains(), "items": taxonomy_service.list_all()}


@router.post("/domains")
async def upsert_domain(payload: TaxonomyDomainCreate):
    if not payload.domain.strip():
        raise HTTPException(status_code=400, detail="domain required")
    doc = taxonomy_service.upsert_domain(payload.domain.strip(), payload.categories)
    return {"status": "ok", "data": doc}


@router.delete("/domains/{domain}")
async def delete_domain(domain: str):
    deleted = taxonomy_service.delete_domain(domain)
    return {"status": "ok", "deleted": deleted}
