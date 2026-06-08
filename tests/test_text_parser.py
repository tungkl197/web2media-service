from app.utils.text_parser import escape_html, parse_colored_text


def test_escape_html_matches_legacy_contract():
    assert escape_html("""<a href="x">Tom & 'Jerry'</a>""") == (
        "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#039;Jerry&#039;&lt;/a&gt;"
    )


def test_parse_colored_text_converts_supported_tags_and_escapes_content():
    parsed = parse_colored_text("Tôi <green>đòi <b>nghỉ</b></green> rồi")

    assert parsed == (
        'Tôi <span class="green-text">đòi &lt;b&gt;nghỉ&lt;/b&gt;</span> rồi'
    )
