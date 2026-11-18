from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.config import settings
from app.es_client import get_es, search_by_document_id

logger = logging.getLogger("nexus_ingest")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_terms(values: Any) -> List[str]:
    if not values:
        return []
    if isinstance(values, str):
        values = [values]
    out = []
    for v in values:
        s = str(v).strip()
        if s:
            out.append(s)
    return out


class ThreatLibraryService:
    def list_threats(self) -> List[Dict[str, Any]]:
        es = get_es()
        result = es.search(
            index=settings.es_threat_library_index,
            body={"query": {"match_all": {}}, "size": 5000},
        )
        items = []
        for hit in result["hits"]["hits"]:
            src = hit["_source"]
            src["_id"] = hit["_id"]
            items.append(src)
        return items

    def create_threat(
        self,
        name: str,
        aliases: Optional[List[str]] = None,
        iocs: Optional[List[str]] = None,
        threat_type: str = "actor",
        severity: str = "medium",
        description: str = "",
    ) -> Dict[str, Any]:
        es = get_es()
        doc = {
            "threat_id": str(uuid.uuid4()),
            "name": name.strip(),
            "aliases": _normalize_terms(aliases),
            "iocs": _normalize_terms(iocs),
            "threat_type": threat_type,
            "severity": severity,
            "description": description or "",
            "created_at": _utc_now(),
        }
        resp = es.index(
            index=settings.es_threat_library_index,
            body=doc,
            refresh="wait_for",
        )
        doc["_id"] = resp["_id"]
        return doc

    def delete_threat(self, threat_id: str) -> int:
        es = get_es()
        result = es.delete_by_query(
            index=settings.es_threat_library_index,
            body={"query": {"term": {"threat_id": threat_id}}},
            refresh=True,
        )
        return int(result.get("deleted", 0))

    @staticmethod
    def _term_in_text(term: str, text: str, text_lower: str) -> bool:
        t = term.lower()
        if " " in t or any(ch.isdigit() for ch in t):
            return t in text_lower
        # word-boundary for short single tokens
        return re.search(rf"\b{re.escape(t)}\b", text_lower) is not None

    @staticmethod
    def _extract_evidence(text: str, term: str, window: int = 80) -> str:
        lower = text.lower()
        idx = lower.find(term.lower())
        if idx < 0:
            return ""
        start = max(0, idx - window)
        end = min(len(text), idx + len(term) + window)
        return text[start:end].replace("\n", " ").strip()

    @staticmethod
    def _match_rank(m: Dict[str, Any]) -> int:
        mt = m.get("match_type")
        if mt == "name":
            return 0
        if mt == "ioc":
            return 1
        return 2

    def match_text(self, text: str) -> List[Dict[str, Any]]:
        """Confirmed links: exact name / alias / IOC keyword hits (same as NEXUS)."""
        if not text or not text.strip():
            return []
        threats = self.list_threats()
        if not threats:
            return []

        text_lower = text.lower()
        matches: List[Dict[str, Any]] = []

        for threat in threats:
            name = (threat.get("name") or "").strip()
            aliases = _normalize_terms(threat.get("aliases"))
            iocs = _normalize_terms(threat.get("iocs"))
            candidates = []
            if name:
                candidates.append(("name", name))
            for a in aliases:
                candidates.append(("alias", a))
            for ioc in iocs:
                candidates.append(("ioc", ioc))

            best: Optional[Dict[str, Any]] = None
            for match_type, term in candidates:
                if len(term) < 3:
                    continue
                if self._term_in_text(term, text, text_lower):
                    candidate = {
                        "threat_id": threat.get("threat_id") or threat.get("id"),
                        "name": name,
                        "threat_type": threat.get("threat_type") or "actor",
                        "severity": threat.get("severity") or "medium",
                        "match_type": match_type,
                        "matched_term": term,
                        "confidence": "high" if match_type in ("name", "ioc") else "medium",
                        "link_status": "confirmed",
                        "evidence": self._extract_evidence(text, term),
                    }
                    if best is None or self._match_rank(candidate) < self._match_rank(best):
                        best = candidate
            if best:
                matches.append(best)

        matches.sort(key=lambda m: (self._match_rank(m), m.get("name") or ""))
        return matches

    def find_related_documents(
        self,
        document_id: str,
        linked_threats: List[Dict[str, Any]],
        title: Optional[str] = None,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """Find other validated docs sharing confirmed threat ids."""
        if not linked_threats:
            return []
        threat_ids = {
            str(t.get("threat_id"))
            for t in linked_threats
            if t.get("threat_id")
        }
        if not threat_ids:
            return []

        es = get_es()
        # linked_threats is a plain object mapping — filter in Python
        related: Dict[str, Dict[str, Any]] = {}
        result = es.search(
            index=settings.es_validated_index,
            body={
                "size": 200,
                "query": {
                    "bool": {
                        "must_not": [{"term": {"document_id": document_id}}]
                    }
                },
                "_source": ["document_id", "title", "linked_threats"],
            },
        )
        hits = result.get("hits", {}).get("hits", [])

        for hit in hits:
            src = hit["_source"]
            other_id = src.get("document_id")
            if not other_id or other_id == document_id:
                continue
            other_threats = src.get("linked_threats") or []
            shared = [
                t.get("name") or t.get("threat_id")
                for t in other_threats
                if str(t.get("threat_id")) in threat_ids
            ]
            if not shared:
                continue
            related[other_id] = {
                "document_id": other_id,
                "title": src.get("title") or "Untitled",
                "relation": "shared_threat",
                "shared_threats": shared,
                "confidence": "high",
            }
            if len(related) >= limit:
                break
        return list(related.values())[:limit]

    def analyze_document(
        self,
        document_id: str,
        text: str,
        title: Optional[str] = None,
    ) -> Dict[str, Any]:
        linked = self.match_text(text)
        related = self.find_related_documents(
            document_id=document_id,
            linked_threats=linked,
            title=title,
        )
        return {
            "linked_threats": linked,
            "probable_threats": [],
            "related_documents": related,
            "has_threat_link": len(linked) > 0 or len(related) > 0,
        }

    def persist_links_on_validated(
        self,
        document_id: str,
        linked_threats: List[Dict[str, Any]],
        related_documents: List[Dict[str, Any]],
        probable_threats: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        hit = search_by_document_id(settings.es_validated_index, document_id)
        if not hit:
            logger.warning("ThreatLibrary: validated doc %s not found", document_id)
            return
        doc_patch: Dict[str, Any] = {
            "linked_threats": linked_threats,
            "related_documents": related_documents,
            "threat_matched_at": _utc_now(),
        }
        if probable_threats is not None:
            doc_patch["probable_threats"] = probable_threats
        get_es().update(
            index=settings.es_validated_index,
            id=hit["_id"],
            body={"doc": doc_patch},
            refresh="wait_for",
        )


threat_library_service = ThreatLibraryService()
