"""Conservative visual sampling. Quality thresholds are transparent, not viral scores."""

import numpy as np
from PIL import Image

from .worker import run_media


def frame_quality(image):
    gray = np.asarray(image.convert("L"), dtype=np.float32)
    lap = gray[1:-1, :-2] + gray[1:-1, 2:] + gray[:-2, 1:-1] + gray[2:, 1:-1] - 4 * gray[1:-1, 1:-1]
    brightness = float(gray.mean())
    sharpness = float(lap.var())
    dark = float((gray < 18).mean())
    white = float((gray > 245).mean())
    good = 28 < brightness < 225 and dark < 0.80 and white < 0.80 and sharpness > 12
    return {
        "good": good,
        "brightness": round(brightness, 1),
        "sharpness": round(sharpness, 1),
        "score": sharpness * (1 - dark) * (1 - white),
    }


def scan_quality(source, settings):
    # A two-second scan is bounded to ~69 MB for the 30-minute upload limit.
    result = run_media(
        [
            settings.ffmpeg_path,
            "-v",
            "error",
            "-nostdin",
            "-protocol_whitelist",
            "file,pipe",
            "-i",
            str(source),
            "-vf",
            "fps=1/2,scale=320:240",
            "-an",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "pipe:1",
        ],
        timeout=300,
    )
    size = 320 * 240 * 3
    samples = []
    for i in range(len(result.stdout) // size):
        frame = Image.frombytes("RGB", (320, 240), result.stdout[i * size : (i + 1) * size])
        samples.append({"time": i * 2 + 1, **frame_quality(frame)})
    return samples


def clean_candidate(item, samples):
    inside = [s for s in samples if item["start"] <= s["time"] < item["end"]]
    # Reject windows with detected bad scenes instead of removing words mid-story.
    return bool(inside) and all(s["good"] for s in inside)


def make_thumbnails(source, folder, item, settings):
    good = []
    length = item["end"] - item["start"]
    for i in range(12):
        position = item["start"] + length * (i + 1) / 13
        path = folder / f"candidate-{i}.jpg"
        run_media(
            [
                settings.ffmpeg_path,
                "-v",
                "error",
                "-nostdin",
                "-y",
                "-ss",
                str(position),
                "-protocol_whitelist",
                "file,pipe",
                "-i",
                str(source),
                "-frames:v",
                "1",
                "-vf",
                "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280",
                str(path),
            ],
            30,
        )
        if not path.is_file():
            continue
        with Image.open(path) as image:
            quality = frame_quality(image.resize((320, 240)))
            if quality["good"]:
                good.append({"path": path, "time": position, **quality})
    selected = []
    # Quality first, then visual/time separation; don't repeat one frame three times.
    for frame in sorted(good, key=lambda x: x["score"], reverse=True):
        if any(abs(frame["time"] - s["time"]) < length / 5 for s in selected):
            continue
        target = folder / f"thumbnail-{len(selected)}.jpg"
        target.write_bytes(frame["path"].read_bytes())
        selected.append(frame)
        if len(selected) == 3:
            break
    for path in folder.glob("candidate-*.jpg"):
        path.unlink()
    return [
        {
            "index": i,
            "time_seconds": round(frame["time"], 2),
            "sharpness": frame["sharpness"],
            "brightness": frame["brightness"],
        }
        for i, frame in enumerate(selected)
    ]
