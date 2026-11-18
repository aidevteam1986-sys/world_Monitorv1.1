"""Seed sample threat library entries for keyword linking."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.es_client import ensure_indexes, is_es_available
from app.services.threat_library_service import threat_library_service

SAMPLE = [
    {
        "name": "APT29",
        "aliases": ["Cozy Bear", "The Dukes"],
        "iocs": [],
        "threat_type": "actor",
        "severity": "high",
        "description": "Sample advanced persistent threat actor",
    },
    {
        "name": "Emotet",
        "aliases": ["Geodo"],
        "iocs": ["example-emotet-c2.invalid"],
        "threat_type": "malware",
        "severity": "high",
        "description": "Sample banking trojan / malware family",
    },
]


def main() -> None:
    if not is_es_available():
        raise SystemExit("Elasticsearch unavailable")
    ensure_indexes()
    for item in SAMPLE:
        doc = threat_library_service.create_threat(**item)
        print(f"Seeded threat: {doc['name']} ({doc['threat_id']})")
    print("Total threats:", len(threat_library_service.list_threats()))


if __name__ == "__main__":
    main()
