#!/usr/bin/env zsh
#
# jwt — download a video and transcribe it locally with whisper.
#
# Used as the fallback when a jw.org video has no subtitle track. The
# bookmarklet copies a ready-to-run `jwt '<mp4-url>' '<title>'` command in
# that case.
#
# Install: source this file from your ~/.zshrc, or paste the function into it.
#
#   source ~/path/to/jw-video-transcript/jwt.sh
#
# Apple Silicon macOS only: it uses mlx-whisper (Metal) and pbcopy. Porting
# means swapping mlx_whisper for another whisper CLI and pbcopy for
# `xclip -selection clipboard` or `wl-copy`.
#
# Requires: curl, python3, mlx-whisper
#
#   pipx install mlx-whisper

# Directory this file lives in, resolved when it is sourced, so the function
# can find reflow.py alongside it. Override with JWT_REFLOW if you keep the
# script somewhere else.
JWT_DIR="${${(%):-%x}:A:h}"

jwt() {
  if [[ -z "$1" ]]; then
    echo "usage: jwt <video-url-or-path> [title]"
    return 1
  fi

  if ! command -v mlx_whisper >/dev/null 2>&1; then
    print -u2 "jwt: mlx_whisper not found. Install it with: pipx install mlx-whisper"
    print -u2 "     (Apple Silicon macOS only — see the README to port it.)"
    return 1
  fi

  local model="${JWT_MODEL:-mlx-community/whisper-small.en-mlx}"
  local reflow="${JWT_REFLOW:-$JWT_DIR/reflow.py}"
  local tmp; tmp=$(mktemp -d)
  local src="$1"
  local title="$2"

  if [[ "$src" == http* ]]; then
    echo "Downloading..."
    curl -sL "$src" -o "$tmp/v.mp4" || { echo "download failed"; rm -rf "$tmp"; return 1; }
    src="$tmp/v.mp4"
  fi

  mlx_whisper "$src" --model "$model" --output-format txt --output-dir "$tmp" || {
    echo "transcription failed"; rm -rf "$tmp"; return 1
  }

  local out; out=$(ls "$tmp"/*.txt 2>/dev/null | head -1)
  if [[ -z "$out" ]]; then
    echo "no transcript produced"; rm -rf "$tmp"; return 1
  fi

  # Whisper wraps its output at segment boundaries, which puts line breaks in
  # the middle of sentences. reflow.py re-joins and re-splits it one sentence
  # per line, matching what the bookmarklet does with a subtitle track, and
  # prepends the title.
  local count=""
  if [[ ! -f "$reflow" ]]; then
    print -u2 ""
    print -u2 "  !!  reflow.py NOT FOUND at: $reflow"
    print -u2 "  !!  Copying RAW whisper output — lines will break mid-sentence"
    print -u2 "  !!  and there will be no title."
    print -u2 "  !!  Fix: export JWT_REFLOW=/path/to/reflow.py"
    print -u2 ""
  elif ! command -v python3 >/dev/null 2>&1; then
    print -u2 ""
    print -u2 "  !!  python3 not found — copying RAW whisper output."
    print -u2 ""
  else
    # reflow.py writes the transcript to stdout and "N sentences" to stderr;
    # swap them so the count lands in $count and the text lands in the file.
    count=$(python3 "$reflow" --title "$title" < "$out" 2>&1 >"$tmp/reflowed.txt")
    out="$tmp/reflowed.txt"
  fi

  pbcopy < "$out" && echo "Transcript copied to clipboard.${count:+ ($count)}"

  rm -rf "$tmp"
}
