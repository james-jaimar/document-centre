"""A5 with bleed + crops scaled to A4 keeps an A4 trim and a 3 mm bleed."""
from pathlib import Path
import pikepdf
from app.services.pdf_ops import PdfOps

MM = 72 / 25.4


def test_a5_with_crops_scales_trim_to_a4(tmp_path: Path):
    src = tmp_path / "a5.pdf"
    pdf = pikepdf.Pdf.new()
    off = 21  # crop-mark area like the customer's file
    w, h = 148 * MM + 2 * off, 210 * MM + 2 * off
    pdf.add_blank_page(page_size=(w, h))
    pg = pdf.pages[0]
    pg.TrimBox = [off, off, w - off, h - off]
    pg.BleedBox = [off - 3 * MM, off - 3 * MM, w - off + 3 * MM, h - off + 3 * MM]
    pdf.save(src)
    out = tmp_path / "a4.pdf"
    PdfOps().resize_pages(src, out, 210, 297, respect_trim_box=True, target_bleed_mm=3.0)
    with pikepdf.open(out) as r:
        p = r.pages[0]
        t = [float(x) for x in p.TrimBox]
        m = [float(x) for x in p.MediaBox]
        assert abs((t[2] - t[0]) / MM - 210) < 0.1
        assert abs((t[3] - t[1]) / MM - 297) < 0.1
        assert abs((m[2] - m[0]) / MM - 216) < 0.1
        assert abs((m[3] - m[1]) / MM - 303) < 0.1
