"""LLM prompt templates for auto-tagging (mirrors NEXUS_BD)."""


def build_stage1_tagging_prompt(domains_str: str, document_text: str) -> str:
    return f"""
Analyze this document and extract metadata. Return ONLY valid JSON:

{{
    "title": "extracted or generated title (max 10 words)",
    "source": "document type (news, report, article, intelligence, analysis)",
    "language": "2-letter ISO code (en, zh, es, fr, ar, ru, etc.)",
    "domains": ["domain1", "domain2"],
    "tags": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
    "ner": {{
        "persons": ["person1", "person2"],
        "organizations": ["org1", "org2"],
        "locations": ["location1", "location2"],
        "dates": ["date1", "date2"]
    }},
    "confidence": 0.85
}}

INSTRUCTIONS:
- TITLE: Extract title or generate concise one
- SOURCE: Classify document type
- LANGUAGE: Detect language (2-letter code)
- DOMAINS: Select 1-3 from: {domains_str}
- TAGS: 5 keywords
- NER: Extract named entities
- CONFIDENCE: Accuracy rating (0.0-1.0)

Document:
{document_text}


JSON:"""


def build_stage2_tagging_prompt(categories_str: str, document_text: str) -> str:
    excerpt = f"{document_text[:1000]}..."
    return f"""
You must select 1-5 categories from the EXACT list below. Do NOT create new categories.

AVAILABLE CATEGORIES (choose from these ONLY):
{categories_str}

Document text:
{excerpt}

Return ONLY a JSON array with your selections. Example: ["category1", "category2"]

JSON:"""


def build_stage3_tagging_prompt(subjects_str: str, document_text: str) -> str:
    excerpt = f"{document_text[:1000]}..."
    return f"""
You must select 2-5 subjects from the EXACT list below. Do NOT create new subjects.

AVAILABLE SUBJECTS (choose from these ONLY):
{subjects_str}

Document text:
{excerpt}

Return ONLY a JSON array with your selections. Example: ["subject1", "subject2"]

JSON:"""
