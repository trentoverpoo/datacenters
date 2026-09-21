# Graph data schema

Five hand-authored source files compile to one `graph.json` consumed by the site:

```
map/data/entities.yaml      ─┐  nodes
map/data/relationships.yaml  │  edges
map/data/non-claims.yaml     ├─ node build/build.mjs ──> map/data/graph.json
map/data/developments.yaml   │  what happened lately, as events
map/data/panels.yaml        ─┘  the words in every dialog
```

The build **fails** — it does not warn — if any citation points at a file that is not in
this repository, or if any node, edge or development carries no citation at all. That is
the mechanical enforcement of the standard this file holds itself to.

---

## Verification tiers

The tiers are the three-part standard every line here is held to.

| Tier | Meaning | Renders as |
|---|---|---|
| **1** | Stated in a primary document in `evidence/`, cited by path and instrument number | Solid line, full strength |
| **2** | A party's own statement — sworn filing, permit application, public-records response, on-record appearance — carried as *that party's characterization* | Solid line, lighter weight, "stated" marker |
| **3** | An open question or unresolved reading: the relationship is asserted, incomplete, or contested, and the file says so | Dashed line, muted, "unresolved" marker |
| **4** | Something the record expressly declines to claim | **Never drawn.** Listed in the "What this map does not claim" panel only |

Tier 4 has no representation in `entities.yaml` or `relationships.yaml`. It lives in
`map/data/non-claims.yaml` and reaches the UI as text, never as geometry.

---

## Node fields

| Field | Required | Notes |
|---|---|---|
| `id` | yes | kebab-case, stable, used in edge references |
| `name` | yes | full formal name as it appears in the record |
| `short` | no | label drawn on the canvas; falls back to `name` |
| `label` | no | one or two lines drawn verbatim, instead of wrapping `short`. For names the wrap has to be *said* rather than guessed — the three data centers, which carry a recognisable name above an address most readers would not place on its own |
| `category` | yes | one of the nine keys in `categories` (see below) |
| `tier` | yes | 1–3 |
| `date` | no | ISO `YYYY-MM-DD`, `YYYY-MM` or `YYYY` — the entity's earliest documented appearance. Drives the age ring and the scrubber. A **`YYYY-MM-DD`** date inside the recency window (`RECENT_DAYS` in `js/shapes.js`, currently 30) also drives the "new" halo; a date given only to the month or the year never does, because the record has not placed it on a day |
| `date_note` | no | what the date actually marks ("organized", "incorporated", "first documented signature") |
| `summary` | yes | one to three sentences, in the report's voice |
| `aliases` | no | additional search terms |
| `image` | no, person only | a portrait in `img/avatars/`, drawn inside the person's glyph. The build fails on a file that is not there, on a path outside `img/avatars/`, and on an `image` given to anything but a person. A person without one wears the blank avatar — see below |
| `logo` | no, never a person | an organisation's wordmark in `img/avatars/`, fitted inside its glyph. Same three failures as `image`, plus one on a `logo` given to a person. An organisation without one gets nothing — there is no blank logo — see below |
| `logo_on` | with `logo`, required | `light` or `dark`: which background the artwork itself was drawn for, not which theme it is being shown in. The build fails on a `logo` without it |
| `citations` | yes, ≥1 | see below |
| `caveat` | no | rendered in the panel as an explicit limit on what the node establishes |

There is deliberately **no `projects` field on a node**. An entity's membership is
derived by the build, as the union of the projects of the connections it stands on.
See below.

### Portraits and logos

Every person's glyph carries a face: their portrait where `image` names one, and a blank
avatar — a head and shoulders, knocked out of the category colour — where it does not.
Both sit inside the same circle, with the hue kept as a ring around them, so a portrait
never costs the node the colour it is read by, and a person the file has no picture of is
not drawn as less established than one it does. An absent portrait is a gap in what we
have, not a fact about the person.

The same pair opens the person's panel, at reading size, beside the category, the name
and the date — so what clicking a node shows is what the node was already showing. The
panel face is decorative and carries empty alt text: the name is the line under it, and
a screen reader saying it twice is worse than not saying it at all.

An organisation's glyph can carry its wordmark the same way, named by `logo`. The two
marks are not drawn alike, because they are not the same kind of thing:

- A **portrait is cropped** to fill the disc, the way every avatar is. A face survives
  losing its corners.
- A **logo is fitted whole** inside the glyph, on a plate sized to the mark rather than
  to the glyph, so the category colour stays the loudest thing about the node. Half a
  wordmark identifies nobody, and a glyph gone mostly white identifies nothing.

**An organisation with no `logo` gets no stand-in at all.** There is no blank logo to
match the blank avatar, and that asymmetry is deliberate. A missing portrait is a gap in
what we have and has to be shown as one. A missing wordmark is not: a logo is only a
convenience for recognising a company, so a company we have no logo for keeps exactly the
glyph and exactly the panel it had before there were any logos here.

`logo_on` says whether the artwork is light or dark — which background it was drawn to
sit on. Several of these are white marks lifted from a dark site header, and the plate
behind a logo is set from this rather than from the theme, so it is the one colour on the
page that does not flip: white artwork on a white plate is not a subtle fault, it is an
empty glyph. It is required rather than defaulted for the same reason.

A glyph can carry a third kind of picture: a photograph of the thing itself, where one
of the node's own citations marks it `glyph: true`. That one is a document rather than a
convenience, so it is named by the citation and not by a field here — see "A cited image
inside the glyph" below.

Zoomed far enough out, every glyph drops its picture and goes plain — `ART_MIN_PX` in
`js/graph.js`, one threshold for faces, marks and photographs alike. They go together
on purpose: a node's radius comes from its degree, so a company with one connection
is among the smallest glyphs on the map, and a higher bar for logos left those nodes
bare beside better-connected ones that were not. That looks like a fault and is not a
distinction the record supports.

Neither mark is a citation. They carry no tier and no excerpt, and nothing on the map
rests on either: what a node establishes is in its `citations`, exactly as it was before
there were any pictures here.



## Edge fields

| Field | Required | Notes |
|---|---|---|
| `source` / `target` | yes | node `id`s; the build fails on a dangling reference |
| `type` | yes | one of the keys in `connectionTypes` |
| `label` | yes | short verb phrase — "conveys Tract 1 to", "manager of" |
| `tier` | yes | 1–3 |
| `projects` | yes | which builds this connection belongs to: a list of keys from `projects` in `taxonomy.yaml`, or `all`. The build fails on an edge that names none, the same way it fails on an uncited one |
| `date` | no | ISO date of the instrument or event |
| `summary` | no | longer prose for the panel |
| `citations` | yes, ≥1 | see below |
| `resolves` | tier 3 only | what document would settle it — required by the build for tier 3 |

## Citation fields

A citation is either **internal** (a document in this repository) or **external** (a named
public source). Internal citations are validated against the filesystem.

```yaml
citations:
  - doc: evidence/01-marshfield-site/recorded-instruments/2026-07-13_inst-2026003834_deed-of-trust_oakstar-bank.pdf
    label: Deed of trust, Inst. 2026003834
    date: 2026-07-10
    excerpt: >
      Manager of LUMON SOLUTIONS MANAGEMENT, LLC, Manager of LUMON SOLUTIONS
      MARSHFIELD, LLC
  - doc: evidence/03-entities/company/nsi/nsi-investments-llc/missouri/2026-09-16_linkedin-robi-overhue_affordable-family-storage.pdf
    url: https://www.linkedin.com/in/robi-overhue-318a225b/
    url_label: LinkedIn profile — Robi Overhue
    label: LinkedIn — Robi Overhue, Affordable Family Storage
  - external: Biz 417 "B-School" panel
    url: https://www.biz417.com/blog/b-school-recap-data-centers/
    url_label: Biz 417 — the magazine's own recap of the panel
    date: 2026-06-23
    label: Overhue as a named panelist
    excerpt: >
      approximately 10 megawatts on roughly five acres, single-tenant
```

- `doc` — repository-relative path. **Must exist.**
- `external` — name of the source. Requires `label`.
- `excerpt` — the specific line the claim rests on. Strongly preferred over a bare link.
- `url` — optional on either kind: where the same source can be read on the public web
  today. See below.
- `url_label` — optional, and only alongside `url`: what the live link actually opens.
  Falls back to the bare host.
- `preview` — optional, `true` only: show the cited image in the panel. See below.
- `glyph` — optional, `true` only, and only on a node's own citation: draw that same
  image inside the node's glyph on the map. Requires `preview`. See below.

### Showing a cited image

Most of the images in `evidence/` are records to be read at full size — a parcel viewer,
a permit, a screenshot of a filing. A few are photographs that *are* the evidence, and
describing one in prose while refusing to show it asks the reader to take on trust the
one kind of source they could have judged for themselves.

`preview: true` marks such a citation. The image is drawn in the entity panel directly
under the summary, captioned with the citation's own `label` and `date`, and it links to
the full-size file. The citation still appears in the source list below with its
`excerpt` and its links, so the picture appears once and the record of it appears once.

It is opt-in per citation, never inferred from the file extension, because the default
for a record is to be read rather than displayed. The build enforces:

- `preview` may only be `true` — any other value fails, so `preview: no` cannot quietly
  turn into a truthy string;
- it requires a `doc`; an `external` source has no file in this repository to show;
- that `doc` must be an image (`.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.avif`);
- the citation must carry a `label`, because a shown image is captioned.

Where a photograph comes from a source that does not itself say what it shows, the panel
says so — in the `excerpt`, or in the entity's `caveat`. The site aerials on
`site-marshfield` are the worked example: they were published in a company post that
names no site, address or county, and were identified visually. The caveat states both,
so the reader knows which part is the poster's and which part is this file's.

### A cited image inside the glyph

A glyph can carry a picture of what it stands for: a person's portrait, an organisation's
wordmark — and, where the file has one, a photograph of the thing itself. The third is
the only one of the three that is a **document**. A portrait and a wordmark are
conveniences for recognising somebody, carried by `image` and `logo` and cited by
nothing; a photograph of a site is a claim about it — that this is what the ground looks
like — and a claim on this map is cited or it is not made.

So it is not a field on the node. `glyph: true` on one of the node's own citations says
that the file that citation already names is also the node's picture:

```yaml
- doc: evidence/01-marshfield-site/photos/site-aerials/marshfield-site-aerial-2.jpg
  label: Site aerial
  date: 2026-06-24
  preview: true
  glyph: true
  excerpt: >
    The same ground from above: the poured pad with white modular units in two ranks
```

It is **cropped, not fitted** — like a portrait and unlike a wordmark. Ground survives
losing its corners the way a face does. It is cropped to the glyph's own outline rather
than to a circle, so the shape still says what the node is: the sites are diamonds, and a
diamond of photograph is still legibly a diamond. As with the other two, the hue is kept
as a ring around it, so a picture never costs the node the colour it is read by, and it
disappears with them below `ART_MIN_PX`.

The build enforces:

- `glyph` may only be `true`, and only on a node's own citations — a chain citation
  belongs to a step in the title, which has no glyph to sit inside;
- it requires `preview: true` on the same citation. A picture at glyph size has no room
  for its label, its date or its excerpt, and it must not be the only place the reader
  meets the photograph: the panel shows the same file at reading size, captioned, with
  the excerpt and the links under it;
- one picture to a node — two citations asking for the glyph fails, and so does a
  `glyph` on a node that already carries an `image` or a `logo`.

There is no stand-in for its absence, for the same reason there is none for a logo: a
site nobody has photographed keeps exactly the glyph it always had. `site-marshfield` is
the only node that carries one today, and the caveat that governs the aerials in the
panel governs the glyph as well — the post they come from names no site, address or
county, and the identification is this file's.

### The live url

Much of what this file rests on was captured from the web: a LinkedIn profile printed to
PDF, a screenshot of a company page, a saved article, a filing index. The capture is the
evidence — it is the source as it stood on the day it was gathered, and it cannot change
underneath a claim. It is also unverifiable by a reader, who has only this repository's
word that the page said what the PDF says it said.

`url` closes that gap without giving up the first property. The archived file stays the
citation; the live url sits beside it as the reader's independent check, and it is the
half that can move, change or disappear. **A `url` never appears without a `doc` or an
`external` beside it**, and adding one never licenses deleting the capture.

The build enforces three things:

- a `url` must be an absolute `http`/`https` URL;
- `url_label` without `url` fails;
- two citations of the **same** `doc` may not give it different `url`s — one archived
  document has one live location, and disagreement about which is an authoring error
  rather than something the interface should have to present.

What it cannot check is whether the url still resolves, or still says what the capture
says. Add one only where the live page genuinely carries the same record: a profile, an
article as published, a filing index, an agency's own record of the permit. Where a
source exists only behind a session-bound or search-only portal — Missouri's business
and UCC search, Case.net, the county recorders and GIS viewers — no url is given,
because a link to an empty search box verifies nothing.

## Categories and connection types

Both are declared once in `map/data/taxonomy.yaml` and drive the legend, the filters and
the colours. The build fails if a node or edge names a key that is not declared there.

Colour is assigned from three validated hues plus a neutral, and **shape and fill carry the
rest** — no category is identified by colour alone.

---

## The three builds

`map/data/taxonomy.yaml` declares the projects the map can focus on. The map opens on
one of them rather than on all 88 entities at once, because the whole file at once is
the view nobody reads.

```yaml
projects:
  - key: marshfield
    label: Marshfield
    anchor: site-marshfield
    default: true
    note: >
      Ten acres off Rifle Range Road, the deepest-documented of the three …
```

| Field | Required | Notes |
|---|---|---|
| `key` | yes | named by every edge's `projects` |
| `label` | yes | what the switch in the sidebar reads |
| `anchor` | yes | the site the build is read from. A focused view centres on it, and the build fails if it is not a declared node, or not on any connection tagged with this project |
| `default` | exactly one | the build the map opens on |
| `note` | no | one or two sentences, shown under the switch |

### Why membership is tagged, and tagged on edges

A project is an **editorial grouping, not a documented relationship.** It never becomes
a node or an edge, and nothing on the canvas is drawn because of it — which is the same
reason tier 4 lives in `non-claims.yaml` rather than in the graph.

It has to be authored, because it cannot be derived. The graph is a single connected
component: every entity reaches every other one, so no distance from a site is
membership. Breadth-first from `site-springfield` reaches 8 entities at one hop — too
thin to be a map — 25 at two, which already includes the Marshfield fire district, and
53 at three, by which point 43 of the 88 are shared by all three sites and the focus is
gone.

The tag sits on **edges** rather than entities because an entity's membership is
genuinely ambiguous where its connections are not. Trent Overhue stands on all three
sites; each of his connections stands on exactly one. Tagged on the entity, every one of
his connections would follow him into every view. Tagged on the connections, a focused
view draws him with only the connections that belong to it.

So `entities.yaml` carries no project field at all. The build computes each entity's
membership as the union of its connections' projects, and **fails** on an entity that
comes out belonging to none — it would be drawn in no view but the whole map. Fifteen
entities come out in more than one build; those overlaps are among the more substantial
things the file has to show, and a schema that forced each entity under one site would
have had to assert a relationship the record does not state.

Most of the tags were read off the `evidence/` folder each citation lives in, which is
already arranged by site. What that cannot place is the corporate-formation layer — a
filing naming an organizer, a registered agent or a firm, which says nothing about which
site it was for — and those were decided one line at a time by what the entity at the
other end of the chain turns out to be.

### Bridges

A focused view also draws, faintly, the connections that **leave** it and the entities
on the far end of them. Those are not extra: a Springfield that quietly omitted the
principal who is also on the other two sites would be a cleaner picture of something
that is not true. Bridges are how a focused view stays honest about what it has set
aside. They carry no **NEW** chip and no recency wash, because both are meant to be
caught before anything else is read, and what is new in a build the reader is not
looking at is not.

---

## The opening layout

`map/data/taxonomy.yaml` also carries `hierarchy`: the arrangement the map opens on,
which is editorial and therefore authored rather than derived. It is an ordered list
of bands, drawn top to bottom, each holding one or more `rows` of node ids:

```yaml
hierarchy:
  - key: sites
    label: The three data centers
    note: The locations themselves. Everything below stands under one of them.
    rows:
      - [site-springfield, site-marshfield, site-benton]
```

| Field | Required | Notes |
|---|---|---|
| `key` | yes | stable identifier; reaches the nodes as `n.band` |
| `label` | yes | what the band is, in the report's voice |
| `note` | no | why these entities belong together |
| `rows` | yes, ≥1 | each a list of node ids. A row is one course across the map, and the order is the reading order, left to right |

**The build fails** if an id is not a declared node, if a node is placed in two rows, or
if a node is left out. A layout authored by hand and an entity list that grows are
otherwise guaranteed to drift apart; this is the same mechanical check that keeps
citations honest, applied to the thing the reader sees first.

Rows say *what order*, not *what coordinates*. Within its course each node then settles
towards the average position of what it connects to, which is what puts a grantor under
the entity it conveyed to. See `map/js/layout.js`.

---

## Recent developments

`map/data/developments.yaml` is the one list on the site that is written rather than
derived. It answers *what happened lately*, which the dates in `entities.yaml` cannot:
they answer *what was filed lately*, and a list computed from them puts a notary at the
top of the page because a deed they had touched was recorded.

An entry is an **event**, not a document. Four trustee's deeds and a permit recorded on
one afternoon are one entry — *Warsaw tract sold by the Hilty trusts* — with all five
documents cited on it.

```yaml
- id: warsaw-tract-sold-by-hilty-trusts
  title: Warsaw tract sold by the Hilty trusts
  kind: Land
  date: 2026-09-09
  date_note: Three deeds recorded together at 1:32 PM
  summary: >
    Three Hilty family trusts each conveyed an undivided one-third of the twelve
    acres at 29101 Old Hwy 65 to NSI 6, recorded within three seconds of one another.
  detail:
    - The tract moved twice in two months. …
  entities: [site-benton, nsi-6, hogan-land-title]
  citations:
    - doc: evidence/06-benton-county-site/recorded-instruments/…
      label: Trustee's warranty deed, Inst. 202604041 · an undivided one-third
      date: 2026-09-09
      excerpt: Recorded 1:32:13 PM
```

| Field | Required | Notes |
|---|---|---|
| `id` | yes | unique slug; the dialog is addressed by it |
| `title` | yes | the event, in the words a reader would use for it |
| `kind` | no | one short word on the chip — Litigation, Land, Finance. Free text, not a taxonomy: these group a handful of entries, they are not a filter |
| `live` | no | `true` while the thing the entry describes is still going on — a hearing in session. Puts a **Live** badge on the entry in the sidebar and on its dialog. It is a marker, not text: the build rejects anything but `true` |
| `date` | yes | `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, same parser as everywhere else |
| `date_note` | no | what that date is the date *of* |
| `summary` | yes | one or two sentences. This is the list itself, so it has to carry the event on its own |
| `detail` | yes, ≥1 | paragraphs the dialog opens onto |
| `entities` | no | ids from `entities.yaml`. Each becomes a way into the map from the dialog |
| `citations` | yes, ≥1 | the same contract as a node or an edge, validated the same way |

**Write it for someone who is not a lawyer.** The filings are full of terms of art, and an
`excerpt` quotes them exactly, because an excerpt is evidence and has to be verbatim. The
`summary` and the `detail` are ours, and they are where a reader who has never heard of a
fixture filing finds out what one does.

`live` is the one field here that is about the entry rather than about the record. It says
this entry is not finished — it was written while a hearing was still sitting — and it is a
promise to come back: take it off once the entry says what happened. Nothing else on the
page reads it, and it never reaches the canvas.

There is no `caveat` field, and the build rejects one. A node has a caveat because a node
is a bare assertion that needs a limit set on it; an entry here is prose, so where
something is genuinely unestablished — no price on a deed, no ruling yet — it goes in the
`detail`, in plain words, instead of being fenced off in a block of its own.

**The build fails** on an entry with no citations, on a citation pointing at a file that
is not in this repository, on a duplicate `id`, and on an `entities` id that is not a
declared node. Curation decides *which* documents make up an event and what the event is
called. It never decides whether there are documents.

Order is decided by the build — newest first — so where an entry sits in the file does
not matter. The citations reach the Sources page like any others, so a document cited
only by a development still shows what rests on it.

Nothing here is drawn on the canvas. The halo, the NEW chip and the age rings are still
measured from the dates in `entities.yaml` against the reader's own clock; this list is
editorial and the interface says so.

---

## Panels

`map/data/panels.yaml` holds the words in every dialog — Not claimed, Tipline, Keyboard
shortcuts, the small-screen note. They used to be template literals inside `ui.js`, which
made changing a sentence a code change.

A panel is a `title`, a `label` (the dialog's accessible name), a `lede`, a run of
`sections` and an optional `foot`. A section carries one of:

| Block | Renders as |
|---|---|
| `cards` | a list of `{ title, body }` — the bordered rows the panels are built from |
| `from` | the same, drawn out of a named list in `non-claims.yaml` |
| `rows` | a list of `{ keys, desc }` — the keyboard table |
| `note` | a small muted paragraph |

A section that would render nothing is not rendered at all, its heading included, so an
empty list in `non-claims.yaml` is how "nothing under this heading yet" gets said.

**Panel text is not HTML.** Everything is escaped, and exactly three pieces of inline
markup survive:

- `[text](href)` — a link. Only `http`, `https`, `mailto` or a path inside this site.
  An `http(s)` link opens in a new tab.
- `` `code` `` — a code span.
- `**bold**` — bold.

The href is checked twice: at build time, where a bad one **fails the build**, and again
at render time, where one that somehow got past is rendered as plain text rather than as
an anchor. `{nodeCount}`, `{edgeCount}`, `{documentCount}` and `{recentPhrase}` are
filled from the compiled graph, so no panel can state a number the build would disagree
with.

The dialogs themselves — open, close, seal the page behind them, hand focus back, answer
Escape innermost-first — are `map/js/dialog.js`, one implementation for all of them. The
filters dialog is the one that keeps authored markup in `index.html`, because it is a
rack of live controls rather than prose.
