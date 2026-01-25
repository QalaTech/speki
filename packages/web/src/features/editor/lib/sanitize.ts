/**
 * Sanitize markdown content for MDXEditor.
 * Escapes angle brackets that look like JSX/HTML tags but aren't valid HTML.
 * This prevents MDXEditor from trying to parse things like <string> or <T> as components.
 * Also removes HTML comments which cause "name: N/A" parsing errors.
 */
export function sanitizeForMdx(content: string): string {
  // Don't process if content is empty
  if (!content) return content;

  // Pattern to find angle brackets that look like type parameters or invalid HTML
  // Matches <word> but NOT valid HTML tags like <div>, <span>, <a>, etc.
  const validHtmlTags = new Set([
    'a', 'abbr', 'address', 'article', 'aside', 'audio', 'b', 'blockquote', 'body',
    'br', 'button', 'canvas', 'caption', 'code', 'col', 'dd', 'details', 'div', 'dl',
    'dt', 'em', 'embed', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1',
    'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr', 'html', 'i', 'iframe', 'img',
    'input', 'label', 'legend', 'li', 'link', 'main', 'mark', 'meta', 'nav', 'noscript',
    'object', 'ol', 'option', 'p', 'param', 'picture', 'pre', 'progress', 'q', 's',
    'script', 'section', 'select', 'small', 'source', 'span', 'strong', 'style', 'sub',
    'summary', 'sup', 'svg', 'table', 'tbody', 'td', 'template', 'textarea', 'tfoot',
    'th', 'thead', 'time', 'title', 'tr', 'track', 'u', 'ul', 'video', 'wbr',
  ]);

  // Split by code blocks to avoid modifying content inside them
  const parts = content.split(/(```[\s\S]*?```|`[^`]+`)/g);

  return parts.map((part, index) => {
    // Odd indices are code blocks - don't modify
    if (index % 2 === 1) return part;

    let result = part;

    // 0. Remove HTML comments (causes "name: N/A" errors in MDXEditor)
    // This includes <!-- comment --> style comments
    result = result.replace(/<!--[\s\S]*?-->/g, '');

    // 1. Escape incomplete tags (opening < without closing >)
    // Match < followed by word characters but no > before end of line or next <
    result = result.replace(/<([a-zA-Z][a-zA-Z0-9_-]*)(?![^<]*>)/g, '\\<$1');

    // 2. Escape angle brackets that look like comparison operators
    // Match < or > surrounded by spaces or alphanumeric (like "x < y" or "a > b")
    result = result.replace(/(\s)<(\s)/g, '$1\\<$2');
    result = result.replace(/(\s)>(\s)/g, '$1\\>$2');

    // 3. Replace invalid HTML-like tags with escaped versions
    result = result.replace(/<(\/?[a-zA-Z][a-zA-Z0-9_-]*)([^>]*)>/g, (match, tagName, rest) => {
      const normalizedTag = tagName.replace('/', '').toLowerCase();
      if (validHtmlTags.has(normalizedTag)) {
        return match; // Keep valid HTML
      }
      // Escape the angle brackets
      return `\\<${tagName}${rest}\\>`;
    });

    // 4. Remove any remaining raw HTML blocks that MDXEditor can't handle
    // This catches things like <!DOCTYPE>, <?xml?>, etc.
    result = result.replace(/<[!?][^>]*>/g, '');

    return result;
  }).join('');
}
