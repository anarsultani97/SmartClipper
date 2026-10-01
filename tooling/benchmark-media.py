"""Manual native-media benchmark against dev; no unit tests or production DB writes."""

import argparse
import json
import subprocess
import time
import types
from pathlib import Path

from smartclipper_api.config import Settings
from smartclipper_api.quality import make_thumbnails
from smartclipper_api.rendering import render_short

parser = argparse.ArgumentParser()
parser.add_argument("source", type=Path)
parser.add_argument("--start", type=float, default=0)
parser.add_argument("--length", type=float, default=45)
args = parser.parse_args()
settings = Settings()
folder = Path(".cache/creator-benchmark")
folder.mkdir(parents=True, exist_ok=True)
source = args.source.resolve()
item = {"start": args.start, "end": args.start + args.length}
results = {"duration_seconds": args.length, "baseline": "3d3ab0e", "runs": {}}


def previous_module(name):
    text = subprocess.check_output(
        ["git", "show", f"3d3ab0e:services/api/src/smartclipper_api/{name}.py"],
        encoding="utf-8",
    )
    module = types.ModuleType(f"smartclipper_api.{name}")
    exec(compile(text, f"baseline-{name}.py", "exec"), module.__dict__)
    return module


old_quality = previous_module("quality")
old_render = previous_module("rendering")
for name, renderer, thumbnailer in (
    ("before", old_render.render_short, old_quality.make_thumbnails),
    ("after", lambda *a, **kw: render_short(*a, **kw, preview=True), make_thumbnails),
):
    output = folder / name
    output.mkdir(exist_ok=True)
    began = time.perf_counter()
    renderer(source, output, item["start"], item["end"], settings)
    render_seconds = time.perf_counter() - began
    began = time.perf_counter()
    covers = thumbnailer(source, output, item, settings)
    thumbnail_seconds = time.perf_counter() - began
    results["runs"][name] = {
        "render_seconds": round(render_seconds, 3),
        "thumbnail_seconds": round(thumbnail_seconds, 3),
        "total_seconds": round(render_seconds + thumbnail_seconds, 3),
        "thumbnail_count": len(covers),
        "cover_metadata": covers,
    }
(folder / "results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
print(json.dumps(results, indent=2))
