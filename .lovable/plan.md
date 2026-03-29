
## Status: IMPLEMENTED

The physical sheet sequencing rule is now correct in `buildPageSequence()`.

**Rule**: Tabs and inserts are injected only after the preceding physical sheet is complete.

- Simplex: body page → blank_back (reverse face) → tab/insert sheet
- Duplex: anchors snap to sheet boundaries → tab/insert starts at next sheet

No post-processing alignment pass exists or should be added.
The sequence is built correctly in one pass.
