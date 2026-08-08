# jw-transcript

A bookmarklet that copies the transcript of a jw.org video to your clipboard as
plain text — one sentence per line — plus a shell function that falls back to
local speech-to-text when a video has no subtitle track.

No video download, no ffmpeg demuxing, no browser extension. Subtitles are
served as standalone WebVTT files; the bookmarklet just finds the right one and
reflows it.

## How it works

1. Determines the video's LANK (its `pub-…_VIDEO` identifier) from the page URL,
   the embedded player markup, or a download link on the page.
2. Queries the public mediator API:
   `https://b.jw-cdn.org/apis/mediator/v1/media-items/{LANG}/{LANK}?clientType=www`
3. If a subtitle URL is present, fetches the VTT, strips cue numbers, timestamps
   and markup, dedupes rollup captions, reflows the fragments into sentences,
   and copies the result.
4. If there's no subtitle track, copies a `jwt '<mp4-url>'` command instead,
   pointed at the smallest available MP4 (the audio track is identical at every
   resolution).

## Install

**Bookmarklet.** Open [`install.html`](install.html) in a browser and drag the
link to your bookmarks bar. Or create a bookmark manually and paste the contents
of [`bookmarklet.js`](bookmarklet.js) as the URL.

**Fallback (optional).** For videos without subtitles:

```sh
brew install pipx && pipx ensurepath
pipx install mlx-whisper          # Apple Silicon; use whisper-ctranslate2 on Intel
```

Then source the shell function from your `~/.zshrc`:

```sh
source ~/path/to/jw-transcript/jwt.sh
```

## Usage

Open a video page on jw.org and click the bookmark.

- **Subtitles available** → transcript on your clipboard, one sentence per line.
- **No subtitles** → a `jwt` command on your clipboard. Paste it into a terminal;
  it downloads the video, runs whisper, and puts the transcript on your clipboard.

`jwt` also works standalone on any URL or local file:

```sh
jwt 'https://cfp2.jw-cdn.org/a/…/ljf_E_010_r240P.mp4'
jwt ~/Movies/talk.mp4
```

Override the whisper model with `JWT_MODEL`:

```sh
JWT_MODEL=mlx-community/whisper-medium.en-mlx jwt <url>
```

## Notes

- **Language.** Uses the `wtlocale` URL parameter when present, the MEPS symbol
  parsed out of an MP4 filename when available, otherwise maps the page's
  `<html lang>` (en→E, es→S, fr→F, de→X, pt→T, it→I). Add more in the `M` map.
- **Sentence reflow.** Caption lines are joined and re-split on sentence-ending
  punctuation. Common abbreviations (`Dr.`, `a.m.`, `e.g.`) and initials are
  shielded so they don't trigger a break. A line ending in a hyphen is treated
  as a split word and joined without a space.
- **Scope.** Must be run from a jw.org page — the Clipboard API needs a focused
  document and a user gesture.
- **Multiple videos on one page.** When the LANK isn't in the URL, the first
  matching MP4 link in DOM order wins.

## Files

| File | |
|---|---|
| `bookmarklet.js` | minified, paste-as-URL build |
| `src/transcript.js` | readable, annotated source |
| `install.html` | drag-to-install page |
| `jwt.sh` | whisper fallback shell function |

## License

MIT
