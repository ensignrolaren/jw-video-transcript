const fs = require('node:fs');
const { transformSync } = require('esbuild');

const source = fs.readFileSync('transcript.js', 'utf8').trim();
const { code } = transformSync(source.replace('javascript:', ''), {
  minify: true,
  target: 'es2020'
});
// URLs discard literal newlines, including ones inside minified template
// strings. Encode the payload so dragging/copying preserves every byte.
const bookmarklet = 'javascript:' + encodeURIComponent(code.trim());
fs.writeFileSync('bookmarklet.js', bookmarklet + '\n');
let html = fs.readFileSync('install.html', 'utf8');
for (const [id, body] of [['bm', bookmarklet], ['src', source]]) {
  const pattern = new RegExp('(<script type="text/plain" id="' + id + '">\\n)[\\s\\S]*?(\\n</script>)');
  if (!pattern.test(html)) throw new Error('Missing installer block: ' + id);
  html = html.replace(pattern, (_, start, end) => start + body + end);
}
fs.writeFileSync('install.html', html);
