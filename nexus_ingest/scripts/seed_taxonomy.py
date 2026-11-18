"""Seed dashboard taxonomy hierarchy into ES (domains → categories → subjects)."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.es_client import ensure_indexes, is_es_available
from app.services.taxonomy_service import taxonomy_service

# Domain names match WorldMonitor DomainKind / panel ids (domain-<kind>).
SAMPLE = [
    {
        "domain": "political",
        "categories": [
            {
                "name": "Elections",
                "subjects": [{"name": "Campaign"}, {"name": "Reform"}, {"name": "Interference"}],
            },
            {
                "name": "Governance",
                "subjects": [{"name": "Legislation"}, {"name": "Succession"}],
            },
        ],
    },
    {
        "domain": "diplomatic",
        "categories": [
            {
                "name": "Bilateral",
                "subjects": [{"name": "Demarche"}, {"name": "Ambassador"}],
            },
            {
                "name": "Treaties",
                "subjects": [{"name": "Violation"}, {"name": "Negotiation"}],
            },
        ],
    },
    {
        "domain": "international",
        "categories": [
            {
                "name": "Multilateral",
                "subjects": [{"name": "UN"}, {"name": "Summit"}, {"name": "Sanctions"}],
            },
            {
                "name": "InfoOps",
                "subjects": [{"name": "Media"}, {"name": "Influence"}],
            },
        ],
    },
    {
        "domain": "cyber",
        "categories": [
            {
                "name": "Intrusion",
                "subjects": [{"name": "Malware"}, {"name": "Ransomware"}, {"name": "Phishing"}],
            },
            {
                "name": "Infrastructure",
                "subjects": [{"name": "Grid"}, {"name": "ICS"}],
            },
        ],
    },
    {
        "domain": "economy",
        "categories": [
            {
                "name": "Macro",
                "subjects": [{"name": "Inflation"}, {"name": "Rates"}, {"name": "Trade"}],
            },
            {
                "name": "Commodities",
                "subjects": [{"name": "Energy"}, {"name": "Food"}],
            },
        ],
    },
    {
        "domain": "tech",
        "categories": [
            {
                "name": "AI",
                "subjects": [{"name": "Regulation"}, {"name": "Autonomy"}],
            },
            {
                "name": "Platforms",
                "subjects": [{"name": "Cloud"}, {"name": "IP Theft"}],
            },
        ],
    },
    {
        "domain": "health",
        "categories": [
            {
                "name": "Outbreak",
                "subjects": [{"name": "Disease"}, {"name": "Biosecurity"}],
            },
            {
                "name": "Environment",
                "subjects": [{"name": "Disaster"}, {"name": "Climate"}],
            },
        ],
    },
]


def main() -> None:
    if not is_es_available():
        raise SystemExit("Elasticsearch unavailable — set ELASTICSEARCH_PASSWORD in .env")
    ensure_indexes()
    for item in SAMPLE:
        taxonomy_service.upsert_domain(item["domain"], item["categories"])
        print(f"Seeded domain: {item['domain']}")
    print("Done. Domains:", taxonomy_service.get_all_domains())


if __name__ == "__main__":
    main()
