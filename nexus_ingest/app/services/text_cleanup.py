"""Strip embedded binary/image noise from OCR markdown before store/tag."""

from __future__ import annotations

import re

# Markdown image with data-URI payload: ![alt](data:image/png;base64,...)
# Newlines are allowed inside the base64; spaces are not (avoids eating prose).
_DATA_URI_MD_IMAGE = re.compile(
    r"!\[[^\]]*\]\(\s*data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\n\r]+\)",
    re.IGNORECASE,
)

# Bare data-URI (HTML <img src=...> or leaked blob). Allow newlines inside
# the payload, but not spaces — spaces usually mean following prose.
_BARE_DATA_URI = re.compile(
    r"data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\n\r]{80,}",
    re.IGNORECASE,
)

# Long base64 runs that are not valid prose (defense for truncated markers)
_LONG_BASE64_RUN = re.compile(r"(?<![A-Za-z0-9+/=])[A-Za-z0-9+/]{400,}={0,2}")

_MULTI_BLANK = re.compile(r"\n{3,}")


def clean_extracted_text(text: str | None) -> str:
    """
    Remove Docling-style embedded images so tagging/display see real prose.

    Without this, the first ~4k chars of a PDF md export are often base64,
    which yields titles like "Analysis of Base64 Encoded Image Data".
    """
    if not text:
        return ""

    cleaned = _DATA_URI_MD_IMAGE.sub("[image omitted]", text)
    cleaned = _BARE_DATA_URI.sub("[image omitted]", cleaned)
    cleaned = _LONG_BASE64_RUN.sub("[binary omitted]", cleaned)
    cleaned = _MULTI_BLANK.sub("\n\n", cleaned)
    return cleaned.strip()
