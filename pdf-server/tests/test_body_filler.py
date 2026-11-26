import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pypdf import PdfReader, PdfWriter
from app.services.body_filler import make_body_filler


def run_worker_directive_loop(tmp_path, directives, counts):
    """Run the actual worker's source/blank/insert loop without Cloud Run services."""
    import ast
    import shutil
    from types import SimpleNamespace
    from pypdf.generic import NameObject, TextStringObject

    sources = {}
    for name, count in counts.items():
        path = tmp_path / f"source-{name}.pdf"
        writer = PdfWriter()
        for n in range(count):
            page = writer.add_blank_page(width=210 * 72 / 25.4, height=297 * 72 / 25.4)
            page[NameObject("/SourceFace")] = TextStringObject(f"{name}:{n}")
        with path.open("wb") as output:
            writer.write(output)
        sources[name] = (f"{name}.pdf", str(path))
    worker_path = Path(__file__).resolve().parents[1] / "app/tasks/production_tasks.py"
    tree = ast.parse(worker_path.read_text())
    task = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "assemble_print_ready_for_job")
    block = next(n for n in ast.walk(task) if isinstance(n, ast.With) and any(
        isinstance(s, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "directives" for t in s.targets) for s in n.body
    ))
    end = next(i for i, n in enumerate(block.body) if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "job_number" for t in n.targets))
    scope = {
        "bundle": SimpleNamespace(configuration={"merge_directives": directives}, section_paths=sources, asset_paths=list(sources.values())),
        "target": SimpleNamespace(width_mm=210, height_mm=297, orientation="portrait", colour_mode="colour"),
        "ws": SimpleNamespace(path=lambda name: tmp_path / name),
        "storage": SimpleNamespace(download=lambda source, dest: shutil.copyfile(source, dest)),
        "Path": Path, "make_body_filler": make_body_filler, "steps": [], "warnings": [],
    }
    exec(compile(ast.Module(body=block.body[:end], type_ignores=[]), str(worker_path), "exec"), scope)
    merged = PdfWriter()
    for path in scope["files"]:
        for page in PdfReader(path).pages:
            merged.add_page(page)
    out = tmp_path / "worker-output.pdf"
    with out.open("wb") as output:
        merged.write(output)
    return PdfReader(out)


def test_actual_worker_injects_recto_blank_between_151_page_and_next_chapter(tmp_path):
    book = run_worker_directive_loop(tmp_path, [
        {"kind": "section", "section_id": "a", "section_type": "body", "page_range_start": 0, "page_range_end": 150, "is_duplex": True, "layout_explicit": True},
        {"kind": "blank_page", "reason": "chapter_recto"},
        {"kind": "section", "section_id": "b", "section_type": "body", "page_range_start": 0, "page_range_end": 3, "is_duplex": True, "layout_explicit": True},
    ], {"a": 151, "b": 4})
    assert len(book.pages) == 156
    assert book.pages[150]["/SourceFace"] == "a:150"
    assert b"1.000000 1.000000 1.000000 rg" in book.pages[151].get_contents().get_data()
    assert book.pages[152]["/SourceFace"] == "b:0"


def test_actual_worker_slices_source_around_manual_blank_and_two_coloured_faces(tmp_path):
    book = run_worker_directive_loop(tmp_path, [
        {"kind": "section", "section_id": "a", "page_range_start": 0, "page_range_end": 4, "is_duplex": True, "layout_explicit": True},
        {"kind": "blank_page", "reason": "user_blank"},
        {"kind": "insert_page", "color": "yellow"},
        {"kind": "insert_page", "color": "yellow"},
        {"kind": "section", "section_id": "a", "page_range_start": 5, "page_range_end": 9, "is_duplex": True, "layout_explicit": True},
    ], {"a": 10})
    assert len(book.pages) == 13
    assert book.pages[4]["/SourceFace"] == "a:4"
    assert b"1.000000 1.000000 1.000000 rg" in book.pages[5].get_contents().get_data()
    assert b"0.996078 0.976471 0.764706 rg" in book.pages[6].get_contents().get_data()
    assert b"0.996078 0.976471 0.764706 rg" in book.pages[7].get_contents().get_data()
    assert book.pages[8]["/SourceFace"] == "a:5"
    assert book.pages[12]["/SourceFace"] == "a:9"


def test_151_page_chapter_has_real_page_152_before_next_chapter(tmp_path):
    writer = PdfWriter()
    for _ in range(151):
        writer.add_blank_page(width=210 * 72 / 25.4, height=297 * 72 / 25.4)
    filler = PdfReader(make_body_filler(tmp_path / "blank.pdf", 210, 297))
    writer.add_page(filler.pages[0])
    from pypdf.generic import NameObject, TextStringObject
    next_page = writer.add_blank_page(width=210 * 72 / 25.4, height=297 * 72 / 25.4)
    next_page[NameObject("/Chapter")] = TextStringObject("Next chapter")
    output = tmp_path / "book.pdf"
    with output.open("wb") as f:
        writer.write(f)
    book = PdfReader(output)
    assert len(book.pages) == 153
    assert b"1.000000 1.000000 1.000000 rg" in book.pages[151].get_contents().get_data()
    assert book.pages[152]["/Chapter"] == "Next chapter"
    assert abs(float(book.pages[151].mediabox.width) * 25.4 / 72 - 210) < .001
    assert abs(float(book.pages[151].mediabox.height) * 25.4 / 72 - 297) < .001


def test_coloured_sheet_has_two_real_vector_faces(tmp_path):
    writer = PdfWriter()
    for i in range(2):
        source = PdfReader(make_body_filler(tmp_path / f"yellow-{i}.pdf", 148, 210, "yellow"))
        writer.add_page(source.pages[0])
    output = tmp_path / "insert.pdf"
    with output.open("wb") as f:
        writer.write(f)
    sheet = PdfReader(output)
    assert len(sheet.pages) == 2
    for page in sheet.pages:
        assert b"0.996078 0.976471 0.764706 rg" in page.get_contents().get_data()
        assert abs(float(page.mediabox.height) * 25.4 / 72 - 210) < .001