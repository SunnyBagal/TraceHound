Prompt: TraceHound landing page. Folder ~/Projects/tracehound-ui, fresh session. Viewer UI only: no decision number, viewer gates only. No model calls, $0 of Nebius credit.

Reference file in this folder's root (untracked): hero-source.(png|jpg|webp), the hero background. If it is missing, STOP.

Steps
0. git fetch, then create branch ui/landing-page from origin/main. Save this prompt verbatim as docs/prompts/ui-landing-page.md.

1. Routes.
   - The landing page is "/". The graph viewer moves to "/graph".
   - Old links must keep working: "/" opened with ?repo=, ?changes= or ?impact= goes to /graph with the same query, without showing the landing page first.
   - The viewer's logo link and every internal link point at /graph. Respect NEXT_PUBLIC_BASE_PATH. The build stays a static export.
   - If a simpler approach meets these requirements, use it and say so in the report.

2. Layout. One content column, max-width 1200px, centred, with side gutters of clamp(20px, 5vw, 64px). The nav, the hero content and every section share the same left and right edges. Nothing but the hero image may extend past the column.

3. Type. Bricolage Grotesque for headlines and body, JetBrains Mono for file paths, line numbers and counts. Load both with next/font/google so they are self-hosted at build with no runtime request to Google. Add both to CREDITS.md with their licences.

4. Nav, inside the column: the wordmark on the left; links How it works, Agents, Roadmap, GitHub (https://github.com/SunnyBagal/TraceHound). No sign-in link.

5. Hero.
   - Background: the hero image, optimised into viewer/public/landing/ (AVIF or WebP, 300 KB or less at 1920px wide, plus a smaller size for phones). Use a tool already installed; do not add a dependency. If you cannot get under 300 KB, say so in the report.
   - Order, centred: the animated wolf logo, then the headline, then two buttons.
   - Logo: the existing Logo component at about 96px, dark ink via currentColor. It howls once on load, then on hover, click and keyboard focus. Reduced motion: no howl.
   - Headline, in black (#0b0a10): "Understand your code. Fix what breaks."
   - Buttons: "Get started" goes to /graph. "Agents" scrolls to the Agents section.
   - Measure the contrast of the headline against the image area behind it. If it is under 4.5:1, add a light veil behind the text block. Do not change the text colour.

6. Section "Understand what agents write." on the app's existing dark palette from globals.css, like every section below the hero.
   - Headline in the largest, heaviest type on the page: "Understand what agents write."
   - Second line, as large: "Don't read 2,040 lines. Read 8." with 2,040 struck through. The strike draws itself when the line scrolls into view.
   - Caption in mono: "Recall commit 7943212 · 15 files · 1,913 added, 127 removed → 3 declarations added, 5 modified, 1 new edge". Before using it, confirm the declaration and edge counts against changesets/recall-7943212.json (stats.declarations, stats.edges). The line counts come from `git show --shortstat 7943212` in the public Recall repo. If the changeset disagrees, STOP.
   - The caption links to /graph?changes=recall-7943212.

7. Three SVG animation components under viewer/components/landing/. Inline SVG, animated with CSS or the Web Animations API. No animation library, no video, no canvas, no Lottie.
   a. Diff to declarations: a tall column of diff lines collapses into 8 declaration rows, which then light up their components on a small graph. Use the real declaration names from changesets/recall-7943212.json.
   b. Repo to graph: files become facts, facts become component nodes, and edges draw one at a time, each with a mono label of the form file:line. Use real component names and real evidence from the committed Recall snapshot.
   c. Pipeline: find, reproduce, repair, verify. Show a rule emitting a hypothesis, one failing test being written, a patch, then the test passing in a sandbox with the network off.
   Each plays once when it scrolls into view and can be replayed by clicking it. Reduced motion: show the final frame, static. Each needs a text alternative that says what the animation shows.

8. Section "Agents". One row per item: its name, what it does in one sentence, the model it runs on or "no model". Source every row from README.md, docs/decisions.md or docs/eval/. Expected rows: analyzer, namer, finder, reproduce stage, repair agent. Then the models, with their exact ids from the code, and the held-out results taken from docs/eval/heldout-results.md, including the graph-on against graph-off numbers as measured.

9. Section "Roadmap". Items marked "Planned", none presented as shipped: connect a GitHub repo; live code workings (the graph shows the running system from real events); the findings pipeline through to a pull request; Nebius sandboxes as a second provider. Cut any item that the repo shows as already shipped, and say which.

10. Footer: the GitHub link and the licence. Nothing else.

11. Tests. Update the viewer tests the route change breaks. Add tests for: "/" renders the landing page; an old-style query on "/" reaches the viewer; "Get started" points at /graph; each animation renders its static final frame under reduced motion; the strikethrough caption's numbers equal the changeset's stats.

12. Gates: the GIT_ environment check from CLAUDE.md prints nothing; viewer tests; typecheck; viewer build. One fix attempt per red gate.

13. Start the dev server and STOP AND REPORT. Do not commit, push or open a PR until the owner has looked at the page and says to.

Copy rules
- Every sentence states a fact or names an action. No adjectives such as powerful, seamless, smart, modern or next-generation.
- No summaries, taglines under headings, testimonials, customer logos, pricing or newsletter form.
- No number that is not in the repo. Every number on the page has a source path in your report.
- Nothing presented as working unless the repo shows it working.
- No finder results on Recall, and nothing about bugs in Recall.

Design rules
- Take only the column margins from Railway's site. Do not copy its artwork, wordmark, headline, typeface, nav labels or dashboard.
- Colours come from the tokens in globals.css. New tokens go there with a comment.
- Body text at AA contrast on every surface. Fully usable by keyboard. No layout shift when fonts or the hero image load.
- Phone widths from 360px: no horizontal scroll, and the animations stay legible.

Rules
- May touch: viewer/, docs/prompts/, CREDITS.md. Nothing in packages/, snapshots/, changesets/, impacts/ or the harness.
- No new runtime dependencies. Never commit hero-source.* or AGENTS.md.
- Do not open ~/Projects/tracehound-ops, ~/Projects/tracehound-heldout, ~/Projects/TraceHound-eval or ~/Projects/Recall.
- No destructive git commands. Do not merge.
- No claims beyond what ran. If something could not be checked visually, say so.

STOP AND REPORT:
- the dev server URL;
- each of steps 1–10 as done, partly done or not done;
- how old links are handled;
- the hero image's final format and size, and the measured headline contrast;
- every number on the page with its source path;
- every Agents and Roadmap row with its source, and anything you cut;
- tests added and changed, and the result of each gate;
- anything done differently and why.
