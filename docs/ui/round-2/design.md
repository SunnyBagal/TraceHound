# Reviews dashboard design

Use the existing Railway-style palette: page `#13111b`, panel `#17161f`, text `#e6ebf5`, muted `#a6b1c8`, amber action `#f5a524`, and lavender focus `#c4b5fd`. Existing green/red diff tokens communicate added/removed code with written Before/After labels. Keep the existing system UI and mono families, 14px minimum body copy, and relaxed line height.

The PR list is a left-aligned review inbox: a compact product navigation, repository form, then rows containing the real PR number, title, state and footer counts. The detail page gives each finding a file/line heading, model disclosure, readable comment, source label and a Before/After fix diff. GitHub owns the commit action; this static dashboard only links to the discussion in Files.

```text
TraceHound    Reviews   Graph   Benchmark
Reviews                              owner/repo [Open]
Pull request                         State    Findings   Suggestions
#3  Real PR title                    Open        1           1

Reviews / #3   Real PR title
file:line                            Source: both
model-generated, not tested
Finding text
Before                               After · suggestion
original code                        replacement code
                              [Commit fix on GitHub]
```

The memorable element is the actual fix diff. Avoid decorative metric cards, new colours or a new type scale. Status, source and validation state stay explicit in words. Preserve graceful loading, empty, missing-footer and rate-limit states. Benchmark pages contain static aggregate tables only, with the source and study limits beside them. No review text or per-PR benchmark data is read or copied.
