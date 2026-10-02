import numpy as np
import pytest
from PIL import Image, ImageFilter
from smartclipper_api.highlights import candidates, select_diverse
from smartclipper_api.quality import clean_candidate, frame_quality
from smartclipper_api.transcription import caption_text, parse_srt, relative_segments


def test_srt_timing_validation_and_caption_injection():
    segments = parse_srt("1\n00:00:01,000 --> 00:00:04,000\n<i>Hello.</i>", 10)
    assert segments == [{"start": 1, "end": 4, "text": "Hello."}]
    assert "WEBVTT" in caption_text(segments)
    assert relative_segments(segments, 2, 6) == [
        {"start": 0, "end": 2, "text": "Hello.", "review": False, "words": []}
    ]
    for invalid in (
        "untimed words",
        "1\n00:00:01,000 --> 00:00:11,000\nOutside",
        "1\n00:00:65,000 --> 00:01:10,000\nBad",
    ):
        with pytest.raises(ValueError):
            parse_srt(invalid, 10)
    unsafe = [{"start": 0, "end": 1, "text": "<script> {\\pos(1,1)} -->"}]
    assert "<script>" not in caption_text(unsafe)
    assert "{" not in caption_text(unsafe, "srt")


def test_five_diverse_complete_excerpts_stay_inside_requested_length():
    segments = [
        {
            "start": i * 10,
            "end": i * 10 + 9,
            "text": f"Thought {i}: a distinct explanation about topic{i}.",
        }
        for i in range(20)
    ]
    result = select_diverse(candidates(segments, 200, 30), 5)
    assert len(result) == 5
    assert all(0 <= item["start"] < item["end"] <= 200 for item in result)
    assert all(item["end"] - item["start"] <= 30 for item in result)
    assert all(len(item["summary"]) == 3 for item in result)
    assert all(
        not line.startswith("The excerpt") and not line.startswith("The speaker")
        for item in result
        for line in item["summary"]
    )
    assert all(a["end"] <= b["start"] for a, b in zip(result, result[1:], strict=False))


def test_short_source_returns_fewer_not_fabricated_candidates():
    speech = [{"start": 0, "end": 9, "text": "One complete thought that deserves to be heard."}]
    assert len(select_diverse(candidates(speech, 10, 15), 5)) == 1
    assert candidates([], 120, 45) == []


def test_quality_rejects_black_dark_white_and_blurred_frames():
    rng = np.random.default_rng(2)
    clear = Image.fromarray(rng.integers(40, 210, size=(240, 320, 3), dtype=np.uint8))
    assert frame_quality(clear)["good"]
    for bad in [Image.new("RGB", (320, 240), color=c) for c in ("black", "white", (12, 12, 12))]:
        assert not frame_quality(bad)["good"]
    assert not frame_quality(clear.filter(ImageFilter.GaussianBlur(12)))["good"]
    item = {"start": 0, "end": 10}
    assert clean_candidate(item, [{"time": 1, "good": True}, {"time": 3, "good": True}])
    assert not clean_candidate(item, [{"time": 1, "good": True}, {"time": 3, "good": False}])


@pytest.mark.parametrize(
    "text",
    [
        "Hola, una historia completa.",
        "中文的一段完整故事。",
        "एक पूरी कहानी।",
        "هذه قصة كاملة.",
        "Uma história completa.",
        "একটি সম্পূর্ণ গল্প।",
        "Законченная история.",
        "ひとつの物語です。",
        "Une histoire complète.",
        "Bu, paylaşmaya değer eksiksiz bir hikâye.",
    ],
)
def test_unicode_captions_survive(text):
    assert text in caption_text([{"start": 0, "end": 3, "text": text}])
