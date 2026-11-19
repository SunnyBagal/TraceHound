# Vendor research of 14 Nov 2026 (Fable 5.2, cloud session)

Two files, copied byte for byte from that session's scratch folder on 19 Nov; they were never committed before.

| file | what it is | sha256 (first 16) |
|---|---|---|
| `vendor-research-pass1.md` | first pass: how the reviewers work, benchmarks, techniques, numbered source list (sources 1–31) | `5208ede842882e23` |
| `vendor-verification-pass2.md` | second pass: **the verification table** (section A), each claim re-graded D / I / M against its source | `50c3affb5d477bad` |

How to read the grades in section A:
- **D** (documented) only where the source page or file was actually read: PR-Agent's code at `1b19ab2`, Anthropic's
  review prompt, `claude.com/blog/code-review`, `claude.com/customers/greptile`, Google Cloud's CodeRabbit post,
  Martian's README and ReviewBench's `docs/METHODOLOGY.md`.
- Every claim whose host was blocked in that session (coderabbit.ai, greptile.com, cursor.com, augmentcode.com,
  github.blog, docs.github.com, graphite.com and others) is **I**: read only as search excerpts. None of those is D.
- The web pages were read through a fetch tool that summarises them, so a quoted phrase is "as summarised", not a raw
  quote. PR-Agent's code and the files fetched from raw.githubusercontent.com were read directly.
- Later sessions may have verified more (the 16 Nov audit reports Cursor's own post for Bugbot's launch-design passes);
  those verifications are not in this table.
