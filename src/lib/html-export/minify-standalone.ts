/**
 * Safe, dependency-free minify for self-contained standalone HTML.
 * Avoids transforming string/regex contents inside <script>.
 */

function minifyCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{};:,>~+])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

function minifyScriptBody(js: string): string {
  return js
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//")) return "";
      return trimmed;
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Minify style blocks, collapse HTML whitespace outside script/style,
 * and trim script body indentation / full-line comments.
 */
export function minifyStandaloneHtml(html: string): string {
  let out = html.replace(
    /<style>([\s\S]*?)<\/style>/gi,
    (_m, css: string) => `<style>${minifyCss(css)}</style>`,
  );

  out = out.replace(
    /<script>([\s\S]*?)<\/script>/gi,
    (_m, js: string) => `<script>${minifyScriptBody(js)}</script>`,
  );

  // Collapse whitespace between tags; leave text nodes and attribute values alone
  // by only targeting tag boundaries.
  out = out.replace(/>\s+</g, "><");
  return out.trim();
}
