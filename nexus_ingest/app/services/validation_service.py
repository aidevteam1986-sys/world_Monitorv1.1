from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Tuple

from app.prompts.tagging_prompts import (
    build_stage1_tagging_prompt,
    build_stage2_tagging_prompt,
    build_stage3_tagging_prompt,
)
from app.services.document_service import document_service
from app.services.llm import LLMClient
from app.services.taxonomy_service import taxonomy_service
from app.services.text_cleanup import clean_extracted_text
from app.config import settings

logger = logging.getLogger("nexus_ingest")


def _extract_json_obj(text: str) -> Dict[str, Any]:
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError("No JSON object in LLM response")
    raw = match.group()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        fixed = re.sub(r",(\s*[}\]])", r"\1", raw.replace("'", '"'))
        return json.loads(fixed)


def _extract_json_array(text: str) -> List[Any]:
    match = re.search(r"\[.*?\]", text, re.DOTALL)
    if not match:
        return []
    raw = match.group()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        fixed = re.sub(r",(\s*[}\]])", r"\1", raw.replace("'", '"'))
        try:
            return json.loads(fixed)
        except json.JSONDecodeError:
            return []


class ValidationService:
    def _get_llm(self) -> LLMClient:
        return LLMClient(model_name=settings.resolve_tagging_model)

    def generate_auto_tags(self, text: str) -> Dict[str, Any]:
        """3-stage taxonomy tagging with Qwen (same flow as NEXUS_BD)."""
        llm = self._get_llm()
        # Defense for docs already stored with Docling base64 image embeds.
        text = clean_extracted_text(text)
        text_short = text[:4000] + "..." if len(text) > 4000 else text

        stage1 = self._stage1(llm, text_short)
        domains, categories = self._stage2(llm, text_short, stage1)
        subjects = self._stage3(llm, text_short, domains, categories)

        return {
            "title": stage1.get("title") or "Document",
            "source": stage1.get("source") or "unknown",
            "language": stage1.get("language") or "en",
            "domains": domains,
            "categories": categories,
            "subjects": subjects,
            "raw_tags": stage1.get("tags") or [],
            "raw_ner": stage1.get("ner"),
            "confidence": stage1.get("confidence"),
        }

    def _stage1(self, llm: LLMClient, text: str) -> Dict[str, Any]:
        try:
            domains = taxonomy_service.get_all_domains()
            domains_str = ", ".join(domains) if domains else "Not available"
        except Exception as exc:
            logger.warning("taxonomy domains fetch failed: %s", exc)
            domains_str = "Not available"

        prompt = build_stage1_tagging_prompt(domains_str, text)
        response = llm.invoke(prompt)
        try:
            return _extract_json_obj(response)
        except Exception:
            logger.warning("Stage1 JSON parse failed; using fallback")
            return {
                "title": "Unknown",
                "source": "unknown",
                "language": "en",
                "domains": [],
                "tags": [],
                "ner": {"persons": [], "organizations": [], "locations": [], "dates": []},
                "confidence": 0.5,
            }

    def _stage2(
        self, llm: LLMClient, text: str, stage1: Dict[str, Any]
    ) -> Tuple[List[str], List[str]]:
        suggested = stage1.get("domains") or []
        if isinstance(suggested, str):
            suggested = [suggested]

        validated_domains: List[str] = []
        category_infos: List[Dict[str, Any]] = []
        try:
            available = taxonomy_service.get_all_domains()
            for sug in suggested[:3]:
                for avail in available:
                    if avail.lower() == str(sug).lower().strip():
                        validated_domains.append(avail)
                        domain_data = taxonomy_service.get_domain(avail)
                        if domain_data:
                            for cat in domain_data.get("categories") or []:
                                category_infos.append(
                                    {
                                        "domain": avail,
                                        "category": cat["name"],
                                        "subjects": [
                                            s["name"] for s in cat.get("subjects", [])
                                        ],
                                    }
                                )
                        break
        except Exception as exc:
            logger.warning("Stage2 domain validation failed: %s", exc)

        if not category_infos:
            return validated_domains, []

        categories_str = ", ".join(f'"{c["category"]}"' for c in category_infos)
        prompt = build_stage2_tagging_prompt(categories_str, text)
        response = llm.invoke(prompt)
        suggested_cats = _extract_json_array(response)

        validated_categories: List[str] = []
        for sug in suggested_cats[:5]:
            for info in category_infos:
                if info["category"].lower() == str(sug).lower().strip():
                    validated_categories.append(info["category"])
                    break
        if not validated_categories:
            validated_categories = [category_infos[0]["category"]]
        return validated_domains, validated_categories

    def _stage3(
        self,
        llm: LLMClient,
        text: str,
        domains: List[str],
        categories: List[str],
    ) -> List[str]:
        subjects: List[str] = []
        try:
            for domain in domains:
                domain_data = taxonomy_service.get_domain(domain)
                if not domain_data:
                    continue
                for cat in domain_data.get("categories") or []:
                    if cat["name"] in categories:
                        subjects.extend(s["name"] for s in cat.get("subjects", []))
        except Exception as exc:
            logger.warning("Stage3 subject collect failed: %s", exc)

        subjects = list(dict.fromkeys(subjects))
        if not subjects:
            return []

        subjects_str = ", ".join(f'"{s}"' for s in subjects[:50])
        prompt = build_stage3_tagging_prompt(subjects_str, text)
        response = llm.invoke(prompt)
        suggested = _extract_json_array(response)

        validated: List[str] = []
        for sug in suggested[:5]:
            for s in subjects:
                if s.lower() == str(sug).lower().strip():
                    validated.append(s)
                    break
        return validated

    def validate_and_save_document(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return document_service.validate_document(payload)


validation_service = ValidationService()
