from fastapi import APIRouter

from app.api import panels, processing, quick_actions, taxonomy, threat_library, upload, validation

api_router = APIRouter()

# Mirror NEXUS_BD /api/v1/ingestion/* shape
ingestion = APIRouter(prefix="/ingestion")
ingestion.include_router(upload.router)
ingestion.include_router(validation.router)
ingestion.include_router(processing.router)

api_router.include_router(ingestion)
api_router.include_router(panels.router)
api_router.include_router(quick_actions.router)
api_router.include_router(taxonomy.router)
api_router.include_router(threat_library.router)
