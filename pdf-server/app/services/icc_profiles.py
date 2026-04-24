"""
ICC profile resolution for print-ready CMYK conversion.

Profiles are bundled at /opt/document-centre-api/profiles. Each is referenced
by a short slug (e.g. 'fogra39') chosen by the admin in the product family
configuration; this module maps the slug to an absolute filesystem path.

Currently bundled:
  - fogra39  → ISOcoated_v2_eci.icc      (ISO Coated v2 / Fogra 39)
  - fogra51  → PSOcoated_v3.icc          (PSO Coated v3 / Fogra 51)
  - srgb     → sRGB_v4_ICC_preference.icc (default RGB source profile)

To add a new profile: drop the .icc file into PROFILES_DIR and add an entry
to PROFILE_MAP below. No code changes needed elsewhere.
"""
from __future__ import annotations

from pathlib import Path

PROFILES_DIR = Path("/opt/document-centre-api/profiles")

PROFILE_MAP: dict[str, str] = {
    "fogra39": "ISOcoated_v2_eci.icc",
    "fogra51": "PSOcoated_v3.icc",
    "srgb": "sRGB_v4_ICC_preference.icc",
}

# Ghostscript -dRenderIntent values:
#   0 = Perceptual
#   1 = RelativeColorimetric
#   2 = Saturation
#   3 = AbsoluteColorimetric
RENDER_INTENT_MAP: dict[str, int] = {
    "perceptual": 0,
    "relative_colorimetric": 1,
    "saturation": 2,
    "absolute_colorimetric": 3,
}


def resolve_profile(slug: str) -> Path:
    """Return absolute path for the profile slug. Raises if missing."""
    filename = PROFILE_MAP.get(slug.lower())
    if not filename:
        raise ValueError(
            f"Unknown ICC profile slug: {slug!r}. "
            f"Known: {sorted(PROFILE_MAP.keys())}"
        )
    path = PROFILES_DIR / filename
    if not path.exists():
        raise FileNotFoundError(
            f"ICC profile {slug!r} mapped to {path} but file does not exist. "
            f"Install bundled profiles into {PROFILES_DIR}."
        )
    return path


def resolve_intent(intent: str) -> int:
    """Map admin-facing intent slug to Ghostscript -dRenderIntent value."""
    value = RENDER_INTENT_MAP.get(intent.lower())
    if value is None:
        raise ValueError(
            f"Unknown render intent: {intent!r}. "
            f"Known: {sorted(RENDER_INTENT_MAP.keys())}"
        )
    return value
