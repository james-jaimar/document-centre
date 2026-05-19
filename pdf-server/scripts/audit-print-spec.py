#!/usr/bin/env python3
"""Audit how the print-ready pipeline resolves a single order_job.

Usage:  python3 scripts/audit-print-spec.py <job_id>

Reports the resolved TargetSpec, per-section flags, merge-directive summary,
and the most recent `assembly_report` so you can spot parameters that the
worker is reading but not applying.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

# Allow running from repo root without installing the package.
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.services.production_orchestrator import load_job_bundle  # noqa: E402


def _short(v, limit=80):
    s = str(v)
    return s if len(s) <= limit else s[: limit - 1] + "…"


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: audit-print-spec.py <job_id>", file=sys.stderr)
        return 64

    job_id = sys.argv[1]
    bundle = load_job_bundle(job_id)
    job = bundle.job
    target = bundle.target
    snap = job.get("product_snapshot") or {}

    print(f"\n=== Job {job.get('job_number') or job_id} ===")
    print(f"  product:        {job.get('product_name') or snap.get('product_family', {}).get('name')}")
    print(f"  quantity:       {job.get('quantity')}")
    print(f"  asset_paths:    {len(bundle.asset_paths)}  section_paths: {len(bundle.section_paths or {})}")

    print("\n--- Resolved TargetSpec ---")
    print(f"  size:           {target.width_mm}×{target.height_mm} mm")
    print(f"  orientation:    {target.orientation}")
    print(f"  colour_mode:    {target.colour_mode}")
    print(f"  duplex_mode:    {target.duplex_mode}")
    print(f"  print_to_edge:  {target.print_to_edge}  bleed_mm={target.bleed_mm}")

    print("\n--- Snapshot sections ---")
    for s in snap.get("sections") or []:
        if not isinstance(s, dict):
            continue
        print(
            f"  {s.get('section_type'):>14}  "
            f"is_color={s.get('is_color')!s:5}  is_duplex={s.get('is_duplex')!s:5}  "
            f"paper={_short(s.get('paper_stock'), 16):16}  gsm={s.get('paper_weight_gsm')}"
        )

    cfg = bundle.configuration or {}
    directives = cfg.get("merge_directives") or []
    if directives:
        print(f"\n--- Merge directives ({len(directives)}) ---")
        for i, d in enumerate(directives):
            if not isinstance(d, dict):
                continue
            if d.get("kind") == "section":
                print(
                    f"  {i:>3}  section  {d.get('section_type'):>14}  "
                    f"is_color={d.get('is_color')!s:5}  is_duplex={d.get('is_duplex')!s:5}  "
                    f"pages={d.get('page_count')}  file={_short(d.get('file_name'), 32)}"
                )
            else:
                print(f"  {i:>3}  {d.get('kind'):>14}  reason={d.get('reason')}")

    report = job.get("assembly_report")
    if report:
        print("\n--- Last assembly_report ---")
        print(json.dumps(report, indent=2, default=str)[:4000])
    else:
        print("\n--- No assembly_report yet (job not assembled) ---")

    return 0


if __name__ == "__main__":
    sys.exit(main())
