from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class DocumentGenerateRequest(BaseModel):
    mode: str = Field(default="gist", description="gist | summary")


class ProcessingRequest(BaseModel):
    document_id: str


class ValidatedDocumentPayload(BaseModel):
    document_id: str
    filename: str = ""
    full_text: str
    title: str = "Document"
    domains: List[str] = Field(default_factory=list)
    categories: List[str] = Field(default_factory=list)
    subjects: List[str] = Field(default_factory=list)
    geo_tag: Optional[str] = None
    language: str = "en"
    source: Optional[str] = None
    raw_tags: List[str] = Field(default_factory=list)
    raw_ner: Optional[Dict[str, Any]] = None
    confidence: Optional[float] = None


class TaxonomyDomainCreate(BaseModel):
    domain: str
    categories: List[Dict[str, Any]] = Field(default_factory=list)


class ThreatCreate(BaseModel):
    name: str
    aliases: List[str] = Field(default_factory=list)
    iocs: List[str] = Field(default_factory=list)
    threat_type: str = "actor"
    severity: str = "medium"
    description: str = ""
