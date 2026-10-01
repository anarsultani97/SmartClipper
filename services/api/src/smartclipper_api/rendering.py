"""Bounded native rendering of reversible edits in vertical or horizontal format."""

import math
import wave

import numpy as np

from .caption_styles import caption_ass
from .schemas import AudioEdits, VideoEdits
from .worker import run_media

MUSIC = {
    "bright": {"name": "Little lift", "mood": "Bright", "recommendation": "Tips and discoveries"},
    "calm": {"name": "Room to think", "mood": "Calm", "recommendation": "Reflective stories"},
    "pulse": {"name": "Keep moving", "mood": "Pulse", "recommendation": "Energetic explanations"},
    "lofi": {
        "name": "Late afternoon",
        "mood": "Lo-fi",
        "recommendation": "Conversations and gaming",
    },
    "cinematic": {
        "name": "The reveal",
        "mood": "Cinematic",
        "recommendation": "Build-ups and discoveries",
    },
    "playful": {
        "name": "Small surprises",
        "mood": "Playful",
        "recommendation": "Funny moments and reactions",
    },
}


def music_bed(path, mood, duration):
    # These original synthesized arrangements contain no commercial recordings.
    rate = 22050
    tempo, base = {
        "bright": (108, 261.63),
        "calm": (72, 220),
        "pulse": (124, 196),
        "lofi": (84, 174.61),
        "cinematic": (80, 146.83),
        "playful": (116, 293.66),
    }[mood]
    with wave.open(str(path), "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(rate)
        # Chunked synthesis bounds memory even for slowed-down long shorts.
        for chunk in range(math.ceil(duration)):
            count = min(rate, math.ceil(duration * rate) - chunk * rate)
            time = chunk + np.arange(count) / rate
            beat = time * tempo / 60
            roots = np.array([1, 0.7937, 0.8909, 0.6674])[(beat // 4).astype(int) % 4]
            chord = (
                sum(
                    np.sin(2 * np.pi * base * roots * ratio * time) for ratio in (1, 1.2599, 1.4983)
                )
                / 3
            )
            envelope = 0.35 + 0.65 * np.exp(-(beat % 1) * 6)
            bass = np.sin(2 * np.pi * base / 2 * roots * time) * np.exp(-(beat % 1) * 3)
            melody_ratio = np.array([1, 1.2599, 1.4983, 2, 1.4983, 1.2599, 1.1225, 1])[
                (beat // 2).astype(int) % 8
            ]
            melody = np.sin(2 * np.pi * base * 2 * melody_ratio * time)
            melody *= np.exp(-((beat / 2) % 1) * (4 if mood == "playful" else 7))
            signal = 0.45 * chord * envelope + 0.15 * bass + 0.16 * melody
            fade = np.minimum(1, time / 0.5) * np.minimum(1, np.maximum(0, duration - time) / 0.5)
            target.writeframes((signal * fade * 32767).astype("<i2").tobytes())


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
    audio_edits=None,
    music_source=None,
    voice_source=None,
):
    folder.mkdir(parents=True, exist_ok=True)
    edits = VideoEdits.model_validate(video_edits or {})
    audio = AudioEdits.model_validate(audio_edits or {})
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
    music_index, voice_index, next_index = None, None, 1
    if music != "none":
        if music != "custom":
            music_bed(folder / "music.wav", music, 60)
            music_source = folder / "music.wav"
        if not music_source or not music_source.is_file():
            raise ValueError("Selected music is unavailable. Upload or choose it again.")
        music_index, next_index = next_index, next_index + 1
        args += [
            "-stream_loop",
            "-1",
            "-ss",
            str(audio.music_offset),
            "-i",
            str(music_source.resolve()),
        ]
    if voice_source:
        if not voice_source.is_file():
            raise ValueError("Selected voice recording is unavailable.")
        voice_index = next_index
        args += ["-i", str(voice_source.resolve())]
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
    audio_inputs = []
    if has_audio:
        graph += (
            f";[0:a]asetpts=PTS/{edits.speed},atempo={edits.speed},"
            f"volume={edits.volume},aresample=async=1:first_pts=0,"
            f"apad,atrim=duration={duration}[original]"
        )
        audio_inputs.append("[original]")
    if music_index is not None:
        graph += (
            f";[{music_index}:a]asetpts=PTS-STARTPTS,volume={audio.music_volume},"
            f"atrim=duration={duration}[bed]"
        )
        audio_inputs.append("[bed]")
    if voice_index is not None:
        graph += (
            f";[{voice_index}:a]asetpts=PTS-STARTPTS,volume={audio.voice_volume},"
            f"adelay={round(audio.voice_start * 1000)}:all=1,apad,"
            f"atrim=duration={duration}[recording]"
        )
        audio_inputs.append("[recording]")
    if audio_inputs:
        graph += (
            ";"
            + "".join(audio_inputs)
            + f"amix=inputs={len(audio_inputs)}:duration=longest:normalize=0[mixed]"
        )
        audio_filters = ["alimiter=limit=0.95:level=0:latency=1", f"atrim=duration={duration}"]
        if fade_in:
            audio_filters.append(f"afade=t=in:st=0:d={fade_in}")
        if fade_out:
            audio_filters.append(f"afade=t=out:st={duration - fade_out}:d={fade_out}")
        graph += ";[mixed]" + ",".join(audio_filters) + "[audio]"
    args += ["-filter_complex_threads", "2", "-filter_complex", graph, "-map", "[video]"]
    if audio_inputs:
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
