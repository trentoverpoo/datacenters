# Agent notes

This is an investigative map of entities, land and litigation around three
data-center sites (Marshfield, Springfield, Benton County/Warsaw), published
as a static, dependency-free site. Read `README.md` and `SCHEMA.md` before
touching anything — they are the real spec and this file does not repeat
their detail, only the operating rules an agent needs.

## The one rule that matters

**Every node, edge and development must cite a document, and the build fails
— not warns — if it doesn't.** That's not a lint preference, it's the whole
premise of the project: no line on the map without a document behind it. Any
change to `data/*.yaml` is only done when you can also run the build and see
it pass.

```sh
node build/build.mjs
```

No install step, no `package.json` — `js-yaml` is vendored at
`build/vendor/js-yaml.js`. If the command fails, it names the file and field;
fix that, don't work around it.

`README.md` pastes that output verbatim, counts included, as its picture of a
passing build. Anything that moves one of those numbers — a citation, a document,
an edge — means refreshing that block in the same commit, or the README states a
total the build disagrees with.

## Never hand-edit

`data/graph.json` and `data/graph.js` are **generated** by `build/build.mjs`
from the six YAML files, `panels.yaml` included. Never edit them directly —
edit the YAML and rerun the build. `graph.js` exists only because the page
is opened via `file://`, where both ES modules and `fetch()` of local files
are blocked; it's the same data as `graph.json`, assigned to
`window.__GRAPH__`.

**This applies to `panels.yaml` too, and it's the file an agent is most
likely to forget it for.** It reads like static copy — dialog text, not
"graph data" — but the page never reads it: the browser only ever fetches
`graph.js`/`graph.json`, which embed a compiled copy of every panel. Editing
`data/panels.yaml` and stopping there changes nothing a reader sees; the old
panel text ships until `node build/build.mjs` runs again and rewrites
`graph.json`/`graph.js` with the new copy. Any edit to panel text — the
Terms of use, Privacy, tipline, shortcuts, the consent or mobile notes — is
only done when the build has also been re-run and its output committed
alongside the YAML change.

## Line endings, before you script an edit

`entities.yaml`, `relationships.yaml`, `non-claims.yaml`, `panels.yaml` and
`taxonomy.yaml` are stored **CRLF**. `developments.yaml` and everything outside
`data/` are LF. `entities.yaml` is mixed — 36 of its lines are bare LF. There is
no `.gitattributes`, so nothing normalises any of this on the way in or out, and
the mix is not worth tidying: it would be one commit touching every line of the
file.

Read one of those files and write it back through anything that normalises
newlines — Python's text mode is the easy way to do it by accident — and every
line in the file changes. The build still passes, and the diff is four thousand
lines of nothing with the six you meant buried in it. Work in binary and keep
the endings you found:

```py
b = open(path, 'rb').read()
b = b.replace(old.encode(), new.encode())   # CRLF inside old and new
open(path, 'wb').write(b)
```

`git diff --stat` is the check after any scripted edit. If the line count is far
larger than what you changed, the file has been normalised. Restore it with
`git checkout HEAD -- <file>` and go again rather than committing it.

## Where things live

- `data/entities.yaml` — nodes. `data/relationships.yaml` — edges.
  `data/non-claims.yaml` — tier 4, text only, never geometry.
  `data/developments.yaml` — "Recent developments," written as events, not
  a filing list. `data/panels.yaml` — every dialog's words (not the JS).
  `data/taxonomy.yaml` — categories, connection types, the three `projects`
  (Marshfield/Springfield/Benton), and the opening `hierarchy` (bands/rows).
- `evidence/` — the source documents, numbered by site/subject
  (`01-marshfield-site`, `02-springfield-site`, `03-entities`,
  `04-litigation`, `05-sunshine-requests`, `06-benton-county-site`).
  Filenames are `YYYY-MM-DD_identifier_short-description.ext`. A citation's
  `doc` path is checked against the filesystem at build time — get the path
  exactly right.
- `js/` — plain classic scripts sharing a `MAP` global (no modules, no
  bundler). `css/style.css`.
- `img/avatars/` — portraits, pointed at by a person node's `image`, and company
  logos, pointed at by an organisation's `logo` (with `logo_on: light|dark`,
  which the build requires). Both are drawn in the glyph and at the head of the
  node's panel. Neither is evidence and neither is ever cited. A person with no
  portrait wears the blank avatar, which is a gap in what we have and not a fact
  about them; an organisation with no logo gets **no** stand-in at all, because
  a company nobody has the wordmark of is not a company we know less about. A
  glyph can also carry a photograph of the thing itself — the Marshfield site
  wears the birds-eye aerial — and that one *is* evidence: it lives in
  `evidence/`, and it is named by `glyph: true` on the node's own citation
  rather than by a field on the node, because a picture of the ground is a
  claim about it.
- A saved news article is evidence like any other document and lives in a
  `press/` folder beside the records it concerns — `04-litigation/<case>/press/`
  for a report of a hearing, `03-entities/<company>/press/` for one about a
  company. Capture it as a file; a report that exists here only as a link is a
  claim resting on a page that can change.
- Full field contracts (node/edge/citation/project/hierarchy shape,
  `preview`, the `url`/`url_label` rules) are in `SCHEMA.md` — don't guess a
  field name, look it up there.

## The tier system

1 = primary document in `evidence/`. 2 = a party's own statement. 3 = open
question (requires `resolves`, saying what would settle it). 4 = something
the record expressly declines to claim — lives only in `non-claims.yaml`,
never drawn. Getting a tier right matters as much as getting a citation
right; don't default to tier 1 to avoid the tier-3 `resolves` requirement.

**Reporting is not automatically tier 1.** An article recording a party speaking
on the record — testimony, a hearing, a public appearance — supports a **tier 2**
line, because what it establishes is that the party said it, and tier 2 is the
tier for a party's own account. An article reporting a fact the outlet went and
checked for itself can carry tier 1, as the EdgeIR piece on the Compass Quantum
acquisition does. Say whose account it is in the prose — "per KY3", "the county's
own minutes call him" — rather than fencing it off in a `caveat`. A `caveat` is
for what the record does not establish, not for a source we trust.

## Projects (the three builds)

An edge must declare which of the three site builds it belongs to via
`projects` (or `all`). A node's own membership is *derived* — the union of
its edges' projects — so `entities.yaml` never carries a `projects` field,
and an entity with no tagged connection fails the build. Don't add a
`projects` key to a node.

## Adding to the map — order of operations

1. Node → `entities.yaml` (category, tier, summary, ≥1 citation with an
   `excerpt`, not just a path).
2. Edges → `relationships.yaml` (`projects`, tier, `resolves` if tier 3).
3. A seat in `hierarchy` in `taxonomy.yaml` (band + row position).
4. `node build/build.mjs`. Fix whatever it names.

Adding a development follows the same evidence discipline — see the "Adding
a recent development" section of `README.md`. There's no `caveat` field on
a development; unresolved details go in `detail`, in plain words.

## Looking at the map

Some changes can only be checked by looking — a glyph, a layout, a theme. Open
`index.html` over `file://`; there is no server to start and nothing to build
but `build/build.mjs`.

**Two notes open over the map on a first visit** and will otherwise be what a
screenshot catches: the consent note, and on a narrow window the small-screen
note. Both are modal, so clicking through them is not an option — set what they
record before the page loads rather than trying to dismiss them afterwards:

```js
await context.addInitScript(() => {
  try {
    localStorage.setItem('map-consent', '1');      // the terms-of-use note
    localStorage.setItem('map-mobile-note', '1');  // the small-screen note
  } catch {}
});
```

Those two keys are `CONSENT_KEY` and `NOTE_KEY` in `js/ui.js` — read them from
there rather than trusting this file. Suppressing a note for a screenshot is
for looking at the map underneath it; the notes themselves are content, and
neither the page nor these keys are a thing to change to make a screenshot
easier.

The renderer is a canvas, so nothing in it is a DOM node to query or click by
selector. `window.MAP.view` is the live `GraphView`: `view.nodes` (each with
`x`, `y`, `radius`), `view.camera` (`x`, `y`, `k`) and `view.draw()` are enough
to put a given node in the middle of the frame at a chosen zoom, and
`rect.left + n.x * k + camera.x` is where to click it. Check a glyph at more
than one `k` — art below `ART_MIN_PX` screen pixels of radius is dropped on
purpose — and in both themes, which the **Light**/**Dark** button in the
toolbar switches.

Do not add a browser dependency to this repository: it has no `package.json`
and is meant to keep working with nothing installed. Install Playwright in a
scratch directory outside the tree, and point it at the Chromium the
environment already has rather than downloading one.

## On `context.md` and the "old repo"

Earlier in this project's life there was a separate repo containing
`REPORT.md`, `METHOD.md`, `OPEN-QUESTIONS.md`, and (per commit `722c358`)
per-file context notes for evidence documents. Those were deliberately not
migrated when this repo split off — only the evidence files the build
actually cites were brought over. They do not exist anywhere in this
repo's history. If a task calls for that older context, it has to be
pulled from the old repo, not reconstructed here.

## House style

An `excerpt` is verbatim, but it needn't be contiguous: the convention here is
several exact fragments in one citation, joined by ` … `. One document gets one
citation per node, edge or entry — not one citation per line you want to quote.
Typography is this repo's and not the source's: straight quotes and apostrophes
throughout, em dashes for asides, even where the original prints curly quotes.

Prose in `README.md`, `SCHEMA.md`, panel text, and commit messages is
deliberate and precise — plain declarative sentences, no marketing voice,
willing to say what the record does *not* establish as clearly as what it
does. Match it: don't round an unresolved reading up to a claim, and don't
add hedging where a document actually settles the point.
