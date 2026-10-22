"""Pure helpers for serving files (HTTP Range parsing) so seeking in <video> works. No framework imports."""
import re

_RANGE = re.compile(r"bytes=(\d*)-(\d*)")


def parse_range(header: str | None, size: int):
    """Returns None (no/ignored header), 'invalid' (416), or (start, end) inclusive."""
    if not header:
        return None
    m = _RANGE.fullmatch(header.strip())
    if not m or (m.group(1) == "" and m.group(2) == "") or size <= 0:
        return "invalid" if m or size <= 0 else None
    if m.group(1) == "":                       # suffix range: the last N bytes
        length = int(m.group(2))
        if length == 0:
            return "invalid"
        return max(0, size - length), size - 1
    start = int(m.group(1))
    end = int(m.group(2)) if m.group(2) else size - 1
    if start >= size or start > end:
        return "invalid"
    return start, min(end, size - 1)
