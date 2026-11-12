"""Imposed PDFs must never contain exponent numbers (Acrobat page error)."""
import re
from pathlib import Path

import pikepdf
import pytest

from app.services.pdf_ops import _pdfnum

EXP = re.compile(rb"\d[eE][-+]?\d")


@pytest.mark.parametrize("v,expected", [
    (1.2e-14, "0"), (-3e-12, "0"), (0.0, "0"), (1.0, "1"),
    (0.5, "0.5"), (-12.345678912, "-12.345679"), (1e7, "10000000"),
])
def test_pdfnum_never_uses_exponents(v, expected):
    assert _pdfnum(v) == expected


def test_booklet_has_no_exponent_operands(tmp_path: Path):
    from app.services.pdf_ops import PdfOps  # noqa
    src = tmp_path / "a4.pdf"
    pdf = pikepdf.Pdf.new()
    for _ in range(8):
        pdf.add_blank_page(page_size=(595.2756, 841.8898))
    pdf.save(src)
    out = tmp_path / "bk.pdf"
    PdfOps().booklet_saddle_stitch(src, out, sheet_width_mm=455, sheet_height_mm=320)
    with pikepdf.open(out) as res:
        for page in res.pages:
            for c in page.obj.Contents if isinstance(page.obj.Contents, pikepdf.Array) else [page.obj.Contents]:
                assert not EXP.search(c.read_bytes())
