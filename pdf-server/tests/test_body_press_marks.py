import tempfile, unittest
from pathlib import Path
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from app.services.body_press_marks import add_body_press_marks

K = 72 / 25.4

class BodyPressMarksTest(unittest.TestCase):
    def test_mixed_bleed_and_plain_pages_share_one_press_sheet(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            bled = d / "bled.pdf"  # A5 with 3 mm bleed + 10 mm crop-mark area
            c = canvas.Canvas(str(bled), pagesize=(174 * mm, 236 * mm)); c.showPage(); c.save()
            w = PdfWriter(clone_from=str(bled)); pg = w.pages[0]
            pg.trimbox = RectangleObject([13 * mm, 13 * mm, 161 * mm, 223 * mm])
            pg.bleedbox = RectangleObject([10 * mm, 10 * mm, 164 * mm, 226 * mm])
            plain = d / "plain.pdf"
            c = canvas.Canvas(str(plain), pagesize=(148 * mm, 210 * mm)); c.showPage(); c.save()
            w.append(str(plain))
            src = d / "src.pdf"; w.write(str(src))
            out = d / "out.pdf"
            report = add_body_press_marks(src, out, 148, 210)
            self.assertEqual(report["pages_with_source_bleed"], 1)
            for p in PdfReader(out).pages:
                self.assertAlmostEqual(float(p.mediabox.width) / K, 168, places=2)
                self.assertAlmostEqual(float(p.mediabox.height) / K, 230, places=2)
                self.assertEqual([round(float(v) / K, 2) for v in p.trimbox], [10, 10, 158, 220])
                self.assertEqual([round(float(v) / K, 2) for v in p.bleedbox], [7, 7, 161, 223])
                self.assertIn(b" l", p.get_contents().get_data())

if __name__ == "__main__":
    unittest.main()
