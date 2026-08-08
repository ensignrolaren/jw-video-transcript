#!/usr/bin/env zsh
#
# jwt — download a video and transcribe it locally with whisper.
#
# Used as the fallback when a jw.org video has no subtitle track. The
# bookmarklet copies a ready-to-run `jwt '<mp4-url>'` command in that case.
#
# Install: source this file from your ~/.zshrc, or paste the function into it.
#
#   source ~/path/to/jw-transcript/jwt.sh
#
# Requires: curl, and mlx-whisper (Apple Silicon) or whisper-ctranslate2 (Intel).
#
#   pipx install mlx-whisper
#
# macOS only as written — it uses pbcopy. On Linux swap pbcopy for
# `xclip -selection clipboard` or `wl-copy`.

jwt() {
  if [[ -z "$1" ]]; then
    echo "usage: jwt <video-url-or-path>"
    return 1
  fi

  local model="${JWT_MODEL:-mlx-community/whisper-small.en-mlx}"
  local tmp; tmp=$(mktemp -d)
  local src="$1"

  if [[ "$src" == http* ]]; then
    echo "Downloading..."
    curl -sL "$src" -o "$tmp/v.mp4" || { echo "download failed"; rm -rf "$tmp"; return 1; }
    src="$tmp/v.mp4"
  fi

  mlx_whisper "$src" --model "$model" --output-format txt --output-dir "$tmp" || {
    echo "transcription failed"; rm -rf "$tmp"; return 1
  }

  local out; out=$(ls "$tmp"/*.txt 2>/dev/null | head -1)
  if [[ -n "$out" ]]; then
    pbcopy < "$out" && echo "Transcript copied to clipboard."
  else
    echo "no transcript produced"
  fi

  rm -rf "$tmp"
}
