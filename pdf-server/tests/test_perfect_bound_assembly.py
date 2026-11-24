import tempfile
import unittest
from pathlib import Path
from pypdf import PdfReader, PdfWriter
from app.services.perfect_bound_assembly import compose_perfect_bound_wrap


class PerfectBoundAssemblyTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.cover = {"version": 1, "mode": "guided", "trim": {"widthMm": 148, "heightMm": 210}, "spine": {"spineMm": 4.7}, "bleed_mm": 3, "spine_colour": "#185C53", "text_colour": "#FFFFFF", "title": "Safety Booklet", "front": {"page": 0}, "back": {"page": 0}}

    def tearDown(self):
        self.temp.cleanup()

    def pdf(self, name, width, height):
        path = self.root / name
        writer = PdfWriter(); writer.add_blank_page(width * 72 / 25.4, height * 72 / 25.4)
        with open(path, "wb") as f: writer.write(f)
        return path

    def test_guided_wrap_boxes_and_spine_title(self):
        src = self.pdf("panel.pdf", 148, 210)
        output = self.root / "wrap.pdf"
        report = compose_perfect_bound_wrap(self.cover, {"front": src, "back": src}, output)
        pages = PdfReader(output).pages
        self.assertEqual(len(pages), 1)
        self.assertAlmostEqual(float(pages[0].mediabox.width) * 25.4 / 72, 306.7, places=3)
        self.assertAlmostEqual(float(pages[0].mediabox.height) * 25.4 / 72, 216, places=3)
        self.assertAlmostEqual(float(pages[0].trimbox.width) * 25.4 / 72, 300.7, places=3)
        self.assertIn("Safety Booklet", pages[0].extract_text())
        self.assertEqual(len(report["warnings"]), 2)

    def test_rejects_designer_wrap_with_stale_spine(self):
        src = self.pdf("wrong.pdf", 316, 216)
        with self.assertRaisesRegex(ValueError, "dimensions"):
            compose_perfect_bound_wrap({**self.cover, "mode": "wrap", "wrap": {"page": 0}}, {"wrap": src}, self.root / "out.pdf")

    def test_accepts_exact_designer_wrap(self):
        src = self.pdf("wrap.pdf", 306.7, 216)
        output = self.root / "out.pdf"
        compose_perfect_bound_wrap({**self.cover, "mode": "wrap", "wrap": {"page": 0}}, {"wrap": src}, output)
        self.assertAlmostEqual(float(PdfReader(output).pages[0].trimbox.height) * 25.4 / 72, 210, places=3)

    def test_covers_never_take_pages_from_text_block(self):
        with self.assertRaisesRegex(ValueError, "Missing back"):
            compose_perfect_bound_wrap(self.cover, {}, self.root / "out.pdf")