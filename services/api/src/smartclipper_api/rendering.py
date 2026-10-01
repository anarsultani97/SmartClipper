"""Vertical exports with optional burned captions and original synthetic music beds."""

import math
import wave

import numpy as np

from .caption_styles import caption_ass
from .worker import run_media

MUSIC = {
    "bright": {"name": "Little lift", "mood": "Bright", "recommendation": "Tips and discoveries"},
    "calm": {"name": "Room to think", "mood": "Calm", "recommendation": "Reflective stories"},
    "pulse": {"name": "Keep moving", "mood": "Pulse", "recommendation": "Energetic explanations"},
}


def music_bed(path, mood, duration):
    # These original synthesized arrangements contain no commercial recordings.
    rate = 22050
    time = np.arange(math.ceil(duration * rate)) / rate
    chords = {
        "bright": [261.63, 329.63, 392],
        "calm": [220, 261.63, 329.63],
        "pulse": [196, 246.94, 293.66],
    }[mood]
    signal = sum(np.sin(2 * np.pi * note * time) for note in chords) / 3
    beat = 0.3 + 0.7 * np.exp(-((time * (2 if mood == "pulse" else 1)) % 1) * 8)
    fade = np.minimum(1, time / 0.5) * np.minimum(1, np.maximum(0, duration - time) / 0.5)
    samples = (signal * beat * fade * 0.2 * 32767).astype("<i2")
    with wave.open(str(path), "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(rate)
        target.writeframes(samples.tobytes())


def render_short(
    source,
    folder,
    start,
    end,
    settings,
    *,
    captions=None,
    music="none",
    output="clip.mp4",
    has_audio=True,
    preview=False,
    caption_style="pop",
    caption_position="lower",
    progress=None,
):
    folder.mkdir(parents=True, exist_ok=True)
    duration = end - start
    args = [
        settings.ffmpeg_path,
        "-v",
        "error",
        "-nostdin",
        "-y",
        "-protocol_whitelist",
        "file,pipe",
        "-ss",
        str(start),
        "-i",
        str(source.resolve()),
    ]
    if music != "none":
        music_bed(folder / "music.wav", music, duration)
        args += ["-i", str((folder / "music.wav").resolve())]
    # Fit all source content on a blurred background: never silently crop a guest or slides.
    width, height = (480, 854) if preview else (720, 1280)
    graph = (
        f"[0:v]split=2[bg][fg];[bg]scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},boxblur=12:1[back];"
        f"[fg]scale={width}:{height}:force_original_aspect_ratio=decrease:force_divisible_by=2[front];"
        f"[back][front]overlay=(W-w)/2:(H-h)/2,setsar=1,fps={24 if preview else 30}"
    )
    if captions:
        (folder / "captions.ass").write_text(
            caption_ass(captions, caption_style, caption_position), encoding="utf-8"
        )
        # Fixed relative filename avoids filter expression injection and Windows drive escaping.
        graph += ",ass=captions.ass"
    graph += "[video]"
    if music != "none" and has_audio:
        graph += ";[0:a]aresample=async=1:first_pts=0[voice];[1:a]volume=0.16[bed];"
        graph += "[voice][bed]amix=inputs=2:duration=first:normalize=0[audio]"
    elif music != "none":
        graph += ";[1:a]volume=0.16[audio]"
    args += ["-filter_complex_threads", "2", "-filter_complex", graph, "-map", "[video]"]
    args += ["-map", "[audio]"] if music != "none" else ["-map", "0:a:0?"]
    args += [
        "-t",
        str(duration),
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast" if preview else "veryfast",
        "-crf",
        "24" if preview else "21",
        "-pix_fmt",
        "yuv420p",
        "-threads",
        "2",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        output,
    ]
    if progress:
        args[1:1] = ["-progress", "pipe:1", "-nostats"]
    run_media(args, timeout=600, cwd=folder.resolve(), progress=progress)
