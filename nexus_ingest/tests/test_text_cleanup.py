"""Unit tests for Docling base64 image stripping."""

from __future__ import annotations

import unittest

from app.services.text_cleanup import clean_extracted_text


class CleanExtractedTextTests(unittest.TestCase):
    def test_strips_markdown_data_uri_image(self) -> None:
        blob = "A" * 500
        dirty = (
            "*********************\n\n"
            f"![Image](data:image/png;base64,{blob})\n\n"
            "## India-Pakistan Conflict in Spring 2025\n\n"
            "India and Pakistan in early May 2025 engaged in fighting.\n"
        )
        cleaned = clean_extracted_text(dirty)
        self.assertNotIn("base64", cleaned.lower())
        self.assertIn("[image omitted]", cleaned)
        self.assertIn("India-Pakistan Conflict in Spring 2025", cleaned)
        self.assertLess(len(cleaned), 500)

    def test_strips_bare_data_uri(self) -> None:
        blob = "B" * 200
        dirty = f"prefix data:image/jpeg;base64,{blob} suffix prose about Kashmir"
        cleaned = clean_extracted_text(dirty)
        self.assertNotIn("data:image", cleaned.lower())
        self.assertIn("Kashmir", cleaned)

    def test_first_4k_is_prose_after_cleanup(self) -> None:
        blob = "C" * 12000
        dirty = (
            f"![Image](data:image/png;base64,{blob})\n\n"
            "# India-Pakistan Conflict in Spring 2025\n\n"
            "On April 22, 2025, gunmen killed 26 people near Pahalgam.\n"
        )
        cleaned = clean_extracted_text(dirty)
        head = cleaned[:4000]
        self.assertIn("India-Pakistan", head)
        self.assertNotIn("base64", head.lower())

    def test_empty_and_none(self) -> None:
        self.assertEqual(clean_extracted_text(""), "")
        self.assertEqual(clean_extracted_text(None), "")


if __name__ == "__main__":
    unittest.main()
