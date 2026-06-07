from __future__ import annotations


class NonRetryableTaskError(RuntimeError):
    """Raised when a task already recorded a terminal failure.

    Cloud Tasks should not retry these failures because re-running the whole
    task just repeats the same partial/missing-page recovery loop.
    """
