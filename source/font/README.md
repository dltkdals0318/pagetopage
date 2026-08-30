# Fonts

## 윤고딕330 / 윤고딕340 — subset for the site

`윤고딕330.ttf` and `윤고딕340.ttf` are the full master files (~1.9–2MB each,
full modern Hangul + hanja coverage). The site does **not** load these
directly — `style.css` loads `윤고딕330-subset.woff2` /
`윤고딕340-subset.woff2` instead, which contain only the Korean-range
characters that actually appear in `index.html` (~488 characters, ~27–28KB
each vs. ~1.9MB). That's where nearly all of the page's original weight was
coming from.

> **The two masters are local-only** — `.gitignore`d, not tracked, not
> deployed (~3.9MB saved from the repo/Pages tree). They are needed **only**
> to regenerate the subsets. If they're missing (fresh clone, another
> machine), put `윤고딕330.ttf` / `윤고딕340.ttf` back in this folder before
> running the steps below. The committed `*-subset.woff2` files are all the
> site itself needs.

**If you add new Korean text and a character silently falls back to the
system font (looks visibly different / not the site's font):** it's missing
from the subset. Regenerate both subset files from the repo root:

```bash
pip install fonttools brotli   # brotli needed for --flavor=woff2

python3 - <<'PY'
import re, html
with open("index.html", encoding="utf-8") as f:
    text = re.sub(r"<[^>]+>", " ", f.read())
text = html.unescape(text)
korean_ranges = [
    (0xAC00,0xD7A3),(0x1100,0x11FF),(0x3130,0x318F),(0x3000,0x3009),
    (0x300C,0x303F),(0x25A0,0x25CA),(0x25CC,0x25FF),(0x3300,0x33FF),(0x4E00,0x9FFF),
]
chars = sorted(set(c for c in text if any(lo <= ord(c) <= hi for lo, hi in korean_ranges)))
with open("source/font/korean_chars_used.txt", "w", encoding="utf-8") as f:
    f.write("".join(chars))
print(len(chars), "characters")
PY

pyftsubset source/font/윤고딕330.ttf \
  --text-file=source/font/korean_chars_used.txt \
  --output-file=source/font/윤고딕330-subset.woff2 --flavor=woff2

pyftsubset source/font/윤고딕340.ttf \
  --text-file=source/font/korean_chars_used.txt \
  --output-file=source/font/윤고딕340-subset.woff2 --flavor=woff2
```

After regenerating, **bump the `?v=YYYYMMDD` query string** on both
`*-subset.woff2` URLs in `style.css`. The filenames never change, so without
a new version string browsers keep serving the old cached font and any newly
added characters silently fall back to the system font (this is exactly the
bug where `랑` / `뷰` / `렛` rendered in the wrong font in Chrome).

**Why not just always ship the full 330/340.ttf as a safety net?** A
`@font-face`'s `src` list picks one source by format support, not per
missing-glyph — listing both wouldn't give automatic fallback, so there's no
free way to keep both "always correct" and "small." Re-running the subset
above whenever copy changes is the tradeoff we took for the ~3.7MB saved on
every page load.

Note: the two `.ttf` masters had a corrupted trailing `loca` table entry
(harmless in browsers, but breaks strict font tooling like fontTools) —
fixed in place, same glyph data.
