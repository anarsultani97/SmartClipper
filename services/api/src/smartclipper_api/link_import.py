"""Bounded public-platform imports, isolated from the API and media worker."""

import ipaddress
import json
import math
import re
import socket
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlsplit, urlunsplit


class ImportRejected(ValueError):
    """A controlled, safe rejection message that can be shown to the user."""


def import_rejection(info, max_duration, max_bytes, *, incomplete=False):
    if info.get("is_live") or info.get("live_status") == "is_live":
        return "Live broadcasts cannot be imported. Use a completed video or upload an MP4."
    if not incomplete:
        duration = info.get("duration")
        if not isinstance(duration, (int, float)) or not math.isfinite(duration) or duration <= 0:
            return "The platform did not provide a usable video duration. Upload an MP4 instead."
        if duration > max_duration:
            minutes, seconds = divmod(math.ceil(duration), 60)
            return (
                f"This video is {minutes}:{seconds:02} long. "
                f"The import limit is {max_duration / 60:g} minutes. Choose a shorter video."
            )
    if (info.get("filesize") or 0) > max_bytes:
        return f"This video exceeds the {max_bytes / 1024**3:g} GB import limit."
    return None


def video_link(value):
    try:
        url = urlsplit(value.strip())
        host = (url.hostname or "").lower()
        if url.scheme != "https" or url.username or url.password or url.port not in {None, 443}:
            raise ValueError()
        query = parse_qs(url.query)
        valid = False
        if host in {"youtube.com", "www.youtube.com", "m.youtube.com"}:
            valid = bool(re.fullmatch(r"/(shorts|watch|live)(/[A-Za-z0-9_-]{11})?/?", url.path))
            if url.path.rstrip("/") == "/watch":
                valid = bool(re.fullmatch(r"[A-Za-z0-9_-]{11}", query.get("v", [""])[0]))
                query = {"v": query.get("v", [""])}
            else:
                valid = valid and url.path.rstrip("/") not in {"/shorts", "/live"}
                query = {}
        elif host == "youtu.be":
            valid = bool(re.fullmatch(r"/[A-Za-z0-9_-]{11}/?", url.path))
            query = {}
        elif host in {"tiktok.com", "www.tiktok.com", "m.tiktok.com"}:
            valid = bool(re.fullmatch(r"/@[^/]+/video/\d+/?", url.path))
            query = {}
        elif host in {"vm.tiktok.com", "vt.tiktok.com", "fb.watch"}:
            valid = bool(re.fullmatch(r"/[A-Za-z0-9_-]+/?", url.path))
            query = {}
        elif host in {"instagram.com", "www.instagram.com"}:
            valid = bool(re.fullmatch(r"/(reel|reels|p)/[A-Za-z0-9_-]+/?", url.path))
            query = {}
        elif host in {"facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com"}:
            valid = bool(
                re.fullmatch(
                    r"/(reel/\d+|[^/]+/videos/\d+|share/[vr]/[A-Za-z0-9]+|watch)/?", url.path
                )
            )
            if url.path.rstrip("/") == "/watch":
                valid = bool(re.fullmatch(r"\d+", query.get("v", [""])[0]))
                query = {"v": query.get("v", [""])}
            else:
                query = {}
        if not valid:
            raise ValueError()
        return urlunsplit(("https", host, url.path, f"v={query['v'][0]}" if query else "", ""))
    except (ValueError, IndexError) as exc:
        raise ValueError(
            "Paste a public YouTube, TikTok, Instagram or Facebook video link."
        ) from exc


def public_address(address):
    ip = ipaddress.ip_address(address.split("%", 1)[0])
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast


def restrict_network():
    # Process-local: every DNS lookup returns the exact checked public addresses
    # used for connection, including manifests/CDNs and redirects. Never patch the API.
    resolve, connect, connect_ex = (
        socket.getaddrinfo,
        socket.socket.connect,
        socket.socket.connect_ex,
    )

    def guarded_resolve(*args, **kwargs):
        addresses = resolve(*args, **kwargs)
        if not addresses or any(not public_address(entry[4][0]) for entry in addresses):
            raise OSError("Private network destinations are not allowed.")
        return addresses

    def guarded_connect(sock, address):
        if isinstance(address, tuple) and not public_address(address[0]):
            raise OSError("Private network destinations are not allowed.")
        return connect(sock, address)

    def guarded_connect_ex(sock, address):
        if isinstance(address, tuple) and not public_address(address[0]):
            raise OSError("Private network destinations are not allowed.")
        return connect_ex(sock, address)

    socket.getaddrinfo = guarded_resolve
    socket.socket.connect = guarded_connect
    socket.socket.connect_ex = guarded_connect_ex


def restrict_downloaders():
    import yt_dlp.downloader as downloaders
    from yt_dlp.downloader.dash import DashSegmentsFD
    from yt_dlp.downloader.external import ExternalFD, FFmpegFD
    from yt_dlp.downloader.hls import HlsFD
    from yt_dlp.downloader.http import HttpFD
    from yt_dlp.downloader.rtmp import RtmpFD

    def blocked(*args, **kwargs):
        raise ValueError("This format needs an external downloader. Upload an MP4 instead.")

    # HlsFD can call FFmpegFD directly even when the configured downloader is
    # native. Fail closed at its execution method, including direct fallback.
    ExternalFD.real_download = blocked
    ExternalFD._call_downloader = blocked
    FFmpegFD.real_download = blocked
    FFmpegFD._call_downloader = blocked
    RtmpFD.real_download = blocked
    choose = downloaders._get_suitable_downloader
    protocols = {
        "http",
        "https",
        "m3u8",
        "m3u8_native",
        "http_dash_segments",
        "http_dash_segments_generator",
        "m3u8_frag_urls",
        "dash_frag_urls",
    }

    def guarded_choice(info, protocol, params, default):
        if protocol not in protocols:
            return blocked()
        downloader = choose(info, protocol, params, default)
        if downloader not in {None, HttpFD, HlsFD, DashSegmentsFD}:
            return blocked()
        return downloader

    # All imported get_suitable_downloader aliases resolve this module's helper.
    # Unknown protocols/classes fail closed instead of acquiring a new executable.
    downloaders._get_suitable_downloader = guarded_choice


def main():
    from yt_dlp import YoutubeDL

    spec = json.load(sys.stdin)
    link = video_link(spec["url"])
    root = Path(spec["folder"]).resolve()
    restrict_network()
    restrict_downloaders()

    class Quiet:
        def debug(self, message):
            pass

        info = warning = error = debug

    def emit(**data):
        print(json.dumps(data), flush=True)

    rejection = None

    def check(info, *, incomplete=False):
        nonlocal rejection
        reason = import_rejection(info, spec["duration"], spec["limit"], incomplete=incomplete)
        if reason:
            rejection = reason
        return reason

    reported = -1

    def progress(item):
        nonlocal reported
        size = sum(path.stat().st_size for path in root.glob("source*") if path.is_file())
        if size > spec["limit"]:
            raise ImportRejected(f"Video exceeds the {spec['limit'] / 1024**3:g} GB import limit.")
        total = item.get("total_bytes") or item.get("total_bytes_estimate")
        percent = min(95, round(100 * item.get("downloaded_bytes", 0) / total)) if total else 0
        if percent != reported:
            emit(progress=percent)
            reported = percent

    options = {
        "quiet": True,
        "logger": Quiet(),
        "noplaylist": True,
        "allowed_extractors": [r"youtube(?!:tab)", r"tiktok", r"instagram", r"facebook"],
        "outtmpl": str(root / "source.%(ext)s"),
        "paths": {"home": str(root)},
        "format": "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]",
        "merge_output_format": "mp4",
        "ffmpeg_location": spec["ffmpeg"],
        "max_filesize": spec["limit"],
        "match_filter": check,
        "socket_timeout": 20,
        "retries": 2,
        "fragment_retries": 2,
        "concurrent_fragment_downloads": 1,
        "cachedir": False,
        "proxy": "",
        "usenetrc": False,
        "hls_prefer_native": True,
        "external_downloader": {"default": "native"},
        "js_runtimes": {"node": {}},
        "remote_components": [],
        "progress_hooks": [progress],
        "postprocessor_args": {"merger+ffmpeg_i": ["-protocol_whitelist", "file,pipe"]},
    }
    try:
        with YoutubeDL(options) as downloader:
            metadata = downloader.extract_info(link, download=True)
        source = root / "source.mp4"
        if (
            not metadata
            or metadata.get("_type") in {"playlist", "multi_video"}
            or not source.is_file()
        ):
            raise ImportRejected(
                rejection
                or "The platform did not return a downloadable MP4. "
                "Try another public video or upload an MP4."
            )
        if source.stat().st_size > spec["limit"]:
            raise ImportRejected(f"Video exceeds the {spec['limit'] / 1024**3:g} GB import limit.")
        title = re.sub(r"[\\/:*?\"<>|\x00-\x1f]", "", metadata.get("title") or "Linked video")
        emit(filename=(title[:220] or "Linked video") + ".mp4", size_bytes=source.stat().st_size)
    except Exception as exc:
        (root / "import-error.txt").write_text(str(exc)[:4000], encoding="utf-8")
        # Do not send extractor dumps, URL tokens, cookies or environment paths to the UI.
        emit(
            error=str(exc)
            if isinstance(exc, ImportRejected)
            else "This link could not be imported. It may require sign-in, be private, "
            "restricted or unavailable. Upload the MP4 instead, or try another public video."
        )
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
