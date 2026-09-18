const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

// Attribute values from the WOL 1 Samuel introduction, after HTML decoding.
const wolSource = '/wol/vidlink/r1/lp-e?pub=nwtsv&track=090&style=chromeless';
const player = (attributes, language = 'E', tag = 'video') => {
  const document = new JSDOM('<article></article>').window.document;
  const article = document.querySelector('article');
  article.setAttribute('data-lang', language);
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  article.append(element);
  return article.outerHTML;
};
function executable(build) {
  let code;
  if (build === 'installed bookmark') {
    const dom = new JSDOM(fs.readFileSync('install.html', 'utf8'), { runScripts: 'dangerously' });
    code = dom.window.document.getElementById('bml').href;
    dom.window.close();
  } else code = fs.readFileSync(build, 'utf8');
  return build === 'transcript.js' ? code : decodeURIComponent(new URL(code).href.slice('javascript:'.length));
}
async function run(build, { href, players = [], files, language = 'en', media, vtt }) {
  const requests = [], alerts = [], copied = [];
  const dom = new JSDOM('<!doctype html><html lang="' + language + '"><body>' + players.join('') + '</body></html>');
  await vm.runInNewContext(executable(build), {
    URL, URLSearchParams,
    location: { href: href || 'https://wol.jw.org/en/wol/bibledocument/r1/lp-e/nwtsty/9/introduction' },
    document: dom.window.document,
    navigator: { clipboard: { writeText: async text => copied.push(text) } },
    alert: text => alerts.push(text),
    fetch: async url => {
      requests.push(url);
      return {
        json: async () => media || ({ media: [{ title: 'Introduction to 1 Samuel', files: files || [{ subtitles: { url: 'https://example.test/captions.vtt' } }] }] }),
        text: async () => vtt || 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nFirst sentence. Second sentence.\n'
      };
    }
  });
  dom.window.close();
  return { requests, alerts, copied };
}
for (const build of ['transcript.js', 'bookmarklet.js', 'installed bookmark']) {
  test(`${build}: WOL video copies sentence-formatted subtitles`, async () => {
    const result = await run(build, { players: [player({ 'data-json-src': wolSource })] });
    assert.match(result.requests[0], /\/E\/pub-nwtsv_90_VIDEO\?/);
    assert.equal(result.copied[0], 'Introduction to 1 Samuel\n\nFirst sentence.\nSecond sentence.');
  });
  test(`${build}: loaded WOL player retains metadata on a div`, async () => {
    const result = await run(build, { players: [player({ 'data-json-src': wolSource, class: 'videoModal embeddedVideo videoPlayerHolder' }, 'E', 'div')] });
    assert.match(result.requests[0], /\/E\/pub-nwtsv_90_VIDEO\?/);
    assert.equal(result.copied[0], 'Introduction to 1 Samuel\n\nFirst sentence.\nSecond sentence.');
  });
  test(`${build}: skips unusable players and honors WOL language`, async () => {
    const result = await run(build, { players: [player({ 'data-video': '' }), player({ 'data-json-src': wolSource }, 'S')] });
    assert.match(result.requests[0], /\/S\/pub-nwtsv_90_VIDEO\?/);
  });
  test(`${build}: existing embedded players still work`, async () => {
    const result = await run(build, { players: [player({ 'data-video': 'webpubvid://?pub=ljf&track=10' })] });
    assert.match(result.requests[0], /pub-ljf_10_VIDEO/);
  });
  test(`${build}: explicit URL video and language take precedence`, async () => {
    const result = await run(build, { href: 'https://www.jw.org/finder?lank=pub-ljf_10_VIDEO&wtlocale=F', players: [player({ 'data-json-src': wolSource })] });
    assert.match(result.requests[0], /\/F\/pub-ljf_10_VIDEO/);
  });
  test(`${build}: WOL video without subtitles keeps whisper fallback`, async () => {
    const result = await run(build, { players: [player({ 'data-json-src': wolSource })], files: [{ progressiveDownloadURL: 'https://example.test/large.mp4', filesize: 100 }, { progressiveDownloadURL: 'https://example.test/small.mp4', filesize: 10 }] });
    assert.equal(result.copied[0], "jwt 'https://example.test/small.mp4' 'Introduction to 1 Samuel'");
  });
  test(`${build}: no video reports detection failure`, async () => {
    const result = await run(build, {});
    assert.equal(result.requests.length, 0);
    assert.match(result.alerts[0], /No video ID/);
  });
  if (process.env.JW_LIVE_FIXTURES) test(`${build}: fetched Samuel metadata and subtitles`, async () => {
    const result = await run(build, { players: [player({ 'data-json-src': wolSource })], media: JSON.parse(fs.readFileSync('/tmp/jw-samuel-media.json')), vtt: fs.readFileSync('/tmp/jw-samuel.vtt', 'utf8') });
    assert.match(result.copied[0], /^Introduction to 1 Samuel\n\n/);
    assert.ok(result.copied[0].length > 1000);
    assert.match(result.alerts[0], /^Copied \d+ sentences/);
    console.log(result.alerts[0]);
  });
}
test('installer embeds current source and bookmarklet', () => {
  const html = fs.readFileSync('install.html', 'utf8');
  for (const [id, file] of [['bm', 'bookmarklet.js'], ['src', 'transcript.js']]) {
    assert.equal(html.match(new RegExp('<script type="text/plain" id="' + id + '">\\n([\\s\\S]*?)\\n</script>'))[1], fs.readFileSync(file, 'utf8').trim());
  }
});
