"""Small readable groups and safe styled ASS with real word timestamps."""

import re


def caption_groups(segments):
    groups = []
    for cue in segments:
        words = cue.get("words") or []
        if not words:
            # Uploaded/edited phrases lack alignment. Split for readability with
            # estimated phrase timing only; never pretend these are spoken-word timestamps.
            parts, chunk = [], []
            for token in cue["text"].split():
                if chunk and (len(chunk) >= 4 or len(" ".join(chunk)) + len(token) > 32):
                    parts.append(" ".join(chunk))
                    chunk = []
                chunk.append(token)
            if chunk:
                parts.append(" ".join(chunk))
            total = max(1, sum(len(part) for part in parts))
            cursor = cue["start"]
            for index, part in enumerate(parts):
                end = (
                    cue["end"]
                    if index == len(parts) - 1
                    else cursor + (cue["end"] - cue["start"]) * len(part) / total
                )
                groups.append({"start": cursor, "end": end, "text": part, "words": []})
                cursor = end
            continue
        group = []
        for word in words:
            if group and (
                len(group) >= 4
                or len(" ".join(w["text"] for w in group)) + len(word["text"]) > 32
                or word["start"] - group[-1]["end"] > 0.4
            ):
                groups.append(
                    {
                        "start": group[0]["start"],
                        "end": group[-1]["end"],
                        "words": group,
                        "text": " ".join(w["text"] for w in group),
                    }
                )
                group = []
            group.append(word)
        if group:
            groups.append(
                {
                    "start": group[0]["start"],
                    "end": group[-1]["end"],
                    "words": group,
                    "text": " ".join(w["text"] for w in group),
                }
            )
    return groups


def caption_ass(segments, style="pop", position="lower", width=720, height=1280):
    def stamp(t):
        cs = max(0, round(t * 100))
        hours, cs = divmod(cs, 360000)
        minutes, cs = divmod(cs, 6000)
        seconds, cs = divmod(cs, 100)
        return f"{hours}:{minutes:02}:{seconds:02}.{cs:02}"

    def safe(text):
        return re.sub(r"[{}\\<>\r\n]", "", text)

    highlight = "&H0076FFDC&" if style == "pop" else "&H0000DDFF&"
    header = (
        f"[Script Info]\nScriptType: v4.00+\nPlayResX: {width}\nPlayResY: {height}\nWrapStyle: 0\n"
    )
    header += (
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
        "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, "
        "Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, "
        "MarginL, MarginR, MarginV, Encoding\n"
    )
    header += (
        "Style: Default,Noto Sans,46,&H00FFFFFF,&H00FFFFFF,&H00202020,&H80000000,"
        f"-1,0,0,0,100,100,0,0,1,3,1,{5 if position == 'middle' else 2},"
        f"{round(width * 0.09)},{round(width * 0.14)},{round(height * 0.18)},1\n"
    )
    header += (
        "[Events]\nFormat: Layer, Start, End, Style, Name, "
        "MarginL, MarginR, MarginV, Effect, Text\n"
    )
    lines = []
    for group in caption_groups(segments):
        if style != "clean" and group["words"]:
            boundaries = sorted(
                {
                    group["start"],
                    group["end"],
                    *[w[k] for w in group["words"] for k in ("start", "end")],
                }
            )
            for start, end in zip(boundaries, boundaries[1:], strict=False):
                if end <= start:
                    continue
                text = " ".join(
                    (
                        "{\\c" + highlight + "}"
                        if w["start"] <= start < w["end"]
                        else "{\\c&H00FFFFFF&}"
                    )
                    + safe(w["text"])
                    for w in group["words"]
                )
                lines.append(f"Dialogue: 0,{stamp(start)},{stamp(end)},Default,,0,0,0,,{text}")
        else:
            lines.append(
                f"Dialogue: 0,{stamp(group['start'])},{stamp(group['end'])},Default,,0,0,0,,"
                f"{safe(group['text'])}"
            )
    return header + "\n".join(lines) + "\n"
