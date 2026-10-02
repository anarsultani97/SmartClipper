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


def beep_spans(samples, rate=16000):
    """Flag brief narrow-band tones, never reconstruct inaudible words."""
    hop, size = 800, 1024
    frequencies = np.fft.rfftfreq(size, 1 / rate)
    spans, begin, last = [], None, 0.0
    window_shape = np.hanning(size)
    for offset in range(0, len(samples) - size, hop):
        window = samples[offset : offset + size]
        power = np.abs(np.fft.rfft(window * window_shape)) ** 2
        peak = int(np.argmax(power))
        tone = (
            800 <= frequencies[peak] <= 3000
            and np.sqrt(np.mean(window**2)) > 0.035
            and power[max(0, peak - 2) : peak + 3].sum() / max(1e-12, power.sum()) > 0.92
        )
        if tone:
            begin = offset / rate if begin is None else begin
            last = (offset + size) / rate
        elif begin is not None:
            if 0.10 <= last - begin <= 2.5:
                spans.append((begin, last))
            begin = None
    if begin is not None and 0.10 <= last - begin <= 2.5:
        spans.append((begin, last))
    return spans


def transcription_profile(settings, language, mode, vocabulary):
    model = settings.whisper_model
    if model == "base" and mode != "fast":
        model = "small" if mode == "balanced" else "medium"
    return {
        "model": model,
        "language": language,
        "mode": mode,
        "vocabulary": vocabulary,
        "version": 3,
    }


def transcribe(
    source,
    settings,
    language="auto",
    translate=False,
    *,
    mode="balanced",
    vocabulary="",
    progress=None,
):
    from faster_whisper import BatchedInferencePipeline

    profile = transcription_profile(settings, language, mode, vocabulary)
    # Turbo is optimized for transcription, not English translation.
    if translate and "turbo" in profile["model"]:
        profile["model"] = "small" if mode != "accurate" else "medium"
    if progress:
        progress(-1)
    model = model_for(
        profile["model"],
        settings.whisper_device,
        settings.whisper_compute_type,
        str(settings.data_dir / "models"),
    )
    if progress:
        progress(0)
    with wave.open(str(source), "rb") as audio:
        if audio.getframerate() != 16000 or audio.getnchannels() != 1 or audio.getsampwidth() != 2:
            raise ValueError("Prepared transcription audio must be mono 16 kHz PCM16.")
        samples = np.frombuffer(audio.readframes(audio.getnframes()), dtype="<i2").astype(
            np.float32
        )
        samples /= 32768.0
    beeps = beep_spans(samples) if not translate else []
    segments, info = BatchedInferencePipeline(model).transcribe(
        samples,
        language=None if language == "auto" else language,
        task="translate" if translate else "transcribe",
        vad_filter=True,
        word_timestamps=True,
        batch_size=2 if mode == "accurate" else 4,
        beam_size=1 if mode == "fast" else 3,
        temperature=0,
        vad_parameters={"min_silence_duration_ms": 500},
        hotwords=vocabulary or None,
        hallucination_silence_threshold=1.0,
    )
    if info.language not in LANGUAGES:
        raise ValueError("Detected language is outside the supported language list.")
    result = []
    for segment in segments:
        if progress:
            progress(min(1, segment.end / max(1, len(samples) / 16000)))
        if segment.no_speech_prob > 0.8 or segment.avg_logprob < -1.5:
            continue
        if segment.text.strip():
            words, review = [], False
            for w in segment.words or []:
                text = w.word.strip()
                overlap = any(
                    min(w.end, b) - max(w.start, a) > max(0.04, (w.end - w.start) * 0.4)
                    for a, b in beeps
                )
                patch = samples[max(0, int(w.start * 16000)) : int(w.end * 16000)]
                silent = len(patch) and float(np.sqrt(np.mean(patch**2))) < 0.001
                if overlap:
                    text, review = "[beep]", True
                elif w.probability < 0.35 and silent:
                    text, review = "[unclear]", True
                elif w.probability < 0.45:
                    review = True
                if text and w.end > w.start:
                    words.append({"start": w.start, "end": w.end, "text": text})
            result.append(
                {
                    "start": segment.start,
                    "end": segment.end,
                    "text": " ".join(w["text"] for w in words)
                    if review and words
                    else segment.text.strip(),
                    "words": words,
                    "review": review,
                }
            )
    for start, end in beeps:
        cue = next((c for c in result if c["start"] <= start and c["end"] >= end), None)
        if cue and not any(
            w["text"] == "[beep]" and w["start"] < end and w["end"] > start for w in cue["words"]
        ):
            if not any(w["start"] < end and w["end"] > start for w in cue["words"]):
                cue["words"] = sorted(
                    [*cue["words"], {"start": start, "end": end, "text": "[beep]"}],
                    key=lambda w: w["start"],
                )
                cue["text"] = " ".join(w["text"] for w in cue["words"])
                cue["review"] = True
        elif not cue and result and not any(c["start"] < end and c["end"] > start for c in result):
            result.append(
                {"start": start, "end": end, "text": "[beep]", "words": [], "review": True}
            )
    result.sort(key=lambda c: c["start"])
    if not result:
        raise ValueError(
            "No clear speech was detected. Upload a timed SRT transcript or another video."
        )
    return sentence_segments(result), info.language


def sentence_segments(segments):
    """Batched ASR cues can span many sentences. Keep natural boundaries for clip selection."""
    result = []
    for cue in segments:
        if not cue.get("words"):
            result.append(cue)
            continue
        current = []

        def append(words, review):
            result.append(
                {
                    "start": words[0]["start"],
                    "end": words[-1]["end"],
                    "text": " ".join(w["text"] for w in words),
                    "words": words,
                    "review": review,
                }
            )

        for word in cue["words"]:
            current.append(word)
            if re.search(r"[.!?。！？।][\"'”’)]*$", word["text"]):
                append(current, cue.get("review", False))
                current = []
        if current:
            append(current, cue.get("review", False))
    return result


def relative_segments(segments, start, end):
    return [
        {
            "start": max(0, s["start"] - start),
            "end": min(end, s["end"]) - start,
            "text": s["text"],
            "review": s.get("review", False),
            "words": [
                {
                    "start": max(0, w["start"] - start),
                    "end": min(end, w["end"]) - start,
                    "text": w["text"],
                }
                for w in s.get("words", [])
                if w["start"] < end and w["end"] > start
            ],
        }
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
