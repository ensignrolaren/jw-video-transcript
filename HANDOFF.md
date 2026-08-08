# Handoff — jw-transcript

Context brief for continuing this project in a new session. Paste this in (or
point at the repo, which contains it) and pick up from "Open issue" below.

## Who / setup

- Freelance web dev (PHP/WordPress/LEMP). Comfortable with the stack — no need
  to over-explain. Uses `vim`, not `nano`.
- Local machine: **M1 Mac**, zsh, Homebrew Python (PEP 668 — `pip3 install`
  refuses; use `pipx`). `mlx-whisper` installed via pipx and working.
- Repo folder is named **`jw-video-transcript`**, public on GitHub via `gh`.
  (README's example source path still says `jw-transcript` — cosmetic.)
- Prefers one step at a time when later steps depend on earlier results.

## What this is

A bookmarklet that copies a jw.org video's transcript to the clipboard as plain
text, **one sentence per line**, without downloading the video. Falls back to
local whisper transcription when a video has no subtitle track.

Original problem it replaced: extracting subs with `ffmpeg`, which is slow and
fails outright on videos with no sub stream.

## Files

| File | Role |
|---|---|
| `bookmarklet.js` | minified, paste-as-URL build (the artifact that actually runs) |
| `src/transcript.js` | readable annotated source — **same logic, kept in sync by hand** |
| `install.html` | drag-to-install page; embeds *both* of the above in `<script type="text/plain">` blocks (`id="bm"` = minified, `id="src"` = readable) |
| `jwt.sh` | zsh function for the whisper fallback |
| `README.md`, `LICENSE` (MIT), `.gitignore` | |

**Maintenance gotcha:** a logic change must land in three places —
`bookmarklet.js`, `src/transcript.js`, and both embedded copies inside
`install.html`. Worth considering a small build script that generates
`install.html` (and optionally the minified file) from the readable source.

## How it works

1. **Find the LANK** (the `pub-…_VIDEO` / `docid-…_VIDEO` identifier), in order:
   - `?lank=` param, or a `pub-…_VIDEO` match anywhere in the URL (library hash
     URLs and `finder` share links)
   - `[data-video]` embed attribute (`?pub=…&track=…` or `docid`)
   - any `a[href*="jw-cdn.org"]` MP4 filename:
     - `ljf_E_010_r240P.mp4` → `pub-ljf_10_VIDEO` (track de-padded)
     - `mwbv_E_201909_05_r240P.mp4` → `pub-mwbv_201909_5_VIDEO` (issue segment kept)
     - `jwb-072_E_r720P.mp4` → `pub-jwb-072_VIDEO` (no track)
     - the `_E_` segment is the MEPS language symbol → exact locale
   - `a[href*="GETPUBMEDIALINKS"]` → `docid` + `track` + `langwritten`
     (news-release pages; stores these params for step 3)
2. **Mediator API:**
   `https://b.jw-cdn.org/apis/mediator/v1/media-items/{LANG}/{LANK}?clientType=www`
   → `media[0].files[]`, each with optional `subtitles.url`, plus
   `progressiveDownloadURL` and `filesize`.
3. **Pub-media fallback** when mediator returns no files and step 1 captured
   pub-media params:
   `GETPUBMEDIALINKS?output=json&fileformat=MP4&alllangs=0&track=…&langwritten=…&txtCMSLang=…&docid=…`
   → `files[LANG].MP4[]`, normalized to `{subtitles, progressiveDownloadURL, filesize}`.
4. **Subtitles present:** fetch VTT → drop `WEBVTT`, cue numbers, `-->` lines,
   `NOTE`/`STYLE`/`REGION`, strip `<…>` tags, dedupe consecutive identical lines
   (rollup captions) → reflow to sentences → clipboard.
5. **No subtitles:** pick the smallest MP4 (audio is identical at every
   resolution) and copy `jwt '<url>'` to the clipboard instead.

Clipboard writes use `navigator.clipboard.writeText` with an `execCommand`
textarea fallback. Locale defaults: `wtlocale` param → MEPS symbol from filename
or `langwritten` → `<html lang>` map (`en:E, es:S, fr:F, de:X, pt:T, it:I`) → `E`.

## Sentence reflow (most recent feature)

Caption lines are joined into one string (a line ending in `-` joins without a
space, treating it as a split word), whitespace collapsed, then split on
sentence-ending punctuation. Guards:

- Abbreviations shielded by swapping `.` → `\u0001` before the split and back
  after: `Mr|Mrs|Ms|Dr|St|Jr|Sr|Prof|Rev|vs|etc|approx|Fig|No|Vol|Ch|e.g|i.e|a.m|p.m|U.S`
- Initials shielded via `/\b([A-Z])\.(?=\s[A-Z])/` (handles `J. R. R. Brown`)
- Split regex:
  `/(?<=[.!?\u2026]["')\u2019\u201d\]]*)\s+(?=[\u201c"'(\[A-Z0-9])/`
  — keeps closing quotes/brackets attached to the sentence they end
- Alert reports sentence count

## The `jwt` fallback

zsh function in `jwt.sh`, sourced from `~/.zshrc`. Takes a URL or local file,
downloads to a temp dir if needed, runs
`mlx_whisper --model ${JWT_MODEL:-mlx-community/whisper-small.en-mlx}
--output-format txt`, `pbcopy`s the result, cleans up. macOS-specific (pbcopy).

## Open issue — verify this first

This page returned **"No video ID (LANK) found in the URL or on this page"**:

```
https://www.jw.org/en/news/region/global/2026-Governing-Body-Update-5/
```

It's a news-release page: no LANK in the URL, no `data-video`, no direct jw-cdn
MP4 links. Its play/download links are pub-media API calls carrying
`docid=1112024059&track=1&langwritten=E` → LANK `docid-1112024059_1_VIDEO`.

**Status: fix written but NOT yet confirmed by the user in a real browser.** The
`GETPUBMEDIALINKS` detection pass and the pub-media fallback described above
were added in response to it and verified only against mocked fetch responses
(both branches produced correct clipboard output).

If it still fails in the browser, likely causes to check in order:

1. The download links are injected after page load — the bookmarklet runs
   against the DOM at click time and may find nothing. A short retry/poll, or
   reading `docid` from the `choose-language` link (`?docid=1112024059`, present
   in the served HTML but with no track — assume `track=1`), would cover it.
2. The mediator API 404s for that docid LANK and the pub-media fallback isn't
   triggering (fallback only fires when `pm` was populated in step 1).
3. Track number isn't 1 for this item.

Fastest way to diagnose: run the mediator and pub-media URLs above directly and
look at the JSON, and check what `document.querySelectorAll('a[href*="GETPUBMEDIALINKS"]')`
actually returns in the console on that page.

## Ideas not yet done

- Build script so `install.html` is generated rather than hand-synced
- Optional timestamped output mode
- Batch mode: given a category/playlist, pull every transcript
- Linux clipboard support in `jwt.sh` (`xclip` / `wl-copy`)
