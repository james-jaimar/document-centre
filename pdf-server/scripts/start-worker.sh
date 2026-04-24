#!/bin/sh
set -e
exec celery -A app.worker.celery_app worker -l info -Q default,documents,thumbnails,imposition
