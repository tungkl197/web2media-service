/**
 * Web2Media Service — Text Parser for Thumbnail Color Tags
 *
 * Parses color tags like <green>text</green> into HTML spans
 * with corresponding CSS classes.
 */

/**
 * Mapping: color tag → CSS class
 */
const COLOR_MAP = {
  green: 'green-text',
  red: 'red-text',
  blue: 'blue-text',
  yellow: 'yellow-text',
  white: 'white-text',
};

/**
 * Escape HTML special characters to prevent injection.
 * @param {string} str - Raw string
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Parse color tags in text and convert to HTML spans.
 *
 * Input:  Tôi đòi <green>nghỉ việc</green>, sếp tổng liền <red>phát điên</red> rồi
 * Output: Tôi đòi <span class="green-text">nghỉ việc</span>, sếp tổng liền <span class="red-text">phát điên</span> rồi
 *
 * @param {string} text - Text with color tags
 * @returns {string} HTML string with span elements
 */
function parseColoredText(text) {
  // Build a combined regex that matches any supported color tag
  const tags = Object.keys(COLOR_MAP).join('|');
  const pattern = new RegExp(`<(${tags})>(.*?)<\\/\\1>`, 'gs');

  // Split text by color tags, escape non-tag parts, then reconstruct
  let result = '';
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    // Escape text before this match
    result += escapeHtml(text.slice(lastIndex, match.index));

    const tag = match[1];
    const content = match[2];
    const cssClass = COLOR_MAP[tag];

    result += `<span class="${cssClass}">${escapeHtml(content)}</span>`;
    lastIndex = match.index + match[0].length;
  }

  // Escape remaining text after last match
  result += escapeHtml(text.slice(lastIndex));

  return result;
}

module.exports = { parseColoredText, escapeHtml };
