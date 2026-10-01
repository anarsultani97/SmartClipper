"""Constrain cleanup to one immediate project folder under the configured media root."""

import shutil


def remove_project_files(settings, project_id):
    root = settings.data_dir.resolve()
    target = (root / project_id).resolve()
    if target.parent != root or target.name != project_id:
        raise ValueError("Refusing cleanup outside the expected project folder.")
    shutil.rmtree(target, ignore_errors=True)
