Prompt: viewer restyle towards Railway's canvas. Folder ~/Projects/tracehound-ui, fresh session. Cosmetic UI change: no decision number, viewer gates only.

Reference files in this folder's root (untracked; read them, never commit them): ref-railway.png is the look to move towards, ref-tracehound.png is the viewer today, tracehound-logo-howl.html is the logo animation.

Steps
0. git fetch, then create branch ui/railway-restyle from origin/main. Save this prompt verbatim as docs/prompts/ui-railway-restyle.md.
1. Taller nodes. Today a node is about four times as wide as it is tall; Railway's are about two to one. Keep the width and raise the height to about half the width. Icon and name sit on the top row, the kind / files / routes line at the bottom, with Railway's padding. Update the node size that the ELK layout and the floating-edge code use, so edges still meet node borders.
2. Canvas surfaces. Sample these colours from ref-railway.png and use them: page background, canvas background, node fill, node border, panel fill, dot colour. Make the dot grid as visible as Railway's. Keep TraceHound's meaning colours unchanged: amber selection, lavender hover highlight, the confidence dash patterns, the change view's green, red and grey. Body text must keep AA contrast.
3. Inspector panel.
   a. Floating: a gap from the top, bottom and right edge like Railway's, rounded corners, a 1px border, and a fill that separates it from the canvas.
   b. Width: about half the viewport on desktop, like Railway. Start from clamp(480px, 50vw, 760px). Update keepInView and anything else that reads the width. The phone sheet stays full screen.
   c. Header like Railway's: the icon without a box, a large name, then the id line. Drop the small title row above it when the breadcrumb has one item. Give sections more padding and space.
   d. Tabs: Env vars becomes its own tab with a count, beside Overview, Files and Connections (and Changes in a change view). Remove it from Overview.
4. Warnings button and popover: the same border and fill treatment as the panel.
5. Model-written label.
   - Inspector: replace the yellow pill and the sparkle with the NVIDIA logo and plain muted text, "Named by Nemotron Nano". Its tooltip carries the full disclosure: "Name written by the model; prose not verified".
   - Wherever a model-written summary is shown, the words "not verified" stay visible beside it.
   - Nodes and lists: replace the sparkle with a small NVIDIA mark with the same tooltip. Every model-written name must still carry a visible mark.
   - Vendor the logo SVG into viewer/public/icons/ and add its source to CREDITS.md. No hotlinking.
6. Logo. Turn tracehound-logo-howl.html into the rail logo component, and the phone header's: the same paths, the howl on hover, click and keyboard focus, never overlapping, reduced motion respected, colour from currentColor. It still links to the default canvas view.
7. Tests. Update the viewer tests these changes break, and add tests for: the Env vars tab; the model-written mark on every model-named node and in the inspector; the logo's reduced-motion path; the node size the layout uses.
8. Gates: the GIT_ environment check from CLAUDE.md prints nothing; viewer tests; typecheck; viewer build. One fix attempt per red gate. If the repo already has a way to take browser screenshots, attach before and after to the PR; if it does not, say so and do not add one.
9. Commit, push, open a PR. Wait until CI for the pushed HEAD has completed.

Rules
- May touch: viewer/, docs/prompts/, CREDITS.md. Nothing in packages/, snapshots/, changesets/ or the harness.
- Never commit the three reference files.
- $0 of Nebius credit. No model calls.
- Do not merge the PR. No destructive git commands.
- No claims beyond what ran: if something could not be checked visually, say so.

STOP AND REPORT: the PR number and CI state; each of items 1–6 as done, partly done or not done; the hex colours chosen and where they came from; the new panel width and node size; tests added and changed; anything done differently and why.

Session note from the user (with the prompt): the Railway reference is railway-1.webp and the TraceHound one is tracehound-1.webp (not the .png names above); tracehound-logo-howl.html is there, and if HTML is not a good fit it should be written in React to match the codebase.
