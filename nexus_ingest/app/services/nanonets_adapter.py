"""
Optional Nanonets OCR adapter.

By default USE_NANONETS=false. To enable scanned OCR like NEXUS_BD:
  1) Copy NanonetsOCR + image helpers from NEXUS_BD into this project, OR
  2) Implement run_nanonets(path) below to call your local Nanonets service.
"""


def run_nanonets(path: str) -> str:
    raise NotImplementedError(
        "Nanonets OCR not bundled. Set USE_NANONETS=false or implement run_nanonets()."
    )
