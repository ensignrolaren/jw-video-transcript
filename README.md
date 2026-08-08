# jw-video-transcript

A bookmarklet that copies the transcript of a jw.org video to your clipboard as
plain text — one sentence per line — plus a shell function that falls back to
local speech-to-text when a video has no subtitle track.

No video download, no ffmpeg demuxing, no browser extension. Subtitles are
served as standalone WebVTT files; the bookmarklet just finds the right one and
reflows it.

## How it works

1. Determines the video's LANK (its `pub-…_VIDEO` identifier) from the page URL,
   the embedded player markup, a jw-cdn download link, the `docid`/`track`
   parameters on a `GETPUBMEDIALINKS` play/download link, or — on news releases,
   where the player replaces those links once it loads — the `docid` in the
   `og:image` URL or the `choose-language` link.
2. Queries the public mediator API:
   `https://b.jw-cdn.org/apis/mediator/v1/media-items/{LANG}/{LANK}?clientType=www`
3. If the mediator has no entry (some `docid`-style items), falls back to the
   pub-media API: `GETPUBMEDIALINKS?output=json&fileformat=MP4&docid=…&track=…`
4. If a subtitle URL is present, fetches the VTT, strips cue numbers, timestamps
   and markup, dedupes rollup captions, reflows the fragments into sentences,
   and copies the result with the video's title on the first line.
5. If there's no subtitle track, copies a `jwt '<mp4-url>' '<title>'` command
   instead, pointed at the smallest available MP4 (the audio track is identical
   at every resolution).

## Install

**Bookmarklet.** Open [`install.html`](install.html) in a browser and drag the
link to your bookmarks bar. Or create a bookmark manually and paste the contents
of [`bookmarklet.js`](bookmarklet.js) as the URL.

**Fallback (optional).** For videos without subtitles:

Apple Silicon macOS only — it uses mlx-whisper (Metal) and `pbcopy`.

```sh
brew install pipx && pipx ensurepath
pipx install mlx-whisper
```

Then source the shell function from your `~/.zshrc`:

```sh
source ~/path/to/jw-video-transcript/jwt.sh
```

`jwt.sh` expects `reflow.py` to sit beside it in the repo — that's how it finds
it. If you'd rather paste the function straight into `~/.zshrc`, point
`JWT_REFLOW` at the script instead:

```sh
export JWT_REFLOW=~/path/to/jw-video-transcript/reflow.py
```

## Usage

Open a video page on jw.org and click the bookmark.

- **Subtitles available** → transcript on your clipboard, one sentence per line.
- **No subtitles** → a `jwt` command on your clipboard. Paste it into a terminal;
  it downloads the video, runs whisper, reflows the result to one sentence per
  line, and puts it on your clipboard.

Either way the output starts with the video's title, then a blank line, then the
transcript.

`jwt` also works standalone on any URL or local file. The title is optional:

```sh
jwt 'https://cfp2.jw-cdn.org/a/…/ljf_E_010_r240P.mp4' 'Video Title'
jwt ~/Movies/talk.mp4
```

Override the whisper model with `JWT_MODEL`. The default is `whisper-small.en`;
`medium` is slower but noticeably better on proper nouns:

```sh
JWT_MODEL=mlx-community/whisper-medium.en-mlx jwt <url>
```

`reflow.py` also runs on its own, which is handy for re-flowing a transcript you
already have without re-transcribing:

```sh
pbpaste | python3 reflow.py --title 'Video Title' | pbcopy
```

## Notes

- **Language.** Uses the `wtlocale` URL parameter when present, the MEPS symbol
  parsed out of an MP4 filename when available, otherwise maps the page's
  `<html lang>` (en→E, es→S, fr→F, de→X, pt→T, it→I). Add more in the `M` map.
- **Sentence reflow.** Caption lines are joined and re-split on sentence-ending
  punctuation. Common abbreviations (`Dr.`, `a.m.`, `e.g.`) and initials are
  shielded so they don't trigger a break. A line ending in a hyphen is treated
  as a split word and joined without a space. This logic exists twice — in the
  bookmarklet for subtitles, in `reflow.py` for whisper output — because the two
  run in different places. Change one, change the other. The regexes differ
  slightly: Python's `re` has no variable-length lookbehind, so `reflow.py`
  captures the closing quotes instead of looking behind them.
- **Whisper accuracy.** The reflow only fixes line breaks. Proper nouns are
  whisper's weak point (`Tract` → "tracked", `Taze` → "Tase"); a larger
  `JWT_MODEL` helps.
- **Scope.** Must be run from a jw.org page — the Clipboard API needs a focused
  document and a user gesture.
- **Multiple videos on one page.** When the LANK isn't in the URL, the first
  matching link in DOM order wins.
- **Page types.** Library video pages, `finder` share links, article pages with a
  download dropdown, and news releases are all handled.

## Files

| File | |
|---|---|
| `bookmarklet.js` | minified, paste-as-URL build |
| `transcript.js` | readable, annotated source |
| `install.html` | drag-to-install page, generated from the two above |
| `jwt.sh` | whisper fallback shell function |
| `reflow.py` | sentence reflow for the whisper path |

`install.html` embeds both builds, so regenerate it after any logic change
rather than editing it by hand:

```sh
python3 - <<'PY'
import re, io
html = io.open('install.html', encoding='utf-8').read()
for bid, path in (('bm', 'bookmarklet.js'), ('src', 'transcript.js')):
    body = io.open(path, encoding='utf-8').read().strip()
    pat = re.compile(r'(<script type="text/plain" id="%s">\n).*?(\n</script>)' % bid, re.S)
    html, n = pat.subn(lambda m: m.group(1) + body + m.group(2), html)
    assert n == 1, bid
io.open('install.html', 'w', encoding='utf-8').write(html)
PY
```

## License

MIT
