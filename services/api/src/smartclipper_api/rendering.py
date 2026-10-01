"""Bounded native rendering of reversible edits in vertical or horizontal format."""

import math
import wave

import numpy as np

from .caption_styles import caption_ass
from .schemas import VideoEdits
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
    video_edits=None,
):
    folder.mkdir(parents=True, exist_ok=True)
    edits = VideoEdits.model_validate(video_edits or {})
    duration = (end - start) / edits.speed
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
        "-t",
        str(end - start),
        "-i",
        str(source.resolve()),
    ]
    if music != "none":
        music_bed(folder / "music.wav", music, duration)
        args += ["-i", str((folder / "music.wav").resolve())]
    width, height = (480, 854) if preview else (720, 1280)
    if edits.framing == "horizontal":
        width, height = height, width
    filters = [f"setpts=PTS/{edits.speed}"]
    if edits.rotation == 90:
        filters.append("transpose=1")
    elif edits.rotation == 180:
        filters += ["hflip", "vflip"]
    elif edits.rotation == 270:
        filters.append("transpose=2")
    if edits.flip:
        filters.append("hflip")
    filters.append(
        f"eq=brightness={edits.brightness}:contrast={edits.contrast}:saturation={edits.saturation}"
    )
    # Fit preserves the entire scene; crop only after an explicit Fill frame choice.
    if edits.fit == "fill" and edits.framing == "vertical":
        filters += [
            f"scale={width}:{height}:force_original_aspect_ratio=increase",
            f"crop={width}:{height}",
        ]
    else:
        filters += [
            f"scale={width}:{height}:force_original_aspect_ratio=decrease:force_divisible_by=2",
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black",
        ]
    filters += ["setsar=1", f"fps={24 if preview else 30}"]
    graph = "[0:v]" + ",".join(filters)
    if captions:
        (folder / "captions.ass").write_text(
            caption_ass(captions, caption_style, caption_position, width, height), encoding="utf-8"
        )
        # Fixed relative filename avoids filter expression injection and Windows drive escaping.
        graph += ",ass=captions.ass"
    graph += "[video]"
    fade_in = min(edits.fade_in, duration / 2)
    fade_out = min(edits.fade_out, duration / 2)
    fades = []
    if fade_in:
        fades.append(f"fade=t=in:st=0:d={fade_in}")
    if fade_out:
        fades.append(f"fade=t=out:st={duration - fade_out}:d={fade_out}")
    if fades:
        graph = graph.removesuffix("[video]") + "," + ",".join(fades) + "[video]"
    if has_audio:
        graph += (
            f";[0:a]asetpts=PTS/{edits.speed},atempo={edits.speed},"
            f"volume={edits.volume},aresample=async=1:first_pts=0[voice]"
        )
    if music != "none":
        graph += ";[1:a]volume=0.16[bed]"
    audio_source = "voice" if has_audio else "bed"
    if music != "none" and has_audio:
        graph += ";[voice][bed]amix=inputs=2:duration=first:normalize=0[mixed]"
        audio_source = "mixed"
    if has_audio or music != "none":
        audio_filters = ["anull"]
        if fade_in:
            audio_filters.append(f"afade=t=in:st=0:d={fade_in}")
        if fade_out:
            audio_filters.append(f"afade=t=out:st={duration - fade_out}:d={fade_out}")
        graph += f";[{audio_source}]" + ",".join(audio_filters) + "[audio]"
    args += ["-filter_complex_threads", "2", "-filter_complex", graph, "-map", "[video]"]
    if has_audio or music != "none":
        args += ["-map", "[audio]"]
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
