"""Conservative visual sampling. Quality thresholds are transparent, not viral scores."""

import hashlib
import json
import math
import time

import cv2
import httpx
import numpy as np
from filelock import FileLock
from PIL import Image, ImageFilter, ImageOps

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
    cache = source.parent / "quality-v2.json"
    fingerprint = [source.stat().st_size, source.stat().st_mtime_ns]
    if cache.is_file():
        try:
            saved = json.loads(cache.read_text())
            if saved["source"] == fingerprint:
                return saved["samples"]
        except (ValueError, KeyError, OSError):
            pass
    # Two-second RGB sampling returns ~396 MiB at the default 60-minute limit.
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
    temporary = cache.with_suffix(".tmp")
    temporary.write_text(json.dumps({"source": fingerprint, "samples": samples}))
    temporary.replace(cache)
    return samples


def clean_candidate(item, samples):
    inside = [s for s in samples if item["start"] <= s["time"] < item["end"]]
    # Reject windows with detected bad scenes instead of removing words mid-story.
    return bool(inside) and all(s["good"] for s in inside)


# Detection only: no identity recognition, biometric database or cloud image upload.
YUNET_SHA = "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"
YUNET_URL = (
    "https://media.githubusercontent.com/media/opencv/opencv_zoo/"
    "47534e27c9851bb1128ccc0102f1145e27f23f98/models/face_detection_yunet/"
    "face_detection_yunet_2023mar.onnx"
)
_face_retry_after = 0.0


def face_detector(settings):
    global _face_retry_after
    if time.monotonic() < _face_retry_after:
        return None
    path = settings.data_dir / "models" / "yunet-2023mar.onnx"
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with FileLock(str(path) + ".lock", timeout=8):
            if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != YUNET_SHA:
                if time.monotonic() < _face_retry_after:
                    return None
                try:
                    response = httpx.get(
                        YUNET_URL, timeout=httpx.Timeout(5, connect=3), follow_redirects=True
                    )
                    response.raise_for_status()
                except httpx.HTTPError:
                    # One unavailable optional download must not stall every later clip.
                    _face_retry_after = time.monotonic() + 180
                    return None
                if (
                    len(response.content) != 232589
                    or hashlib.sha256(response.content).hexdigest() != YUNET_SHA
                ):
                    raise ValueError("Face detector checksum mismatch.")
                temporary = path.with_suffix(".tmp")
                temporary.write_bytes(response.content)
                temporary.replace(path)
        # Each concurrent clip owns its detector; OpenCV mutable input sizes aren't shared.
        return cv2.FaceDetectorYN.create(str(path), "", (960, 540), 0.8, 0.3, 100)
    except (httpx.HTTPError, OSError, ValueError, TimeoutError, cv2.error):
        _face_retry_after = time.monotonic() + 180
        return None


def faces_in(image, detector):
    if detector is None:
        return []
    detector.setInputSize(image.size)
    _, detections = detector.detect(cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2BGR))
    faces = []
    for face in detections if detections is not None else []:
        x, y, w, h = map(float, face[:4])
        if min(w, h) < 24:
            continue
        box = (max(0, x), max(0, y), min(image.width, x + w), min(image.height, y + h))
        patch = image.crop(box)
        quality = frame_quality(patch.resize((96, 96)))
        if quality["good"]:
            faces.append(
                {"box": box, "confidence": float(face[-1]), "sharpness": quality["sharpness"]}
            )
    return faces


def scene_cover(image, faces, focus):
    cover = ImageOps.fit(image, (720, 1280)).filter(ImageFilter.GaussianBlur(24))
    framing = "full scene"
    if faces and focus != "scene":
        boxes = [f["box"] for f in faces]
        x1, y1 = min(b[0] for b in boxes), min(b[1] for b in boxes)
        x2, y2 = max(b[2] for b in boxes), max(b[3] for b in boxes)
        area = (x2 - x1) * (y2 - y1) / (image.width * image.height)
        corner_facecam = (
            (x1 + x2) / 2 / image.width < 0.28 or (x1 + x2) / 2 / image.width > 0.72
        ) and ((y1 + y2) / 2 / image.height < 0.4 or (y1 + y2) / 2 / image.height > 0.6)
        if (
            len(faces) == 1
            and image.width > image.height
            and (focus == "gameplay" or (focus == "auto" and area < 0.12 and corner_facecam))
        ):
            # Keep game/action intact, with a readable creator portrait beneath it.
            scene = ImageOps.contain(image, (720, 620))
            cover.paste(scene, ((720 - scene.width) // 2, (620 - scene.height) // 2))
            pad_x, pad_y = (x2 - x1) * 0.6, (y2 - y1) * 0.5
            portrait = image.crop(
                (
                    max(0, x1 - pad_x),
                    max(0, y1 - pad_y),
                    min(image.width, x2 + pad_x),
                    min(image.height, y2 + pad_y * 1.8),
                )
            )
            portrait = ImageOps.contain(portrait, (680, 620))
            cover.paste(portrait, ((720 - portrait.width) // 2, 620 + (620 - portrait.height) // 2))
            return cover, "scene + creator"
        if focus != "gameplay":
            # Crop only when every detected face fits; otherwise retain the entire scene.
            cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
            width = max((x2 - x1) * 1.7, (y2 - y1) * 2.5 * 9 / 16)
            height = width * 16 / 9
            if width <= image.width and height <= image.height:
                left = min(max(0, cx - width / 2), image.width - width)
                top = min(max(0, cy - height / 2), image.height - height)
                if left <= x1 and top <= y1 and left + width >= x2 and top + height >= y2:
                    return image.crop((left, top, left + width, top + height)).resize(
                        (720, 1280)
                    ), "people preserved"
    scene = ImageOps.contain(image, (720, 1100))
    cover.paste(scene, ((720 - scene.width) // 2, (1280 - scene.height) // 2))
    return cover, framing


def make_thumbnails(source, folder, item, settings, focus="auto"):
    folder.mkdir(parents=True, exist_ok=True)
    length = item["end"] - item["start"]
    # One decode replaces twelve separate seeks. Sample the full scene before framing it.
    run_media(
        [
            settings.ffmpeg_path,
            "-v",
            "error",
            "-nostdin",
            "-y",
            "-ss",
            str(item["start"]),
            "-protocol_whitelist",
            "file,pipe",
            "-i",
            str(source),
            "-t",
            str(length),
            "-vf",
            f"fps={18 / length},scale=960:960:force_original_aspect_ratio=decrease",
            "-frames:v",
            "18",
            "-threads",
            "1",
            "-q:v",
            "2",
            str(folder / "candidate-%02d.jpg"),
        ],
        timeout=120,
    )
    detector = face_detector(settings) if focus != "scene" else None
    good = []
    try:
        for i, path in enumerate(sorted(folder.glob("candidate-*.jpg"))):
            with Image.open(path) as source_image:
                image = source_image.convert("RGB")
            quality = frame_quality(image.resize((320, 240)))
            if not quality["good"]:
                continue
            faces = faces_in(image, detector)
            face_score = sum(min(1, f["sharpness"] / 150) * f["confidence"] for f in faces)
            # Edge-heavy game HUDs cannot outrank a clear person solely on sharpness.
            score = math.log1p(quality["score"]) + (face_score * 12 if focus != "scene" else 0)
            signature = np.asarray(image.resize((16, 16)).convert("L"), dtype=np.float32)
            good.append(
                {
                    "image": image,
                    "faces": faces,
                    "rank": score,
                    "signature": signature,
                    "time": item["start"] + (i + 0.5) * length / 18,
                    **quality,
                }
            )
        # Prefer recurring on-screen positions (e.g. facecam), without recognizing identity.
        for frame in good:
            recurring = sum(
                any(
                    abs(
                        (f["box"][0] + f["box"][2]) / 2 / frame["image"].width
                        - (g["box"][0] + g["box"][2]) / 2 / other["image"].width
                    )
                    < 0.12
                    for other in good
                    for g in other["faces"]
                )
                for f in frame["faces"]
            )
            frame["rank"] += min(2, recurring / 18)
        selected = []
        for frame in sorted(good, key=lambda x: x["rank"], reverse=True):
            if any(
                abs(frame["time"] - s["time"]) < length / 6
                or np.mean(np.abs(frame["signature"] - s["signature"])) < 5
                for s in selected
            ):
                continue
            cover, framing = scene_cover(frame["image"], frame["faces"], focus)
            cover.save(folder / f"thumbnail-{len(selected)}.jpg", "JPEG", quality=91)
            frame["framing"] = framing
            selected.append(frame)
            if len(selected) == 3:
                break
        return [
            {
                "index": i,
                "time_seconds": round(f["time"], 2),
                "sharpness": f["sharpness"],
                "brightness": f["brightness"],
                "faces": len(f["faces"]),
                "framing": f["framing"],
                "reason": "Clear people + scene"
                if f["faces"]
                else "Clear scene; no confident face detected",
            }
            for i, f in enumerate(selected)
        ]
    finally:
        for path in folder.glob("candidate-*.jpg"):
            path.unlink()
