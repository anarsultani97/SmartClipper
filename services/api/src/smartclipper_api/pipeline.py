"""Single durable local worker. Each generation and export has an immutable job ID."""

import json
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import httpx
from sqlalchemy import select, update

from .caption_styles import caption_groups
from .database import Job, Project, Short
from .highlights import candidates, select_diverse, semantic_rank
from .quality import clean_candidate, make_thumbnails, scan_quality
from .rendering import render_short
from .schemas import VideoEdits
from .transcription import relative_segments, transcribe, transcription_profile


def short_folder(settings, short):
    return settings.data_dir / short.project_id / "shorts" / short.id


def generate(job, settings, sessions, stage):
    with sessions() as db:
        project = db.get(Project, job.project_id)
    folder = settings.data_dir / project.id
    # Preview is normalized once and establishes the shared analysis/render clock.
    source = folder / "preview.mp4"
    options = job.options
    stage("Loading speech model / transcript", 3)
    language = options["language"]
    mode = options.get("transcription_mode", "balanced")
    vocabulary = options.get("vocabulary", "")
    profile = transcription_profile(settings, language, mode, vocabulary)
    transcript = project.transcript
    uploaded = transcript and (
        project.transcription_profile == {"source": "uploaded"}
        or (project.transcription_profile is None and not any(s.get("words") for s in transcript))
    )
    if uploaded and language != "auto" and project.transcript_language != language:
        raise ValueError(
            "Selected language differs from the uploaded transcript. Choose its language."
        )
    detected = project.transcript_language
    if transcript and not uploaded and project.transcription_profile != profile:
        transcript = None
    if not transcript:
        if not project.has_audio:
            raise ValueError(
                "No audio found. Upload a timed SRT transcript before generating shorts."
            )
        transcript, detected = transcribe(
            folder / "speech.wav",
            settings,
            language,
            mode=mode,
            vocabulary=vocabulary,
            progress=lambda fraction: (
                stage("Loading speech model", 3)
                if fraction < 0
                else stage("Transcribing speech", 5 + round(45 * fraction))
            ),
        )
        with sessions() as db:
            stored = db.get(Project, project.id)
            stored.transcript, stored.detected_language = transcript, detected
            stored.transcript_language = detected
            stored.transcription_profile = profile
            db.commit()
    english = None
    if options["english_subtitles"] and detected != "en":
        stage("Translating English captions", 52)
        if not project.has_audio:
            raise ValueError("English translation requires audible speech in this build.")
        english_cache = folder / "english-v2.json"
        saved = json.loads(english_cache.read_text()) if english_cache.is_file() else {}
        if saved.get("profile") == profile and saved.get("detected") == detected:
            english = saved["segments"]
        else:
            english, _ = transcribe(
                folder / "speech.wav",
                settings,
                detected,
                translate=True,
                mode=mode,
                vocabulary=vocabulary,
            )
            temporary = english_cache.with_suffix(".tmp")
            temporary.write_text(
                json.dumps({"profile": profile, "detected": detected, "segments": english})
            )
            temporary.replace(english_cache)
    stage("Checking scenes and context", 60)
    samples = scan_quality(source, settings)
    selection_start = options.get("source_start_ms", 0) / 1000
    selection_end = (options.get("source_end_ms") or round(project.duration_seconds * 1000)) / 1000
    selected_transcript = relative_segments(transcript, selection_start, selection_end)
    source_edits = VideoEdits.model_validate(options.get("source_edits") or {})
    pool = []
    for item in candidates(
        selected_transcript,
        selection_end - selection_start,
        options["duration_seconds"] * source_edits.speed,
    ):
        candidate = {
            **item,
            "start": item["start"] + selection_start,
            "end": item["end"] + selection_start,
        }
        if clean_candidate(candidate, samples):
            pool.append(candidate)
    ranked, note = semantic_rank(pool, settings, options["platform"]) if pool else ([], "")
    chosen = select_diverse(ranked, options["count"])
    if not chosen:
        raise ValueError(
            "No clean, complete speech excerpts fit this length. Try a longer length, "
            "a clearer video, or a timed transcript."
        )
    lock = threading.Lock()
    completed = set()
    fractions = {i: 0.0 for i in range(len(chosen))}

    def render_progress(index, fraction):
        with lock:
            fractions[index] = max(fractions[index], fraction)
            percent = 68 + round(30 * sum(fractions.values()) / len(chosen))
            stage(f"Creating shorts · {len(completed)}/{len(chosen)} ready", percent)

    def create(index, item):
        cover_text = item["title"]
        if len(cover_text) > 48:
            prefix = cover_text[:45]
            cover_text = (prefix.rsplit(" ", 1)[0] if " " in prefix else prefix) + "…"
        short = Short(
            id=str(uuid4()),
            project_id=project.id,
            job_id=job.id,
            title=item["title"],
            thumbnail_text=cover_text,
            summary=item["summary"],
            start_ms=round(item["start"] * 1000),
            end_ms=round(item["end"] * 1000),
            transcript=relative_segments(transcript, item["start"], item["end"]),
            english_transcript=relative_segments(english, item["start"], item["end"])
            if english
            else None,
            subtitles=1,
            subtitle_language="en" if options["english_subtitles"] else "original",
            music="none",
            thumbnail=0,
            thumbnail_style="bold",
            revision=1,
            quality_note=(
                note
                + " Quality sampled every two seconds. Review captions and framing before sharing."
            )[:500],
            video_edits=VideoEdits.model_validate(options.get("source_edits") or {}).model_dump(),
        )
        output = short_folder(settings, short)
        short.thumbnails = make_thumbnails(
            source, output, item, settings, options.get("thumbnail_focus", "auto")
        )
        render_progress(index, 0.15)
        render_short(
            source,
            output,
            item["start"],
            item["end"],
            settings,
            has_audio=bool(project.has_audio),
            preview=True,
            video_edits=short.video_edits,
            progress=lambda seconds: render_progress(
                index, min(0.95, 0.15 + 0.8 * seconds / (item["end"] - item["start"]))
            ),
        )
        if len(short.thumbnails) < 3:
            short.quality_note += " Fewer than three clear thumbnail frames passed the checks."
        with sessions() as db:
            db.add(short)
            db.commit()
        with lock:
            completed.add(index)
        render_progress(index, 1.0)

    stage("Selecting clear covers", 68)
    # Publish the first fully rendered clip promptly, then keep concurrency bounded.
    create(0, chosen[0])
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(create, index, item) for index, item in enumerate(chosen[1:], 1)]
        for future in futures:
            future.result()
    stage(f"Ready: {len(chosen)} shorts", 99)


def export(job, settings, sessions, stage):
    options = job.options
    with sessions() as db:
        short = db.get(Short, options["short_id"])
        project = db.get(Project, short.project_id)
    stage("Rendering your export", 5)
    edits = VideoEdits.model_validate(options.get("video_edits") or {})
    trim_start = edits.trim_start_ms / 1000
    trim_end = (
        edits.trim_end_ms
        if edits.trim_end_ms is not None
        else options["end_ms"] - options["start_ms"]
    ) / 1000
    # Keep the original phrase clock, including unaligned uploaded/edited captions.
    # Regrouping an already clipped long cue would redistribute its estimated timing.
    captions = relative_segments(caption_groups(options["captions"]), trim_start, trim_end)
    for cue in captions:
        cue["start"] /= edits.speed
        cue["end"] /= edits.speed
        for word in cue["words"]:
            word["start"] /= edits.speed
            word["end"] /= edits.speed
    folder = short_folder(settings, short) / "exports" / job.id
    from .audio_routes import asset_path
    from .schemas import AudioEdits

    audio = AudioEdits.model_validate(options.get("audio_edits") or {})
    render_short(
        settings.data_dir / project.id / "preview.mp4",
        folder,
        options["start_ms"] / 1000 + trim_start,
        options["start_ms"] / 1000 + trim_end,
        settings,
        captions=captions if options["subtitles"] else None,
        music=options["music"],
        has_audio=bool(project.has_audio),
        caption_style=options.get("caption_style", "pop"),
        caption_position=options.get("caption_position", "lower"),
        video_edits=edits.model_dump(),
        audio_edits=audio.model_dump(),
        music_source=asset_path(settings, short, audio.music_asset_id)
        if audio.music_asset_id
        else None,
        voice_source=asset_path(settings, short, audio.voice_asset_id)
        if audio.voice_asset_id
        else None,
        progress=lambda seconds: stage(
            "Rendering your export",
            min(98, 5 + round(93 * seconds / ((trim_end - trim_start) / edits.speed))),
        ),
    )
    with sessions() as db:
        # A render of an old revision must never appear as the current export.
        db.execute(
            update(Short)
            .where(Short.id == short.id, Short.revision == options["revision"])
            .values(export_revision=options["revision"])
        )
        db.commit()
    stage("Export ready", 99)


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

    last_progress = 0
    last_message = ""
    stage_lock = threading.Lock()

    def stage(message, progress=0):
        nonlocal last_progress, last_message
        with stage_lock:
            progress = max(last_progress, min(99, progress))
            if progress == last_progress and message == last_message:
                return
            last_progress = progress
            last_message = message
            with sessions() as db:
                stored = db.get(Job, job.id)
                stored.stage = message[:40]
                stored.progress = progress
                db.commit()

    try:
        (generate if job.kind == "generate" else export)(job, settings, sessions, stage)
        with sessions() as db:
            stored = db.get(Job, job.id)
            stored.status = "ready"
            stored.progress = 100
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
