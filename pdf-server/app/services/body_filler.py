"""Real vector PDF faces used for chapter alignment and coloured inserts."""
from pathlib import Path
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, NameObject

INSERT_RGB = {
    "white": (1, 1, 1),
    "yellow": (254 / 255, 249 / 255, 195 / 255),
    "blue": (219 / 255, 234 / 255, 254 / 255),
    "green": (220 / 255, 252 / 255, 231 / 255),
    "pink": (252 / 255, 231 / 255, 243 / 255),
}


def make_body_filler(path: Path, width_mm: float, height_mm: float, color: str = "white") -> Path:
    if color not in INSERT_RGB:
        raise ValueError(f"Unsupported insert colour: {color}")
    if width_mm <= 0 or height_mm <= 0:
        raise ValueError("Body filler needs positive trim dimensions")
    w, h = width_mm * 72 / 25.4, height_mm * 72 / 25.4
    writer = PdfWriter()
    page = writer.add_blank_page(width=w, height=h)
    if color != "white":
        r, g, b = INSERT_RGB[color]
        stream = DecodedStreamObject()
        stream.set_data(f"q {r:.6f} {g:.6f} {b:.6f} rg 0 0 {w:.6f} {h:.6f} re f Q".encode())
        page[NameObject("/Contents")] = writer._add_object(stream)
    with path.open("wb") as output:
        writer.write(output)
    return path