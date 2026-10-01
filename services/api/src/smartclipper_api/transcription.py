"""Timestamped local transcription, translation and safe SRT parsing."""

import re
import wave
from functools import lru_cache

import numpy as np

from .schemas import LANGUAGES


def parse_srt(text, duration):
    blocks = re.split(r"\n\s*\n", text.replace("\r\n", "\n").strip())
    segments = []
    stamp = r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})"
    for block in blocks:
        lines = block.splitlines()
        line = next((i for i, value in enumerate(lines) if "-->" in value), None)
        if line is None:
            raise ValueError("Upload a valid timed SRT transcript.")
        match = re.fullmatch(stamp + r"\s*-->\s*" + stamp, lines[line].strip())
        if not match:
            raise ValueError("SRT timestamps must use HH:MM:SS,mmm.")
        values = list(map(int, match.groups()))
        if any(values[i] >= 60 for i in (1, 2, 5, 6)):
            raise ValueError("Invalid SRT timestamp.")
        start = values[0] * 3600 + values[1] * 60 + values[2] + values[3] / 1000
        end = values[4] * 3600 + values[5] * 60 + values[6] + values[7] / 1000
        content = re.sub(r"<[^>]*>", "", " ".join(lines[line + 1 :])).strip()
        if not content or len(content) > 2000 or not 0 <= start < end <= duration + 0.05:
            raise ValueError("Transcript text/timestamps exceed this video.")
        if segments and start < segments[-1]["end"]:
            raise ValueError("Transcript timestamps must be ordered and non-overlapping.")
        segments.append({"start": start, "end": min(end, duration), "text": content})
    if not segments or len(segments) > 3000:
        raise ValueError("Transcript must contain 1–3000 timed captions.")
    return segments


@lru_cache(maxsize=1)
def model_for(name, device, compute_type, cache):
    from faster_whisper import WhisperModel

    return WhisperModel(name, device=device, compute_type=compute_type, download_root=cache)


def transcribe(source, settings, language="auto", translate=False):
    model = model_for(
        settings.whisper_model,
        settings.whisper_device,
        settings.whisper_compute_type,
        str(settings.data_dir / "models"),
    )
    with wave.open(str(source), "rb") as audio:
        if audio.getframerate() != 16000 or audio.getnchannels() != 1 or audio.getsampwidth() != 2:
            raise ValueError("Prepared transcription audio must be mono 16 kHz PCM16.")
        samples = np.frombuffer(audio.readframes(audio.getnframes()), dtype="<i2").astype(
            np.float32
        )
        samples /= 32768.0
    segments, info = model.transcribe(
        samples,
        language=None if language == "auto" else language,
        task="translate" if translate else "transcribe",
        vad_filter=True,
        word_timestamps=True,
        condition_on_previous_text=False,
    )
    result = []
    for segment in segments:
        if segment.no_speech_prob > 0.8 or segment.avg_logprob < -1.5:
            continue
        if segment.text.strip():
            result.append(
                {
                    "start": segment.start,
                    "end": segment.end,
                    "text": segment.text.strip(),
                    "words": [
                        {"start": w.start, "end": w.end, "text": w.word.strip()}
                        for w in segment.words or []
                    ],
                }
            )
    if info.language not in LANGUAGES:
        raise ValueError("Detected language is outside the supported language list.")
    if not result:
        raise ValueError(
            "No clear speech was detected. Upload a timed SRT transcript or another video."
        )
    return result, info.language


def relative_segments(segments, start, end):
    return [
        {"start": max(0, s["start"] - start), "end": min(end, s["end"]) - start, "text": s["text"]}
        for s in segments
        if s["start"] < end and s["end"] > start
    ]


def caption_text(segments, kind="vtt"):
    def stamp(t):
        ms = max(0, round(t * 1000))
        h, ms = divmod(ms, 3600000)
        m, ms = divmod(ms, 60000)
        s, ms = divmod(ms, 1000)
        return f"{h:02}:{m:02}:{s:02}{',' if kind == 'srt' else '.'}{ms:03}"

    chunks = ["WEBVTT\n"] if kind == "vtt" else []
    for i, segment in enumerate(segments):
        # No HTML, ASS tags or embedded arrows/newlines from user transcripts.
        text = re.sub(r"[<>\{\}]", "", segment["text"]).replace("\n", " ").replace("-->", "—")
        chunks.append(f"{i + 1}\n{stamp(segment['start'])} --> {stamp(segment['end'])}\n{text}\n")
    return "\n".join(chunks)
