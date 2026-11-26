"""Prevent queued workers from publishing outputs made from superseded artwork."""
import copy
from contextvars import ContextVar

loaded_configurations = ContextVar("loaded_configurations", default=None)


def remember_configuration(job_id, configuration):
    current = dict(loaded_configurations.get() or {})
    current[job_id] = copy.deepcopy(configuration)
    loaded_configurations.set(current)


def expected_configuration(job_id):
    return (loaded_configurations.get() or {}).get(job_id)