#!/usr/bin/env node
// Compiles data/*.yaml into data/graph.json and data/graph.js.
//
// This script FAILS the build — it does not warn — when a citation points at a file
// that is not in this repository, when a node or edge carries no citation, when a
// tier-3 edge does not say what would resolve it, or when an edge does not say which
// build it belongs to. That is the mechanical enforcement of the standard this file
// holds itself to.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from './vendor/js-yaml.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The app and its sources sit side by side at the repository root; evidence/ is
// their sibling, which is what makes every cited path resolve from the page
// itself with no prefix.
const DATA = join(ROOT, 'data');

const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// CORE_SCHEMA leaves YAML 1.1 timestamps as strings, so "2026" and "2026-07-10"
// keep their precision instead of being coerced to midnight Date objects.
const load = (name) =>
  yaml.load(readFileSync(join(DATA, name), 'utf8'), { schema: yaml.CORE_SCHEMA });

const taxonomy = load('taxonomy.yaml');
const nodes = load('entities.yaml');
const edges = load('relationships.yaml');
const nonClaims = load('non-claims.yaml');
const developments = load('developments.yaml');
const panels = load('panels.yaml');

const categoryKeys = new Set(taxonomy.categories.map((c) => c.key));
const familyKeys = new Set(taxonomy.hueFamilies.map((f) => f.key));
const typeKeys = new Set(taxonomy.connectionTypes.map((t) => t.key));
const projectKeys = new Set((taxonomy.projects || []).map((p) => p.key));

for (const c of taxonomy.categories) {
  if (!familyKeys.has(c.family)) fail(`category "${c.key}" names unknown family "${c.family}"`);
}

// A project is the map's opening frame, not a claim: it groups connections that
// belong to one build so the reader can take them one at a time. Its `anchor` is
// the site a focused view centres on, and exactly one project opens the map.
const projects = taxonomy.projects || [];
if (!projects.length) fail('taxonomy.yaml declares no projects');
const seenProject = new Set();
for (const p of projects) {
  const where = `project "${p.key ?? '(no key)'}"`;
  if (!p.key) fail(`${where}: missing key`);
  else if (seenProject.has(p.key)) fail(`${where}: duplicate key`);
  else seenProject.add(p.key);
  if (!p.label) fail(`${where}: missing label`);
  if (!p.anchor) fail(`${where}: missing anchor — the site a focused view centres on`);
}
if (projects.filter((p) => p.default).length !== 1) {
  fail('exactly one project must carry "default: true" — it is what the map opens on');
}

// ---------------------------------------------------------------- dates -----
// Accepts YYYY, YYYY-MM and YYYY-MM-DD. Returns a sortable timestamp plus the
// precision, so the interface can say "2025" rather than inventing "1 January".
function parseDate(value, where) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(s);
  if (!m) {
    fail(`${where}: date "${s}" is not YYYY, YYYY-MM or YYYY-MM-DD`);
    return null;
  }
  const [, y, mo, d] = m;
  const precision = d ? 'day' : mo ? 'month' : 'year';
  const t = Date.UTC(Number(y), mo ? Number(mo) - 1 : 0, d ? Number(d) : 1);
  if (Number.isNaN(t)) {
    fail(`${where}: date "${s}" is not a real date`);
    return null;
  }
  return { iso: s, t, precision, year: Number(y) };
}

// ----------------------------------------------------------- citations -----
const docIndex = new Map(); // repo path -> { path, exists, url, urlLabel, refs: [] }

// A citation may carry a LIVE url alongside the archived copy: the place the same
// source can be read today. The archived file is what the claim rests on — it is
// the source as it stood when it was gathered, and it does not change. The live
// url is the reader's independent check on it, and it can move, change or vanish.
// So the url never replaces the document; it only ever sits beside one.
function checkUrl(c, at) {
  if (c.url === undefined || c.url === null) {
    if (c.url_label) fail(`${at}: has "url_label" but no "url"`);
    return { url: null, urlLabel: null };
  }
  const url = String(c.url).trim();
  if (!/^https?:\/\/[^\s"'<>]+$/.test(url)) {
    fail(`${at}: "url" must be an absolute http(s) URL — got "${url}"`);
    return { url: null, urlLabel: null };
  }
  return { url, urlLabel: c.url_label ? String(c.url_label).trim() : null };
}

// A citation may ask to be SHOWN, not only linked: `preview: true` renders the cited
// file in the panel. Only an image can be shown, and only a document in this
// repository — a live url is the half that can rot, so it is never what is drawn.
// The flag is opt-in per citation rather than inferred from the extension, because
// most of the images in evidence/ are records to be read at full size, not figures.
const IMAGE_FILE = /\.(jpe?g|png|webp|gif|avif)$/i;
function checkPreview(c, at) {
  if (c.preview === undefined) return false;
  if (c.preview !== true) fail(`${at}: "preview" is a flag; write "preview: true" or leave it out`);
  if (!c.doc) fail(`${at}: "preview" needs a "doc" — an external source has no file to show`);
  else if (!IMAGE_FILE.test(c.doc)) {
    fail(`${at}: "preview" only shows an image; ${c.doc} is not one`);
  }
  if (!c.label) fail(`${at}: a previewed citation needs a "label" to caption it`);
  return true;
}

// One of a node's previewed images may also be the node's own picture: `glyph: true`
// draws it inside the glyph on the map, cropped to the shape, the way a portrait is
// drawn inside a person's disc. It is the one picture on this canvas that is evidence
// — a portrait and a wordmark are conveniences, and neither is cited — so it is named
// by the citation rather than by a field of its own on the node. A photograph shown at
// the size of a glyph cannot carry its own caption, and it must not be the only place
// the reader meets it: the flag therefore requires `preview`, which puts the same file
// in the panel at reading size with its label, its date and its excerpt under it.
function checkGlyph(c, at, kind, previewed) {
  if (c.glyph === undefined) return false;
  if (c.glyph !== true) fail(`${at}: "glyph" is a flag; write "glyph: true" or leave it out`);
  // A chain citation belongs to a step in the title, not to the node, and there is no
  // glyph on the map for "ARY to Lumon, Tract 2" to be drawn inside. Said once: with no
  // glyph to sit inside, nothing else about the flag on one is worth reporting.
  if (kind !== 'node') {
    fail(`${at}: only a node's own citation can be its "glyph"`);
    return false;
  }
  if (!previewed) {
    fail(`${at}: a "glyph" must also be "preview: true" — a picture at glyph size has no room for its label, its date or its excerpt, so it has to appear in the panel too`);
  }
  return true;
}

function checkCitations(list, where, refLabel) {
  if (!Array.isArray(list) || list.length === 0) {
    fail(`${where}: no citations. Everything on this map is traceable to a document.`);
    return [];
  }
  return list.map((c, i) => {
    const at = `${where} citation[${i}]`;
    if (!c || (!c.doc && !c.external)) {
      fail(`${at}: needs either "doc" (a path in this repository) or "external" (a named source)`);
      return c;
    }
    if (c.doc && c.external) fail(`${at}: has both "doc" and "external"; pick one`);
    const { url, urlLabel } = checkUrl(c, at);
    if (c.doc) {
      const abs = join(ROOT, c.doc);
      const exists = existsSync(abs);
      if (!exists) fail(`${at}: cited document does not exist — ${c.doc}`);
      if (!docIndex.has(c.doc)) {
        docIndex.set(c.doc, { path: c.doc, exists, url: null, urlLabel: null, refs: [] });
      }
      const entry = docIndex.get(c.doc);
      // One archived document has one live location. Two citations of the same file
      // that disagree about where it lives now is an authoring error, not a choice
      // the interface should have to present.
      if (url) {
        if (entry.url && entry.url !== url) {
          fail(`${at}: ${c.doc} is already given the live url ${entry.url}; this cites ${url}`);
        } else {
          entry.url = url;
          entry.urlLabel = urlLabel;
        }
      }
      entry.refs.push(refLabel);
    } else if (!c.label) {
      fail(`${at}: an external citation must carry a "label" naming the source`);
    }
    if (c.date) parseDate(c.date, at);
    const preview = checkPreview(c, at);
    const glyph = checkGlyph(c, at, refLabel.kind, preview);
    // url_label is the authoring name; the graph carries it as urlLabel, beside
    // the other camelCase fields the interface reads.
    const { url_label, preview: _p, glyph: _g, ...rest } = c;
    return {
      ...rest, url, urlLabel,
      ...(preview ? { preview: true } : {}),
      ...(glyph ? { glyph: true } : {}),
    };
  });
}

// ------------------------------------------------------------ projects -----
/** Reads an edge's `projects`: a list of declared keys, or `all` for the few
 *  facts that stand behind every build. Absent is an error, not a default —
 *  an untagged connection would quietly vanish from every focused view. */
function readProjects(value, where) {
  if (value === 'all') return projects.map((p) => p.key);
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${where}: no projects. Every connection must say which build it belongs to, or "all".`);
    return [];
  }
  const out = [];
  for (const key of value) {
    if (!projectKeys.has(key)) fail(`${where}: unknown project "${key}"`);
    else if (out.includes(key)) fail(`${where}: project "${key}" named twice`);
    else out.push(key);
  }
  // Declaration order, so every view lists its projects the same way round.
  return projects.map((p) => p.key).filter((k) => out.includes(k));
}

// ----------------------------------------------------------- chain -----
// A site's chain of title: the conveyances that carry the parcel from one holder
// to the next, in the order they happened. Only conveyances belong here. A survey,
// an aerial or a parcel record says who holds the land, not how it passed, so it
// stays in the node's own citations. A step that the record does not establish is
// written as one, with `note` saying what is missing — a gap named is a gap the
// reader can check, and a chain that quietly skips one is the misleading kind.
function readChain(value, where, ofName) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${where}: "chain" must be a non-empty list of conveyance steps`);
    return null;
  }
  return value.map((s, i) => {
    const at = `${where} chain[${i}]`;
    if (!s || !s.from) fail(`${at}: missing "from" — who the interest passed out of`);
    if (!s || !s.to) fail(`${at}: missing "to" — who it passed to`);
    return {
      from: s.from ? String(s.from).trim() : '',
      to: s.to ? String(s.to).trim() : '',
      // What passed: the whole fee, a named tract, an undivided share.
      interest: s.interest ? String(s.interest).trim() : null,
      note: s.note ? String(s.note).trim() : null,
      date: parseDate(s.date, at),
      citations: checkCitations(s.citations, at, {
        kind: 'chain',
        id: `${where}#${i}`,
        name: `${ofName} · chain of title`,
      }),
    };
  });
}

// --------------------------------------------------- portraits and marks --
// A node can carry a picture of what it is: a person carries a portrait in
// `image`, an organisation carries its logo in `logo`. Neither is a citation.
// Nothing on the map rests on either, so both carry no tier and no excerpt.
//
// The file says which of the two it is holding rather than one field guessing
// from the category, because they are not the same kind of mark:
//
//   * A portrait is cropped to fill the person's disc, the way every avatar
//     is, and a person the file has no picture of still gets a face — the
//     blank avatar. An absent portrait is a gap in what we have, not a fact
//     about the person, so it must not read as a thinner node.
//   * A logo is a wordmark. It is fitted whole inside the glyph, never
//     cropped, because half a wordmark identifies nobody. And an organisation
//     the file has no logo for gets no stand-in at all: there is no blank
//     logo, because a logo is a convenience for recognising a company and its
//     absence says nothing whatever about the company. Its glyph stays exactly
//     as it was before there were any logos here.
//
// A logo also has to say which background it was drawn for. Several of these
// are white artwork lifted from a dark website header, invisible on a light
// plate; the renderer needs that told to it, because it cannot see the file.
const AVATARS = 'img/avatars';
// Wider than IMAGE_FILE, which governs what a citation can preview: a logo is
// usually distributed as an SVG, and an SVG is a fine wordmark but a poor
// scan, so it belongs here and not there.
const ART_FILE = /\.(jpe?g|png|webp|gif|avif|svg)$/i;
const LOGO_ON = new Set(['light', 'dark']);

function readArt(value, where, field) {
  const path = String(value).trim();
  if (!path.startsWith(`${AVATARS}/`)) {
    fail(`${where}: "${field}" must be a path under ${AVATARS}/ — got "${path}"`);
    return null;
  }
  if (!ART_FILE.test(path)) fail(`${where}: "${field}" is not an image file — ${path}`);
  else if (!existsSync(join(ROOT, path))) fail(`${where}: ${field} does not exist — ${path}`);
  return path;
}

function readImage(value, where, category) {
  if (value === undefined || value === null) return null;
  if (category !== 'person') {
    fail(`${where}: "image" is a portrait, so only a person node carries one — an organisation's wordmark goes in "logo"`);
    return null;
  }
  return readArt(value, where, 'image');
}

function readLogo(value, on, where, category) {
  if (value === undefined || value === null) {
    if (on !== undefined) fail(`${where}: "logo_on" describes a logo, and this node has none`);
    return { logo: null, logoOn: null };
  }
  if (category === 'person') {
    fail(`${where}: "logo" is an organisation's wordmark — a person's picture goes in "image"`);
    return { logo: null, logoOn: null };
  }
  // Required, not defaulted. Guessing this wrong does not look wrong, it looks
  // like nothing at all: white artwork on a white plate is an empty glyph.
  const key = on === undefined || on === null ? '' : String(on).trim();
  if (!LOGO_ON.has(key)) {
    fail(`${where}: "logo_on" must name the background the artwork was drawn for — "light" or "dark"`);
  }
  return { logo: readArt(value, where, 'logo'), logoOn: LOGO_ON.has(key) ? key : null };
}

/** The third kind of picture a glyph can wear, and the only one that is a
 *  document: the photograph a node's own citation marked `glyph: true`. It is
 *  not a field on the node, because a picture of the thing itself is a claim
 *  about it — that this is what the ground looks like — and a claim on this map
 *  is cited or it is not made. Hoisted here all the same, so the renderer reads
 *  one path off the node the way it reads `image` and `logo`.
 *
 *  A node wears one picture. Two citations both asking for the glyph is an
 *  authoring error rather than a choice the renderer should be making, and so
 *  is a cited photograph on a node that already carries a portrait or a mark. */
function readGlyph(citations, where, n) {
  const shown = citations.filter((c) => c && c.glyph);
  if (!shown.length) return null;
  if (shown.length > 1) {
    fail(`${where}: ${shown.length} citations ask to be the glyph; a node wears one picture`);
  }
  if (n.image || n.logo) {
    fail(`${where}: a cited "glyph" and ${n.image ? 'an "image"' : 'a "logo"'} are both the picture inside this node; pick one`);
  }
  return shown[0].doc;
}

// --------------------------------------------------------------- nodes -----
const byId = new Map();
const outNodes = nodes.map((n, i) => {
  const where = `node[${i}] ${n.id ?? '(no id)'}`;
  if (!n.id) fail(`${where}: missing id`);
  if (byId.has(n.id)) fail(`${where}: duplicate id`);
  if (!n.name) fail(`${where}: missing name`);
  if (!n.summary) fail(`${where}: missing summary`);
  if (!categoryKeys.has(n.category)) fail(`${where}: unknown category "${n.category}"`);
  if (![1, 2, 3].includes(n.tier)) fail(`${where}: tier must be 1, 2 or 3`);

  if (n.label !== undefined) {
    if (!Array.isArray(n.label) || n.label.length < 1 || n.label.length > 2) {
      fail(`${where}: "label" must be one or two lines, drawn verbatim on the canvas`);
    } else if (n.label.some((l) => !String(l).trim())) {
      fail(`${where}: "label" has an empty line`);
    }
  }

  const date = parseDate(n.date, where);
  const citations = checkCitations(n.citations, where, { kind: 'node', id: n.id, name: n.name });
  const out = {
    id: n.id,
    name: n.name,
    short: n.short || n.name,
    // Explicit canvas lines, for the few names where the wrap has to be said
    // rather than guessed — the sites, which carry a recognisable name above
    // an address most readers would not place on its own.
    label: n.label && n.label.length ? n.label.map((l) => String(l).trim()) : null,
    category: n.category,
    family: taxonomy.categories.find((c) => c.key === n.category)?.family,
    tier: n.tier,
    date,
    dateNote: n.date_note || null,
    summary: n.summary.trim(),
    caveat: n.caveat ? n.caveat.trim() : null,
    aliases: n.aliases || [],
    image: readImage(n.image, where, n.category),
    ...readLogo(n.logo, n.logo_on, where, n.category),
    glyph: readGlyph(citations, where, n),
    citations,
    chain: readChain(n.chain, where, n.name),
    degree: 0,
  };
  byId.set(n.id, out);
  return out;
});

// --------------------------------------------------------------- edges -----
const seenEdge = new Set();
const outEdges = edges.map((e, i) => {
  const where = `edge[${i}] ${e.source ?? '?'} -> ${e.target ?? '?'}`;
  if (!byId.has(e.source)) fail(`${where}: source "${e.source}" is not a declared node`);
  if (!byId.has(e.target)) fail(`${where}: target "${e.target}" is not a declared node`);
  if (e.source === e.target) fail(`${where}: self-loop`);
  if (!typeKeys.has(e.type)) fail(`${where}: unknown connection type "${e.type}"`);
  if (!e.label) fail(`${where}: missing label`);
  if (e.label && /;/.test(e.label)) {
    fail(`${where}: "label" contains a semicolon — split the explanatory clause into "because"`);
  }
  if (![1, 2, 3].includes(e.tier)) fail(`${where}: tier must be 1, 2 or 3`);
  if (e.tier === 3 && !e.resolves) {
    fail(`${where}: tier 3 requires "resolves" — the document that would settle it`);
  }

  // Which build this connection belongs to. Authored, never inferred: the graph
  // is one connected piece, so no distance from a site can be read as membership.
  const projectsOf = readProjects(e.projects, where);

  const id = `${e.source}__${e.target}__${e.type}__${e.date ?? 'undated'}__${i}`;
  const dedupe = `${e.source}|${e.target}|${e.type}|${e.label}`;
  if (seenEdge.has(dedupe)) warn(`${where}: duplicate of an identical earlier edge`);
  seenEdge.add(dedupe);

  if (byId.has(e.source)) byId.get(e.source).degree++;
  if (byId.has(e.target)) byId.get(e.target).degree++;

  return {
    id,
    source: e.source,
    target: e.target,
    // Kept alongside source/target as plain ids, so identity checks never
    // depend on whether something upstream has swapped those for objects.
    sourceId: e.source,
    targetId: e.target,
    type: e.type,
    label: e.label,
    // The relationship itself ("A did X to B") stays a short verb phrase; the reason
    // or supporting detail for it — often a different voice (counsel, a document, a
    // date) — is kept separate so the panel can show "A → B" and its explanation as
    // two distinct lines instead of one run-on sentence.
    because: e.because ? String(e.because).trim() : null,
    tier: e.tier,
    projects: projectsOf,
    date: parseDate(e.date, where),
    summary: e.summary ? e.summary.trim() : null,
    resolves: e.resolves ? e.resolves.trim() : null,
    citations: checkCitations(e.citations, where, {
      kind: 'edge',
      id,
      name: `${byId.get(e.source)?.short ?? e.source} → ${byId.get(e.target)?.short ?? e.target}`,
    }),
  };
});

for (const n of outNodes) {
  if (n.degree === 0) warn(`node "${n.id}" has no edges and will float unconnected`);
}

// ------------------------------------------------ project membership -----
// An entity's project is not authored: it is the union of the projects of the
// connections it stands on. That is deliberate. Half a dozen entities appear in
// more than one build — a principal, two vehicles, a notary, an agency — and the
// record does not assign any of them to one site. Deriving membership from the
// lines means each of those entities arrives in a view carrying only the
// connections that belong to it, instead of dragging all of them along.
const projectMembers = new Map(projects.map((p) => [p.key, new Set()]));
for (const e of outEdges) {
  for (const key of e.projects) {
    projectMembers.get(key)?.add(e.source);
    projectMembers.get(key)?.add(e.target);
  }
}
for (const n of outNodes) {
  n.projects = projects.map((p) => p.key).filter((k) => projectMembers.get(k).has(n.id));
  if (!n.projects.length) {
    fail(`node "${n.id}" belongs to no project — it would be drawn in no view but the ` +
      'whole map. Tag one of its connections, or give it one.');
  }
}
for (const p of projects) {
  if (!byId.has(p.anchor)) fail(`project "${p.key}": anchor "${p.anchor}" is not a declared node`);
  else if (!projectMembers.get(p.key).has(p.anchor)) {
    fail(`project "${p.key}": anchor "${p.anchor}" is not on any connection tagged "${p.key}"`);
  }
}

// ----------------------------------------------------------- hierarchy -----
// The opening layout is authored, not derived, so it has to stay in step with
// the entity list. A node added to entities.yaml and forgotten here would open
// in the wrong place, or on a course of its own at the foot of the map — so
// the build fails on it, the same way it fails on a missing citation.
const seat = new Map();
(taxonomy.hierarchy || []).forEach((band, bi) => {
  const where = `hierarchy[${bi}] ${band.key ?? '(no key)'}`;
  if (!band.key) fail(`${where}: missing key`);
  if (!band.label) fail(`${where}: missing label`);
  if (!Array.isArray(band.rows) || band.rows.length === 0) {
    fail(`${where}: needs at least one row of entity ids`);
    return;
  }
  band.rows.forEach((row, ri) => {
    if (!Array.isArray(row) || row.length === 0) {
      fail(`${where} row[${ri}]: must be a non-empty list of entity ids`);
      return;
    }
    for (const id of row) {
      if (!byId.has(id)) fail(`${where} row[${ri}]: "${id}" is not a declared node`);
      else if (seat.has(id)) fail(`${where} row[${ri}]: "${id}" is also placed in ${seat.get(id)}`);
      else seat.set(id, `${band.key} row[${ri}]`);
    }
  });
});
if (taxonomy.hierarchy) {
  for (const n of outNodes) {
    if (!seat.has(n.id)) {
      fail(`node "${n.id}" is not placed in the taxonomy.yaml hierarchy — ` +
        'every entity needs a seat in the opening layout');
    }
  }
}

// -------------------------------------------------------- developments -----
// The curated "Recent developments" list. An entry is an EVENT — "the Warsaw
// tract was sold by the Hilty trusts" — and not a document, which is why it is
// written rather than computed from the dates in entities.yaml. See the header
// of developments.yaml for what that changed and why.
//
// Being written does not make it exempt. An entry cites documents, those
// documents must be in this repository, and the build fails on an entry that
// cites nothing — the same rule every node and every edge is held to. An entry
// that links to an entity must name one that exists.
const seenDev = new Set();
const outDevelopments = (developments || []).map((d, i) => {
  const where = `development[${i}] ${d.id ?? '(no id)'}`;
  if (!d.id) fail(`${where}: missing id`);
  else if (seenDev.has(d.id)) fail(`${where}: duplicate id`);
  else seenDev.add(d.id);
  if (!d.title) fail(`${where}: missing title`);
  if (!d.date) fail(`${where}: missing date`);
  if (!d.summary) fail(`${where}: missing summary — it is the entry, as the list shows it`);
  // An entry states what the record shows and stops there. Where something is
  // genuinely unestablished — no price on a deed, no ruling yet — it is said in the
  // detail, in plain words, not fenced off in a block of its own.
  if (d.caveat !== undefined) {
    fail(`${where}: "caveat" is not a field any more — work it into "detail"`);
  }

  let detail = [];
  if (d.detail === undefined) detail = [];
  else if (!Array.isArray(d.detail)) fail(`${where}: "detail" must be a list of paragraphs`);
  else detail = d.detail.map((p) => String(p).trim()).filter(Boolean);
  if (!detail.length) {
    fail(`${where}: "detail" is what the entry opens onto — give it at least one paragraph`);
  }

  const entities = [];
  for (const id of d.entities || []) {
    if (!byId.has(id)) fail(`${where}: "${id}" is not a declared entity`);
    else if (entities.includes(id)) fail(`${where}: entity "${id}" named twice`);
    else entities.push(id);
  }

  return {
    id: d.id,
    title: d.title ? String(d.title).trim() : '',
    // One short word on the chip. Free text rather than a taxonomy: these are
    // editorial groupings of a handful of entries, not a filter anything runs on.
    kind: d.kind ? String(d.kind).trim() : null,
    date: parseDate(d.date, where),
    dateNote: d.date_note || null,
    summary: d.summary ? String(d.summary).trim() : '',
    detail,
    entities,
    citations: checkCitations(d.citations, where, {
      kind: 'development',
      id: d.id,
      name: `Recent development · ${d.title ?? d.id}`,
    }),
  };
// Newest first, decided here rather than by where an entry was pasted into the
// file. A list called "recent" that is only as ordered as its author was is a
// list that goes wrong quietly.
}).sort((a, b) => (b.date ? b.date.t : 0) - (a.date ? a.date.t : 0));

// -------------------------------------------------------------- panels -----
// The prose of the dialogs. It is data, not markup: everything is escaped on the
// way to the screen and three pieces of inline markup survive — a link, a code
// span and a bold run. A link's href is checked HERE, at build time, so a bad
// one fails the build rather than reaching a reader as a dead or unexpected
// destination.
const LINK_RE = /\[([^\]]*)\]\(([^)]*)\)/g;
function checkText(value, at) {
  const s = String(value ?? '');
  for (const m of s.matchAll(LINK_RE)) {
    const href = m[2].trim();
    const ok = /^(?:https?:\/\/|mailto:)[^\s]+$/i.test(href) ||
      /^[A-Za-z0-9._~/-]+(?:#[A-Za-z0-9._~-]+)?$/.test(href);
    if (!ok) fail(`${at}: link "${href}" must be http, https, mailto, or a path inside this site`);
    if (!m[1].trim()) fail(`${at}: link to "${href}" has no text`);
  }
  return s.trim();
}

const nonClaimLists = new Set(Object.keys(nonClaims || {}));
function checkPanel(key, p) {
  const where = `panels.yaml ${key}`;
  if (!p || typeof p !== 'object') { fail(`${where}: missing`); return; }
  if (!p.title) fail(`${where}: missing title`);
  if (!p.label) fail(`${where}: missing label — a dialog needs an accessible name`);
  checkText(p.lede, `${where} lede`);
  checkText(p.foot, `${where} foot`);
  if (!Array.isArray(p.sections) || !p.sections.length) {
    fail(`${where}: needs at least one section`);
    return;
  }
  p.sections.forEach((s, i) => {
    const at = `${where} section[${i}]`;
    checkText(s.heading, `${at} heading`);
    checkText(s.note, `${at} note`);
    const kinds = ['cards', 'from', 'rows', 'note'].filter((k) => s[k] !== undefined);
    if (!kinds.length) fail(`${at}: carries nothing — give it cards, from, rows or a note`);
    if (s.from !== undefined && !nonClaimLists.has(s.from)) {
      fail(`${at}: "from: ${s.from}" names no list in non-claims.yaml`);
    }
    for (const c of s.cards || []) {
      if (!c || !c.title) fail(`${at}: a card with no title`);
      if (!c || !c.body) fail(`${at}: card "${c && c.title}" has no body`);
      checkText(c && c.title, `${at} card title`);
      checkText(c && c.body, `${at} card "${c && c.title}"`);
    }
    for (const r of s.rows || []) {
      if (!r || !Array.isArray(r.keys) || !r.keys.length) fail(`${at}: a row with no keys`);
      if (!r || !r.desc) fail(`${at}: a row with no description`);
    }
  });
}
for (const key of ['notClaimed', 'tipline', 'shortcuts']) checkPanel(key, panels[key]);

// Note-shaped panels: title, label, paragraphs and a single button, rather
// than the sections a full panel carries. consent and mobileNote are both
// this shape, and each is checked the same way.
function checkNote(key) {
  const where = `panels.yaml ${key}`;
  const n = panels[key];
  if (!n) { fail(`${where}: missing`); return; }
  if (!n.title) fail(`${where}: missing title`);
  if (!n.label) fail(`${where}: missing label`);
  if (!n.button) fail(`${where}: missing button — it is the only way out of this one`);
  if (!Array.isArray(n.paragraphs) || !n.paragraphs.length) {
    fail(`${where}: needs at least one paragraph`);
  }
  for (const p of n.paragraphs || []) checkText(p, `${where} paragraph`);
}
for (const key of ['consent', 'mobileNote']) checkNote(key);

// --------------------------------------------------------------- output -----
// The timeline's lower bound is fixed at 2010 rather than the earliest
// dated record: a handful of old entity-formation dates (e.g. Sho-Me Power's
// 1992 articles of conversion) would otherwise stretch the slider through
// two decades of dead space before anything else in the record appears.
const TIMELINE_FLOOR = Date.UTC(2010, 0, 1);
const dated = [...outNodes, ...outEdges].filter((x) => x.date).map((x) => x.date.t);
const allCites = [...outNodes, ...outEdges, ...outDevelopments].flatMap((x) => x.citations)
  .concat(outNodes.flatMap((n) => (n.chain || []).flatMap((s) => s.citations)));
const liveUrlCount = allCites.filter((c) => c && c.url).length;
const graph = {
  meta: {
    generated: new Date().toISOString().slice(0, 10),
    source: 'Compiled from data/*.yaml',
    nodeCount: outNodes.length,
    edgeCount: outEdges.length,
    documentCount: docIndex.size,
    citationCount: allCites.length,
    liveUrlCount,
    documentsWithLiveUrl: [...docIndex.values()].filter((d) => d.url).length,
    timeExtent: [Math.max(TIMELINE_FLOOR, Math.min(...dated)), Math.max(...dated)],
  },
  taxonomy,
  nodes: outNodes,
  edges: outEdges,
  documents: [...docIndex.values()].sort((a, b) => a.path.localeCompare(b.path)),
  nonClaims,
  developments: outDevelopments,
  panels,
};

if (warnings.length) {
  console.warn(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.warn(`  · ${w}`);
}

if (errors.length) {
  console.error(`\nBUILD FAILED — ${errors.length} error(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error('\nNo graph.json written. Nothing here stands without a document.\n');
  process.exit(1);
}

// The repository stores these with CRLF, like the sources they are compiled
// from. Writing them with bare newlines would rewrite every one of nine
// thousand lines on the next build and bury the change actually made.
const crlf = (t) => t.replace(/\r?\n/g, '\r\n');
const json = JSON.stringify(graph, null, 1);
writeFileSync(join(DATA, 'graph.json'), crlf(json));
// Also emit the graph as a plain script assigning a global. fetch() of a local
// file is blocked under file://, so the pages load this rather than the JSON —
// which is what lets the map work from a double-click, with no server.
writeFileSync(join(DATA, 'graph.js'),
  crlf(`// GENERATED by build/build.mjs — do not edit.\nwindow.__GRAPH__ = ${json};\n`));
const tiers = (arr) => [1, 2, 3].map((t) => `T${t} ${arr.filter((x) => x.tier === t).length}`).join(' · ');
console.log(`
  data/graph.json and graph.js written

  ${outNodes.length} nodes   ${tiers(outNodes)}
  ${outEdges.length} edges   ${tiers(outEdges)}
  ${projects.map((p) => `${p.key.padEnd(12)}${
    String(projectMembers.get(p.key).size).padStart(3)} entities  ${
    String(outEdges.filter((e) => e.projects.includes(p.key)).length).padStart(3)} connections`)
    .join('\n  ')}

  ${outDevelopments.length} recent developments, hand-curated

  ${docIndex.size} distinct documents cited, all present on disk
  ${liveUrlCount} of ${allCites.length} citations also carry a live url
`);
