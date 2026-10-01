"""Single durable local worker. Each generation and export has an immutable job ID."""

import json
import subprocess
from uuid import uuid4

import httpx
from sqlalchemy import select, update

from .database import Job, Project, Short
from .highlights import candidates, select_diverse, semantic_rank
from .quality import clean_candidate, make_thumbnails, scan_quality
from .rendering import render_short
from .transcription import relative_segments, transcribe


def short_folder(settings, short):
    return settings.data_dir / short.project_id / "shorts" / short.id


def generate(job, settings, sessions, stage):
    with sessions() as db:
        project = db.get(Project, job.project_id)
    folder = settings.data_dir / project.id
    # Preview is normalized once and establishes the shared analysis/render clock.
    source = folder / "preview.mp4"
    options = job.options
    stage("Transcribing speech")
    language = options["language"]
    transcript = project.transcript
    if transcript and language != "auto" and project.transcript_language != language:
        raise ValueError(
            "Selected language differs from the uploaded transcript. Choose its language."
        )
    detected = project.transcript_language
    if not transcript:
        if not project.has_audio:
            raise ValueError(
                "No audio found. Upload a timed SRT transcript before generating shorts."
            )
        transcript, detected = transcribe(folder / "speech.wav", settings, language)
        with sessions() as db:
            stored = db.get(Project, project.id)
            stored.transcript, stored.detected_language = transcript, detected
            stored.transcript_language = detected
            db.commit()
    english = None
    if options["english_subtitles"] and detected != "en":
        stage("Translating English captions")
        if not project.has_audio:
            raise ValueError("English translation requires audible speech in this build.")
        english, _ = transcribe(folder / "speech.wav", settings, detected, translate=True)
    stage("Checking scenes and context")
    samples = scan_quality(source, settings)
    pool = [
        c
        for c in candidates(transcript, project.duration_seconds, options["duration_seconds"])
        if clean_candidate(c, samples)
    ]
    ranked, note = semantic_rank(pool, settings, options["platform"]) if pool else ([], "")
    chosen = select_diverse(ranked, options["count"])
    if not chosen:
        raise ValueError(
            "No clean, complete speech excerpts fit this length. Try a longer length, "
            "a clearer video, or a timed transcript."
        )
    for index, item in enumerate(chosen):
        stage(f"Rendering short {index + 1} of {len(chosen)}")
        short = Short(
            id=str(uuid4()),
            project_id=project.id,
            job_id=job.id,
            title=item["title"],
            thumbnail_text=item["title"],
            summary=item["summary"],
            start_ms=round(item["start"] * 1000),
            end_ms=round(item["end"] * 1000),
            transcript=relative_segments(transcript, item["start"], item["end"]),
            english_transcript=relative_segments(english, item["start"], item["end"])
            if english
            else None,
            subtitles=1,
            subtitle_language="en" if options["english_subtitles"] else "original",
            music="calm",
            thumbnail=0,
            thumbnail_style="bold",
            revision=1,
            quality_note=note
            + " Visual quality sampled every two seconds; preview before sharing.",
        )
        output = short_folder(settings, short)
        render_short(
            source, output, item["start"], item["end"], settings, has_audio=bool(project.has_audio)
        )
        short.thumbnails = make_thumbnails(source, output, item, settings)
        if len(short.thumbnails) < 3:
            short.quality_note += " Fewer than three clear thumbnail frames passed the checks."
        with sessions() as db:
            db.add(short)
            db.commit()
    stage(f"Ready: {len(chosen)} shorts")


def export(job, settings, sessions, stage):
    options = job.options
    with sessions() as db:
        short = db.get(Short, options["short_id"])
        project = db.get(Project, short.project_id)
    stage("Rendering your export")
    folder = short_folder(settings, short) / "exports" / job.id
    render_short(
        settings.data_dir / project.id / "preview.mp4",
        folder,
        options["start_ms"] / 1000,
        options["end_ms"] / 1000,
        settings,
        captions=options["captions"] if options["subtitles"] else None,
        music=options["music"],
        has_audio=bool(project.has_audio),
    )
    with sessions() as db:
        stored = db.get(Short, short.id)
        # A render of an old revision must never appear as the current export.
        if stored.revision == options["revision"]:
            stored.export_revision = options["revision"]
        db.commit()
    stage("Export ready")


def process_job(settings, sessions):
    with sessions() as db:
        job = db.scalar(select(Job).where(Job.status == "queued").order_by(Job.created_at))
        if not job:
            return False
        claim = db.execute(
            update(Job).where(Job.id == job.id, Job.status == "queued").values(status="processing")
        )
        db.commit()
        if claim.rowcount != 1:
            return True

    def stage(message):
        with sessions() as db:
            stored = db.get(Job, job.id)
            stored.stage = message
            db.commit()

    try:
        (generate if job.kind == "generate" else export)(job, settings, sessions, stage)
        with sessions() as db:
            stored = db.get(Job, job.id)
            stored.status = "ready"
            db.commit()
    except Exception as exc:
        if isinstance(exc, subprocess.SubprocessError):
            message = "Rendering failed or timed out. Check FFmpeg and try again."
        elif isinstance(exc, httpx.HTTPError):
            message = (
                "Hosted ranking could not be reached. Check configuration or use local ranking."
            )
        elif isinstance(exc, (OSError, RuntimeError)):
            message = (
                "Processing failed. Check model download, available memory and media tools, "
                "then retry."
            )
        elif isinstance(exc, (ValueError, json.JSONDecodeError)):
            message = str(exc)[:500]
        else:
            # Keep a worker alive after an unexpected model/provider failure, without
            # exposing provider responses, credentials or filesystem paths to users.
            message = "Processing failed unexpectedly. Retry or check the worker configuration."
        with sessions() as db:
            stored = db.get(Job, job.id)
            stored.status, stored.error, stored.stage = "failed", message, "Needs attention"
            db.commit()
    return True
