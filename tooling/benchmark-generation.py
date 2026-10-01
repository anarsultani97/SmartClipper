"""Compare cached-transcript generation on identical media in isolated databases."""

import copy
import json
import shutil
import subprocess
import threading
import time
import types
from pathlib import Path
from uuid import uuid4

from smartclipper_api import pipeline
from smartclipper_api.config import Settings
from smartclipper_api.database import Base, Job, Project, Short, make_database
from smartclipper_api.transcription import transcription_profile
from sqlalchemy import func, select

settings = Settings()
engine, sessions = make_database(settings.database_url)
with sessions() as db:
    original = db.get(Project, "2899ed0f-4171-459c-8a6d-c5a3c2550947")
    if not original or not original.transcript:
        raise SystemExit("Prepare the FLOSS acceptance fixture first.")
root = Path(".cache/generation-benchmark") / str(uuid4())
root.mkdir(parents=True)


def baseline(name):
    module = types.ModuleType(f"smartclipper_api.{name}")
    content = subprocess.check_output(
        ["git", "show", f"3d3ab0e:services/api/src/smartclipper_api/{name}.py"], encoding="utf-8"
    )
    exec(compile(content, f"baseline-{name}.py", "exec"), module.__dict__)
    return module


old = baseline("pipeline")
quality, rendering = baseline("quality"), baseline("rendering")
old.scan_quality, old.make_thumbnails = quality.scan_quality, quality.make_thumbnails
old.render_short = rendering.render_short
results = {
    "baseline": "3d3ab0e",
    "audio_seconds": original.duration_seconds,
    "transcription": "cached identical transcript",
    "runs": {},
}
for name, runner in (("before", old.process_job), ("after", pipeline.process_job)):
    folder = root / name
    local = settings.model_copy(
        update={
            "data_dir": folder,
            "database_url": f"sqlite:///{(folder / 'benchmark.db').as_posix()}",
        }
    )
    media = folder / original.id
    media.mkdir(parents=True)
    shutil.copyfile(settings.data_dir / original.id / "preview.mp4", media / "preview.mp4")
    detector = settings.data_dir / "models/yunet-2023mar.onnx"
    if detector.is_file():
        (folder / "models").mkdir()
        shutil.copyfile(detector, folder / "models/yunet-2023mar.onnx")
    db_engine, local_sessions = make_database(local.database_url)
    Base.metadata.create_all(db_engine)
    options = {
        "language": original.transcript_language,
        "platform": "youtube",
        "duration_seconds": 45,
        "count": 5,
        "english_subtitles": False,
        "transcription_mode": "fast",
    }
    job_id = str(uuid4())
    with local_sessions() as db:
        db.add(
            Project(
                id=original.id,
                filename="public-podcast.mp4",
                size_bytes=original.size_bytes,
                status="ready",
                duration_seconds=original.duration_seconds,
                has_audio=original.has_audio,
                transcript=copy.deepcopy(original.transcript),
                transcript_language=original.transcript_language,
                transcription_profile=transcription_profile(local, options["language"], "fast", ""),
            )
        )
        db.add(Job(id=job_id, project_id=original.id, options=options))
        db.commit()
    began, first = time.perf_counter(), None
    thread = threading.Thread(target=runner, args=(local, local_sessions))
    thread.start()
    while thread.is_alive():
        with local_sessions() as db:
            status = db.get(Job, job_id).status
            count = db.scalar(select(func.count()).select_from(Short))
        if first is None and count and (name == "after" or status == "ready"):
            first = time.perf_counter() - began
        time.sleep(0.1)
    elapsed = time.perf_counter() - began
    with local_sessions() as db:
        job = db.get(Job, job_id)
        if job.status != "ready":
            raise RuntimeError(job.error)
        results["runs"][name] = {
            "total_seconds": round(elapsed, 3),
            "first_visible_seconds": round(first or elapsed, 3),
            "shorts": db.scalar(select(func.count()).select_from(Short)),
        }
    db_engine.dispose()
(Path(".cache/generation-benchmark") / "results.json").write_text(json.dumps(results, indent=2))
print(json.dumps(results, indent=2))
