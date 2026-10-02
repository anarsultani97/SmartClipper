import io
import json
from types import SimpleNamespace

import pytest
from smartclipper_api import link_import, transcription
from smartclipper_api.config import Settings
from smartclipper_api.schemas import GenerateOptions, TranscriptUpload

VIDEO = "https://www.youtube.com/watch?v=7KuAUgDbxfw&list=PL970Mjbk0xsNgU0J__T66jU8ZtbFQeO1Y"
LIMIT = 3 * 1024**3


def test_exact_user_link_is_one_video():
    assert link_import.video_link(VIDEO) == "https://www.youtube.com/watch?v=7KuAUgDbxfw"


def test_long_video_allowed_and_rejection_explains_old_limit():
    assert Settings(_env_file=None).max_duration_seconds == 3600
    assert link_import.import_rejection({"duration": 2734}, 3600, LIMIT) is None
    assert link_import.import_rejection({"duration": 2734}, 1800, LIMIT) == (
        "This video is 45:34 long. The import limit is 30 minutes. Choose a shorter video."
    )
    assert link_import.import_rejection({"duration": 3600}, 3600, LIMIT) is None
    assert "60 minutes" in link_import.import_rejection({"duration": 3601}, 3600, LIMIT)


@pytest.mark.parametrize("duration", [None, 0, -1, float("nan"), float("inf"), "2734"])
def test_invalid_duration_fails_closed(duration):
    assert "usable video duration" in link_import.import_rejection(
        {"duration": duration}, 3600, LIMIT
    )


def test_live_size_and_incomplete_metadata():
    assert "Live broadcasts" in link_import.import_rejection({"is_live": True}, 3600, LIMIT)
    assert "3 GB" in link_import.import_rejection(
        {"duration": 10, "filesize": LIMIT + 1}, 3600, LIMIT
    )
    assert link_import.import_rejection({}, 3600, LIMIT, incomplete=True) is None


def test_rejection_survives_downloader_skipping_video(tmp_path, monkeypatch, capsys):
    class Downloader:
        def __init__(self, options):
            self.options = options

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def extract_info(self, url, download):
            assert self.options["match_filter"]({"duration": 2734}, incomplete=False)
            return None

    monkeypatch.setattr("yt_dlp.YoutubeDL", Downloader)
    monkeypatch.setattr(link_import, "restrict_network", lambda: None)
    monkeypatch.setattr(link_import, "restrict_downloaders", lambda: None)
    monkeypatch.setattr(
        "sys.stdin",
        io.StringIO(
            json.dumps(
                {
                    "url": VIDEO,
                    "folder": str(tmp_path),
                    "duration": 1800,
                    "limit": LIMIT,
                    "ffmpeg": "ffmpeg",
                    "node": "node",
                }
            )
        ),
    )
    with pytest.raises(SystemExit) as error:
        link_import.main()
    assert error.value.code == 1
    result = json.loads(capsys.readouterr().out)
    assert "45:34" in result["error"]
    assert "30 minutes" in result["error"]


def test_health_reports_actual_limits(app):
    from fastapi.testclient import TestClient

    with TestClient(app) as client:
        result = client.get("/api/v1/health").json()
        assert result["max_duration_seconds"] == app.state.settings.max_duration_seconds
        assert result["max_upload_bytes"] == 1024


def test_azerbaijani_is_supported_for_generation_and_transcripts():
    assert GenerateOptions(language="az").language == "az"
    assert TranscriptUpload(language="az", srt="caption").language == "az"


def test_unsupported_detected_language_fails_before_consuming_asr(tmp_path, monkeypatch):
    import wave

    source = tmp_path / "speech.wav"
    with wave.open(str(source), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(16000)
        audio.writeframes(bytes(32000))

    def segments():
        raise AssertionError("Unsupported language must fail before inference")
        yield

    class Pipeline:
        def __init__(self, model):
            pass

        def transcribe(self, *args, **kwargs):
            return segments(), SimpleNamespace(language="de")

    monkeypatch.setattr(transcription, "model_for", lambda *args: object())
    monkeypatch.setattr("faster_whisper.BatchedInferencePipeline", Pipeline)
    with pytest.raises(ValueError, match="supported language"):
        transcription.transcribe(source, Settings(data_dir=tmp_path))
