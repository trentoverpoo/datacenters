# The interactive map

A node-and-edge map of the entities, people, land and proceedings on record
here — pannable, zoomable, filterable, searchable, and traceable to a document
at every point.

**Open `index.html`.** Double-clicking it from disk works — no server, no build
step, no network. Canvas rendering, plain classic scripts, no dependencies.

That constraint is why the code looks the way it does. Browsers block **both** ES
module loading and `fetch()` of a local file under `file://`, so the page uses
neither: the graph ships as `data/graph.js`, a plain script that assigns
`window.__GRAPH__`, and the app files are classic scripts sharing a `MAP` global.
`data/graph.json` is emitted alongside it for anything else that wants the data.

Serving it works identically, if you'd rather:

```sh
python3 -m http.server 8000     # then open http://localhost:8000/
```

---

## The rule this map is built around

**Every node and every edge cites a document.** That is enforced mechanically, not
by good intentions: `build/build.mjs` fails the build — it does not warn — if any
citation points at a file absent from this repository, if any node or edge carries
no citation, or if a tier-3 edge does not say what would resolve it.

```sh
node build/build.mjs
```

```
  data/graph.json and graph.js written

  95 nodes   T1 90 · T2 4 · T3 1
  135 edges   T1 116 · T2 15 · T3 4
  marshfield   52 entities   67 connections
  springfield  18 entities   24 connections
  benton       43 entities   55 connections

  5 recent developments, hand-curated

  108 distinct documents cited, all present on disk
  53 of 379 citations also carry a live url
```

Edit the YAML, re-run, reload. `graph.json` and `graph.js` are both generated —
never hand-edit either.

## The archived source, and the live one

A good part of this file was captured from the web: a LinkedIn profile printed to
PDF, a screenshot of a company page, a saved article, a filing index. The capture
is the evidence — it is the source as it stood on the day it was gathered, and no
later edit to the page can move a claim that rests on it. It is also, on its own,
unverifiable: a reader has only this repository's word that the page said what the
PDF says it said.

So a citation may carry a **live url** as well, and the panels and the Sources page
show both. The archived file is what the claim rests on; the link marked **Live**
is where the same source can be read today, and it is the half that can move,
change or vanish. Neither substitutes for the other, and the build will not let a
`url` stand in a citation that has no `doc` or `external` beside it.

A live url is given only where the public page genuinely carries the same record —
a profile, the article as published, an SEC filing index, an agency's own permit
record. It is **not** given for sources that exist only behind a session-bound or
search-only portal: Missouri's business and UCC search, Case.net, the county
recorders, the county GIS viewers. A link to an empty search box verifies nothing,
and those records reach the reader as the certified and downloaded copies in
`evidence/`, which is why they were collected that way.

See [`SCHEMA.md`](SCHEMA.md) § "The live url" for the field contract.

## How well established

The tiers are the standard every line here is held to.

| | | Drawn as |
|---|---|---|
| **1** | Stated in a primary document in `evidence/` | Solid line |
| **2** | A party's own statement, or externally verified from a named public source | Solid, lighter |
| **3** | An open question or unresolved reading the file tracks but does not settle | Dashed, muted, and it says what would resolve it |
| **4** | Something the record expressly declines to claim | **Never drawn.** Text only, in "Not claimed" |

Tier 4 is the important one. A line on a map is an assertion; a paragraph is not.
The readings the record does not support live in `data/non-claims.yaml` and reach
the screen as prose, where they cannot be mistaken for findings.

One consequence is worth stating plainly, because it is a choice, not an
oversight:

- **No edge is drawn for the Marshfield power agreement.** The developer states he
  secured one before buying the land. No agreement and no counterparty appears
  anywhere in this file, so drawing a line to any utility would invent the single
  fact the record is missing. The Sho-Me relationship is drawn as *parcel
  adjacency*, which is what the surveys actually establish.

## Reading the map

**Colour** is one of three hues plus a neutral, grouping entities into people and
the vehicles they form, operating businesses and infrastructure, public bodies and
proceedings, and land. **Shape and fill** carry the nine categories within those
groups, so no category is identified by colour alone — the hues clear the
colour-vision and normal-vision separation gates in both light and dark mode, and
shape keeps the map legible if they did not.

**The map opens on a fixed hierarchy, already settled.** Nothing drifts into
place: the arrangement is computed before the first frame is painted, so the
page is readable the moment it appears. It reads top to bottom —

| | |
|---|---|
| **The three data centers** | Marshfield, Springfield and Warsaw, each named above its address, because the addresses are what the record uses and not what anyone would recognise |
| **Principals** | the people the record shows directing the projects |
| **Control and holding vehicles** | what those people manage or hold through |
| **Entities holding title** | the single-purpose entities named as owner on the deeds and permits |
| **Grantors, earlier vehicles and the people behind them** | where the land came from, and who signed for it |
| **Counterparties, lenders and professional services** | equipment, money and paperwork |
| **Public bodies, proceedings, utilities and adjacent land** | who has taken a position, and the ground next door |

The bands are authored in [`data/taxonomy.yaml`](data/taxonomy.yaml), because
which rung an entity stands on is a reading of the record and not something the
edge list knows. **The build fails if an entity is placed twice or left out** —
the same mechanical check that keeps the citations honest, applied to the thing
a reader sees first. Within its course each name then settles towards the
average position of whatever it connects to, which is what puts a grantor under
the entity it conveyed to.

**Every entity is named in that frame.** The layout reserves the space each name
needs, so the opening view is the readable one — no zooming in, no dragging
nodes out of each other's way. A name may cross a connection, because a line
still reads under text; it never sits on another node. A ladder is a less
economical shape than a web, so on a window narrower than about 1700 pixels it
is larger than the stage and the opening frame scales down to fit it — the map
pans and zooms, and past a certain smallness only the hubs keep a name.

**On a portrait screen the ladder folds.** Eleven long courses laid across a
phone would frame as a band through the middle with the screen empty above and
below, so a course longer than the width continues on the line beneath it. The
authored order is untouched — the course turns the corner, and keeps its band.
Where it folds is not a guess: the layout measures the candidate widths and
takes whichever one leaves the map drawn largest. A landscape screen of any
size, desktop to phone-on-its-side, frames the ladder exactly as it always has.

**Nothing moves on its own.** Clicking a node selects it; dragging one moves
that node and no other. An arrangement made by hand is therefore an arrangement
that survives the next thing you pick up, and a window resize.

**Time** is layered rather than imposed as an axis:

- every node carries an **age ring**, shaded light-to-bright by its earliest
  documented date, on an achromatic scale that never competes with category colour;
- anything the record dates inside **the last thirty days** carries a soft halo, a
  **NEW** chip and its name in full ink — and the more recent the entry, the
  stronger the halo, so the newest thing on the file reads as the newest thing on
  the file;
- **Recent developments**, in the sidebar, says what has actually happened lately —
  which is a different question, and not one a date can answer;
- the **scrubber** ghosts what had not yet happened, holding positions stable so the
  web does not rearrange underneath you — press play to watch it assemble from 1996
  to September 2026.

The halo is measured against the reader's own clock, not against the day the map
was last built, and the **Time** panel under **Filters** says how many entities are
inside the window, and says plainly when none are. That is the point of doing it
that way: a month in which nothing was filed is an answer this page can give, and
a banner left burning over the last thing anyone happened to add is not. Only a
date the record carries **to the day** counts — an entity the file dates to a month
or a year is not one it dates to a Tuesday, and lighting it up would claim a
precision the record does not have.

The width of the window is one constant, `RECENT_DAYS` in `js/shapes.js`, and
every phrase the page says about it is derived from that constant rather than
written out beside it.

## Recent developments

The halo answers *what was filed lately*. It cannot answer *what happened lately*,
and for a while the sidebar asked it to: a list of whatever the record dated inside
the window, newest first, which is how a notary and a law firm came to head the page
because a deed they had touched was recorded. The reader was handed the parts and
left to assemble the event.

So that list is written instead, in [`data/developments.yaml`](data/developments.yaml).
An entry is an **event** — *the Warsaw tract was sold by the Hilty trusts* — where the
file itself holds four deeds and a permit, and no arrangement of those five rows adds
up to the sentence a reader wants. Each entry carries a date, a sentence or two saying
what happened, and a dialog behind it with the longer account, every document it rests on,
and a way into each entity it names.

Being written does not make it exempt. The build holds a development to the standard
it holds a node or an edge to: it fails on an entry that cites nothing, on a citation
pointing at a file that is not in this repository, and on a link to an entity that does
not exist. The curation is in *which* documents are grouped into an event and what the
event is called — never in whether there are documents.

Two things follow, and both are deliberate. The list is ordered by the build, newest
first, and not by where an entry was pasted into the file. And an entry is there because
someone judged that it mattered, not because a date fell inside a window — so the page
says so, under the list and in **Not claimed**, rather than letting an editorial
judgement wear the clothes of a computed one.

## Interacting

| | |
|---|---|
| Drag background / wheel | Pan, zoom |
| One finger / two fingers | Pan, pinch to zoom |
| Drag a node | Move it, and only it — every other position holds. A click on its own moves nothing at all |
| Click or tap a node | Focus it, dim everything but its neighbours, open its panel |
| Click or tap a connection | Open *that connection's* sources — an edge's citation is never more than one click away |
| Double-click / double-tap the plane | Re-frame the whole web — the way back from a zoom |
| Hover | Name, category, date, source and connection counts. A pointer thing: touch goes from a tap straight to the panel |
| `/` | Jump to search |
| **Which build** | Which of the three the map is drawing. It opens on Marshfield; the other two, and the whole file, are one click away |
| Sidebar | Which build, and search. Below 900px it is a drawer over the map, behind **Menu** |
| **Recent developments** | What has happened lately, in the sidebar, written rather than counted. Each entry opens onto the documents behind it |
| **Filters** | Category, connection type, how well established, and the time key — cumulative, and on top of whichever build is in focus. The button carries a count when any of them is holding something back |
| **Sources** | The map inverted — every document, and what rests on it |
| **Not claimed** | What the record does not support, and why some expected lines are absent |
| **Tipline** | What kind of information is useful to send in, and that identities are kept anonymous |

## Files

```
map/
  index.html          the map
  sources.html        document index
  SCHEMA.md           field contracts for nodes, edges and citations
  data/
    taxonomy.yaml     categories, connection types, hue families, the three builds,
                      the opening hierarchy
    entities.yaml     nodes                 ─┐
    relationships.yaml edges                  │
    non-claims.yaml   tier 4, text only       ├─ hand-authored from the record
    developments.yaml what happened lately, as events rather than filings
    panels.yaml       the words in every dialog                            ─┘
    graph.json        GENERATED — do not edit
    graph.js          GENERATED — the same data as a global, for file://
  img/
    avatars/          portraits, drawn inside a person's glyph, and company logos,
                      fitted inside an organisation's. A person the file has no
                      picture of gets the blank avatar; an organisation with no
                      logo gets nothing, because a missing wordmark says nothing
  js/
    main.js           bootstrap, timeline, controls
    layout.js         the opening hierarchy — courses, and where each name sits on one
    graph.js          camera, canvas renderer, hit testing
    ui.js             sidebar, build switcher, search, panels, developments
    dialog.js         one dialog, and the renderer that fills it from panels.yaml
    shapes.js         glyphs, palette, tier line styles
build/
  build.mjs           YAML -> graph.json, with the validation that fails the build
```

## Adding to the map

1. Add the node to `data/entities.yaml` with a `category`, a `tier`, a `summary`
   and at least one citation. Give the citation an `excerpt` — the specific line the
   claim rests on — not just a path. If the document is a capture of a page that is
   still on the public web, add the `url` it was captured from, and a `url_label`
   saying what the link opens.
2. Add edges to `data/relationships.yaml`. Every edge needs `projects` — which of
   the three builds it belongs to, or `all` — and tier 3 needs `resolves`. An
   entity's own membership is not authored: it is the union of the projects of
   the connections it stands on, so an entity with no tagged connection fails
   the build.
3. Give it a seat in `hierarchy` in `data/taxonomy.yaml`: the band it belongs to,
   and where in that row it reads.
4. `node build/build.mjs`. If it fails, it names the file and the field.

The failure mode this guards against is the ordinary one: a claim that outlived
the document it rested on. Here, that cannot survive a build.

## Adding a recent development

1. Add an entry to `data/developments.yaml` with an `id`, a `title` that names the
   event rather than the filing, a `date`, a `summary` of a sentence or two — that is
   the list itself, so make it carry the event — and `detail`, the paragraphs the
   dialog opens onto.
2. Cite the documents. Same contract as a node: a path in `evidence/` that exists, a
   `label`, and an `excerpt` wherever there is a line the entry rests on. An entry
   that cites nothing fails the build.
3. Write it for someone who is not a lawyer. The excerpts quote the filings exactly,
   because an excerpt is evidence; the summary and the detail are ours, and they are where
   a reader who has never heard of a fixture filing finds out what one does. There is no
   `caveat` field and the build rejects one: a price no deed states, or a hearing that has
   not happened yet, goes in the `detail` in plain words.
4. List the entities it touches in `entities`, by id. Each becomes a way into the map
   from the dialog, and the build fails on an id that is not a declared entity.
5. If you are writing it while the thing it describes is still going on — a hearing that
   is sitting as you type — set `live: true`. The entry wears a **Live** badge, which is
   a promise to come back: remove the field once the entry says what happened.
6. `node build/build.mjs`. Order is decided there, newest first, so it does not matter
   where in the file the entry goes.

## Changing what a panel says

The words in every dialog — Not claimed, Tipline, Keyboard shortcuts, Privacy, Terms of
use, the small-screen note — are in `data/panels.yaml`, not in the JavaScript. A panel is
a title, a lede, a run of sections and a foot; a section carries cards, a table of keys, a
note, or a `from:` that draws its cards out of `non-claims.yaml`. A section that would
render nothing is not rendered at all, its heading included, so an empty list is how
"nothing under this heading yet" gets said.

Panel text is **not** HTML. Everything is escaped, and three pieces of inline markup
survive: `[text](href)`, `` `code` `` and `**bold**`. A link may only be http, https,
mailto or a path inside this site — checked at build time, so a bad one fails the
build, and checked again at render time, so one that somehow got past still does not
become an anchor. `{nodeCount}`, `{edgeCount}`, `{documentCount}` and `{recentPhrase}`
are filled from the compiled graph, so no panel can state a number the build would
disagree with.
