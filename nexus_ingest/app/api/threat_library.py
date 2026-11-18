from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models import ThreatCreate
from app.services.threat_library_service import threat_library_service

router = APIRouter(prefix="/admin/threat-library", tags=["Threat Library"])


@router.get("/threats")
async def list_threats():
    return {"threats": threat_library_service.list_threats()}


@router.post("/threats")
async def create_threat(payload: ThreatCreate):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="name required")
    doc = threat_library_service.create_threat(
        name=payload.name,
        aliases=payload.aliases,
        iocs=payload.iocs,
        threat_type=payload.threat_type,
        severity=payload.severity,
        description=payload.description,
    )
    return {"status": "ok", "data": doc}


@router.delete("/threats/{threat_id}")
async def delete_threat(threat_id: str):
    deleted = threat_library_service.delete_threat(threat_id)
    return {"status": "ok", "deleted": deleted}
