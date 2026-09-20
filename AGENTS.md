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

## Never hand-edit

`data/graph.json` and `data/graph.js` are **generated** by `build/build.mjs`
from the five YAML files. Never edit them directly — edit the YAML and
rerun the build. `graph.js` exists only because the page is opened via
`file://`, where both ES modules and `fetch()` of local files are blocked;
it's the same data as `graph.json`, assigned to `window.__GRAPH__`.

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
- Full field contracts (node/edge/citation/project/hierarchy shape,
  `preview`, the `url`/`url_label` rules) are in `SCHEMA.md` — don't guess a
  field name, look it up there.

## The tier system

1 = primary document in `evidence/`. 2 = a party's own statement. 3 = open
question (requires `resolves`, saying what would settle it). 4 = something
the record expressly declines to claim — lives only in `non-claims.yaml`,
never drawn. Getting a tier right matters as much as getting a citation
right; don't default to tier 1 to avoid the tier-3 `resolves` requirement.

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

Prose in `README.md`, `SCHEMA.md`, panel text, and commit messages is
deliberate and precise — plain declarative sentences, no marketing voice,
willing to say what the record does *not* establish as clearly as what it
does. Match it: don't round an unresolved reading up to a claim, and don't
add hedging where a document actually settles the point.
