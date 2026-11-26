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
        self.assertAlmostEqual(float(pages[0].mediabox.width) * 25.4 / 72, 320.7, places=3)
        self.assertAlmostEqual(float(pages[0].mediabox.height) * 25.4 / 72, 230, places=3)
        self.assertAlmostEqual(float(pages[0].trimbox.width) * 25.4 / 72, 300.7, places=3)
        self.assertIn("Safety Booklet", pages[0].extract_text())
        self.assertEqual(len(report["warnings"]), 2)

    def test_guided_accepts_any_size_front_and_flat_colour_back(self):
        src = self.pdf("b5ish.pdf", 170.2, 236)
        cover = {**self.cover, "back_blank": "colour", "back_colour": "#AA0000"}
        report = compose_perfect_bound_wrap(cover, {"front": src}, self.root / "odd.pdf")
        self.assertAlmostEqual(report["width_mm"], 320.7, places=3)
        self.assertAlmostEqual(report["bleed_width_mm"], 306.7, places=3)

    def test_rejects_designer_wrap_with_stale_spine(self):
        src = self.pdf("wrong.pdf", 316, 216)
        with self.assertRaisesRegex(ValueError, "dimensions"):
            compose_perfect_bound_wrap({**self.cover, "mode": "wrap", "wrap": {"page": 0}}, {"wrap": src}, self.root / "out.pdf")

    def test_accepts_exact_designer_wrap(self):
        src = self.pdf("wrap.pdf", 306.7, 216)
        output = self.root / "out.pdf"
        compose_perfect_bound_wrap({**self.cover, "mode": "wrap", "wrap": {"page": 0}}, {"wrap": src}, output)
        self.assertAlmostEqual(float(PdfReader(output).pages[0].trimbox.height) * 25.4 / 72, 210, places=3)

    def test_front_cover_uses_trimbox_of_larger_sheet(self):
        from pypdf.generic import RectangleObject
        k = 72 / 25.4
        path = self.root / "spread.pdf"
        writer = PdfWriter(); page = writer.add_blank_page(300 * k, 210 * k)
        page.trimbox = RectangleObject([152 * k, 0, 300 * k, 210 * k])
        with open(path, "wb") as f: writer.write(f)
        cover = {**self.cover, "back_blank": "white"}
        report = compose_perfect_bound_wrap(cover, {"front": path}, self.root / "out.pdf")
        self.assertEqual(len(report["warnings"]), 1)
        plain = self.pdf("plain.pdf", 300, 210)
        compose_perfect_bound_wrap(cover, {"front": plain}, self.root / "out2.pdf")  # guided covers are fitted, not rejected

    def test_covers_never_take_pages_from_text_block(self):
        with self.assertRaisesRegex(ValueError, "Missing (front|back)"):
            compose_perfect_bound_wrap(self.cover, {}, self.root / "out.pdf")

    def test_both_modes_have_three_mm_bleed_and_visible_crop_marks(self):
        from pypdf.generic import ContentStream
        k = 72 / 25.4
        for mode in ("guided", "wrap"):
            with self.subTest(mode=mode):
                src = self.pdf(f"{mode}.pdf", 306.7 if mode == "wrap" else 154, 216)
                cover = {**self.cover, "mode": mode, "wrap": {"page": 0}}
                output = self.root / f"{mode}-press.pdf"
                report = compose_perfect_bound_wrap(cover, {"wrap": src} if mode == "wrap" else {"front": src, "back": src}, output)
                reader = PdfReader(output)
                page = reader.pages[0]
                self.assertEqual(list(page.cropbox), list(page.mediabox))
                for actual, expected in zip(page.bleedbox, [7, 7, 313.7, 223]):
                    self.assertAlmostEqual(float(actual) / k, expected, places=3)
                for actual, expected in zip(page.trimbox, [10, 10, 310.7, 220]):
                    self.assertAlmostEqual(float(actual) / k, expected, places=3)
                marks = []
                start = None
                for args, op in ContentStream(page.get_contents(), reader).operations:
                    if op == b"m":
                        start = tuple(float(v) / k for v in args)
                    elif op == b"l" and start is not None:
                        marks.append((start, tuple(float(v) / k for v in args)))
                expected_marks = [
                    ((10, 1), (10, 6)), ((10, 224), (10, 229)),
                    ((310.7, 1), (310.7, 6)), ((310.7, 224), (310.7, 229)),
                    ((1, 10), (6, 10)), ((314.7, 10), (319.7, 10)),
                    ((1, 220), (6, 220)), ((314.7, 220), (319.7, 220)),
                ]
                self.assertEqual(len(marks), 8)
                for actual, expected in zip(marks, expected_marks):
                    for point, expected_point in zip(actual, expected):
                        for value, expected_value in zip(point, expected_point):
                            self.assertAlmostEqual(value, expected_value, places=3)
                self.assertTrue(report["crop_marks"])

class PerfectBoundPlacementTest(PerfectBoundAssemblyTest):
    def test_blank_back_needs_only_front(self):
        src = self.pdf("front.pdf", 154, 216)
        output = self.root / "wrap.pdf"
        report = compose_perfect_bound_wrap({**self.cover, "back_blank": "white"}, {"front": src}, output)
        self.assertEqual(report["warnings"], [])
        self.assertAlmostEqual(float(PdfReader(output).pages[0].mediabox.width) * 25.4 / 72, 320.7, places=3)

    def test_rejects_unknown_blank_back(self):
        src = self.pdf("front.pdf", 154, 216)
        with self.assertRaisesRegex(ValueError, "blank back"):
            compose_perfect_bound_wrap({**self.cover, "back_blank": "pink"}, {"front": src}, self.root / "o.pdf")

    def test_default_frame_fills_trim_plus_bleed(self):
        from app.services.perfect_bound_assembly import placement_frame
        self.assertEqual(placement_frame(148, 210, 3, None), (-3, -3, 154, 216))

    def test_zoom_keeps_centre_and_offset_moves(self):
        from app.services.perfect_bound_assembly import placement_frame
        left, top, fw, fh = placement_frame(148, 210, 3, {"scale": 2, "x": 10, "y": -5})
        self.assertEqual((fw, fh), (308, 432))
        self.assertAlmostEqual(left + fw / 2, 74 + 10)
        self.assertAlmostEqual(top + fh / 2, 105 - 5)

    def test_rejects_extreme_zoom(self):
        src = self.pdf("front.pdf", 154, 216)
        with self.assertRaisesRegex(ValueError, "zoom"):
            compose_perfect_bound_wrap({**self.cover, "back_blank": "white", "front": {"page": 0, "placement": {"scale": 9}}}, {"front": src}, self.root / "o.pdf")

    def test_spine_font_respects_safe_margin(self):
        from app.services.perfect_bound_assembly import spine_font_size_pt
        # 5 mm spine minus 1.5 mm each side leaves 2 mm; text must fit inside it.
        self.assertLessEqual(spine_font_size_pt(5, 210, "A", "Helvetica"), 2 * 72 / 25.4)
        with self.assertRaisesRegex(ValueError, "spine font"):
            compose_perfect_bound_wrap({**self.cover, "back_blank": "white", "spine_font": "comic"}, {"front": self.pdf("f.pdf", 154, 216)}, self.root / "o.pdf")
