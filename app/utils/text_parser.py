from __future__ import annotations

import re


COLOR_MAP = {
    "green": "green-text",
    "red": "red-text",
    "blue": "blue-text",
    "yellow": "yellow-text",
    "white": "white-text",
}


def escape_html(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#039;")
    )


def parse_colored_text(text: str) -> str:
    tags = "|".join(COLOR_MAP)
    pattern = re.compile(rf"<({tags})>(.*?)</\1>", re.S)
    result: list[str] = []
    last_index = 0

    for match in pattern.finditer(text):
        result.append(escape_html(text[last_index:match.start()]))
        tag = match.group(1)
        content = match.group(2)
        result.append(f'<span class="{COLOR_MAP[tag]}">{escape_html(content)}</span>')
        last_index = match.end()

    result.append(escape_html(text[last_index:]))
    return "".join(result)
