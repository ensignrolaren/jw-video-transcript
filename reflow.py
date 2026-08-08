#!/usr/bin/env python3
"""Reflow a transcript into one sentence per line.

Reads text on stdin, writes the reflowed text on stdout.

This mirrors the sentence splitting the bookmarklet does for VTT subtitles,
so that whisper output and subtitle output come out in the same shape. The
two implementations have to be kept in step by hand (JS runs in the browser,
this runs in the shell) — see the reflow section of transcript.js.

  ... | reflow.py --title "Video Title"

Standalone, to re-flow a transcript you already have:

  pbpaste | reflow.py --title "Video Title" | pbcopy
"""

import argparse
import re
import sys

# Periods that end an abbreviation, not a sentence.
ABBREV = (r"Mr|Mrs|Ms|Dr|St|Jr|Sr|Prof|Rev|vs|etc|approx"
          r"|Fig|No|Vol|Ch|e\.g|i\.e|a\.m|p\.m|U\.S")

# Placeholder swapped in for a shielded "." and swapped back after splitting.
SHIELD = ""

# Break after . ! ? … plus any closing quote/bracket, when the next character
# starts a new sentence. Fixed-length lookbehind, so this stays valid for
# Python's re — the JS version uses a variable-length one, which Python's re
# does not support.
SPLIT = re.compile(
    r'(?<=[.!?…])'                    # sentence-ending punctuation
    r'(["\'\)’”\]]*)'            # keep closing quotes/brackets attached
    r'\s+'
    r'(?=[“"\'\(\[A-Z0-9])'           # next sentence opens here
)


def clean_title(title):
    """Strip zero-width characters and collapse whitespace."""
    title = re.sub(r"[​-‍﻿]", "", title)
    return re.sub(r"\s+", " ", title).strip()


def reflow(text):
    """Return a list of sentences, one per element."""
    # Join the wrapped lines back into a single string. A line ending in a
    # hyphen is a word split across the break, so join it without a space.
    joined = ""
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if not joined:
            joined = line
        elif joined.endswith("-"):
            joined += line
        else:
            joined += " " + line

    joined = re.sub(r"\s+", " ", joined).strip()
    if not joined:
        return []

    # Shield abbreviation periods, then initials such as "J. R. R. Brown".
    joined = re.sub(r"\b(" + ABBREV + r")\.(?=\s)",
                    lambda m: m.group(0).replace(".", SHIELD),
                    joined,
                    flags=re.IGNORECASE)
    joined = re.sub(r"\b([A-Z])\.(?=\s[A-Z])", r"\1" + SHIELD, joined)

    marked = SPLIT.sub(r"\1\n", joined)

    return [s.replace(SHIELD, ".").strip()
            for s in marked.split("\n")
            if s.strip()]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--title", default="",
                    help="video title, emitted as the first line")
    args = ap.parse_args()

    sentences = reflow(sys.stdin.read())

    title = clean_title(args.title)
    out = (title + "\n\n" if title else "") + "\n".join(sentences)
    sys.stdout.write(out + "\n")

    print("%d sentences" % len(sentences), file=sys.stderr)


if __name__ == "__main__":
    main()
