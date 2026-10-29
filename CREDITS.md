# Credits

Third-party assets the viewer ships. Libraries are credited in the README (Credits); the
technology icons and logos are listed in `viewer/public/icons/CREDITS.md`.

## Fonts (landing page)

Both are loaded with `next/font/google` (`viewer/components/landing/fonts.ts`): the files are
downloaded at build time and served with the site, so the browser never requests Google.

| Font | Use | Designer | Licence | Source |
| --- | --- | --- | --- | --- |
| Bricolage Grotesque | headlines and body | Mathieu Triay | SIL Open Font License 1.1 | https://fonts.google.com/specimen/Bricolage+Grotesque · https://github.com/ateliertriay/bricolage |
| JetBrains Mono | file paths, line numbers, counts | JetBrains (Philipp Nurullin, Konstantin Bulenkov) | SIL Open Font License 1.1 | https://fonts.google.com/specimen/JetBrains+Mono · https://github.com/JetBrains/JetBrainsMono |

## Trademarks (landing hero)

Logos are trademarks of their owners and are used only to name the coding agents whose pull requests TraceHound reviews. No affiliation or endorsement.

The same line sits under the hero (`viewer/components/landing/Hero.tsx`). Marks shown, in hero order
(files and sources in `viewer/public/icons/CREDITS.md`):

- NVIDIA (on the black wolf: TraceHound runs on NVIDIA Nemotron)
- Claude
- ChatGPT (OpenAI)
- Google Antigravity
- OpenCode
- Cursor

## Images
- `viewer/public/wolves-cutout.webp` (beside Limits on /benchmark): an image supplied by the owner, background removed with rembg (isnet-general-use).
