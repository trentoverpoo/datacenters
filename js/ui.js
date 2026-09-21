// Sidebar, search, detail panel, the recent-developments list and the time
// scrubber. The dialogs themselves — how one opens, closes, seals the page
// behind it and hands focus back — belong to js/dialog.js, and what they say
// belongs to data/panels.yaml. What is here is which control opens which.

window.MAP = window.MAP || {};
(function (MAP) {
'use strict';

const { swatchSVG, avatarSVG, tierLineSVG, readPalette, FAMILY_VAR, TIER,
  RECENT_PHRASE, recencyOf } = MAP.shapes;
const { Dialog, renderPanel, inline, pushLayer, popLayer } = MAP;

const el = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

// Where the small-screen note records that it has been read.
const NOTE_KEY = 'map-mobile-note';

// Where the consent note records that it has been read.
const CONSENT_KEY = 'map-consent';

/** The bare host of a live url, for a link that has nothing better to say. */
function hostOf(url) {
  const m = /^https?:\/\/([^/?#]+)/i.exec(String(url || ''));
  return m ? m[1].replace(/^www\./, '') : String(url || '');
}

/** Renders only as much of a date as the record actually supports. */
function formatDate(d) {
  if (!d) return null;
  const dt = new Date(d.t);
  if (d.precision === 'year') return String(dt.getUTCFullYear());
  if (d.precision === 'month') return `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
  return `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}

class UI {
  constructor(data, handlers) {
    this.data = data;
    this.h = handlers;
    this.nodeById = new Map(data.nodes.map((n) => [n.id, n]));
    this.catById = new Map(data.taxonomy.categories.map((c) => [c.key, c]));
    this.typeById = new Map(data.taxonomy.connectionTypes.map((t) => [t.key, t]));

    this.projects = data.taxonomy.projects || [];
    this.projectByKey = new Map(this.projects.map((p) => [p.key, p]));

    this.activeCategories = new Set(data.taxonomy.categories.map((c) => c.key));
    this.activeTypes = new Set(data.taxonomy.connectionTypes.map((t) => t.key));
    this.activeTiers = new Set([1, 2, 3]);
    // Which build the map opens on. Null is the whole file at once, which is
    // the one view nobody can read — so it is a choice, not the starting point.
    const opening = this.projects.find((p) => p.default) || this.projects[0];
    this.activeProject = opening ? opening.key : null;

    this._buildMasthead();
    this._buildProjects();
    this._buildLegend();
    this._buildTypes();
    this._buildTiers();
    this._buildAgeKey();
    this._buildSearch();
    this._buildDevelopments();
    this._buildDrawer();
    this._buildPanel();
    this._buildModal();
    this._buildFiltersModal();
    this._buildConsentNote();
    this._buildMobileNote();
    this._buildTiplineModal();
    this._buildShortcutsModal();
    this._buildPrivacyModal();
    this._buildTermsModal();
  }

  palette() { return readPalette(); }
  /** The custom-property name for a family, so swatches follow the theme. */
  hue(family) { return FAMILY_VAR[family]; }

  // -------------------------------------------------------------- chrome ---

  _buildMasthead() {
    const m = this.data.meta;
    el('counts').textContent =
      `${m.nodeCount} entities · ${m.edgeCount} connections · ${m.documentCount} documents`;
  }

  // ------------------------------------------------------------ projects ---

  /** The three builds, and the whole file. Radios rather than buttons: the
   *  choice is one of four, and a radiogroup is arrowed through and spoken as
   *  "2 of 4" without any of that having to be written. */
  _buildProjects() {
    const host = el('projects');
    if (!host || !this.projects.length) return;

    const counts = new Map(this.projects.map((p) => [p.key,
      this.data.nodes.filter((n) => (n.projects || []).includes(p.key)).length]));

    const row = (key, label, n) => `
      <label class="check proj">
        <input type="radio" name="project" value="${esc(key)}"
               ${key === this.activeProject ? 'checked' : ''}>
        <span class="label">${esc(label)}</span>
        <span class="n">${n}</span>
      </label>`;

    host.innerHTML = this.projects.map((p) =>
      row(p.key, p.label, counts.get(p.key))).join('') +
      row('', 'All', this.data.nodes.length);

    host.addEventListener('change', (ev) => {
      if (ev.target.name !== 'project') return;
      this.activeProject = ev.target.value || null;
      this.setDrawer(false);
      this.h.onProject();
    });
  }

  /** Turns a category back on from code, for a search landing on an entity the
   *  filters are holding back. A node is hidden by its category and by
   *  nothing else, so this is the whole of what it takes to make one drawable. */
  enableCategory(key) {
    if (this.activeCategories.has(key)) return false;
    this.activeCategories.add(key);
    const input = document.querySelector(`input[data-category="${key}"]`);
    if (input) {
      input.checked = true;
      input.closest('.check').classList.remove('off');
    }
    this.syncFilterCount();
    return true;
  }

  /** Moves the switch from code — a search landing outside the build in focus,
   *  say. The radio is updated too, or the sidebar would be describing a map
   *  that is no longer on the screen. */
  setProject(key) {
    this.activeProject = key || null;
    const input = el('projects')
      && el('projects').querySelector(`input[value="${key || ''}"]`);
    if (input) input.checked = true;
  }

  /** What the map is showing, for the readout that follows a switch. */
  projectLabel() {
    const p = this.activeProject ? this.projectByKey.get(this.activeProject) : null;
    return p ? p.label : 'the whole map';
  }

  /** Everything in a build, or everything in the file when none is in focus.
   *  The filters sit on top of the build, so their counts have to be of the
   *  build — a legend reading "Person 24" over a map of twenty-two entities is
   *  a legend describing something the reader is not looking at. */
  inFocus(x) {
    return !this.activeProject || (x.projects || []).includes(this.activeProject);
  }

  _countNodes(catKey) {
    return this.data.nodes.filter((n) => n.category === catKey && this.inFocus(n)).length;
  }

  /** Re-counts the legend, the connection types and the tiers after a switch.
   *  The rows themselves are untouched: only the numbers on them change. */
  syncCounts() {
    for (const cell of document.querySelectorAll('[data-count-cat]')) {
      cell.textContent = String(this._countNodes(cell.dataset.countCat));
    }
    const edges = this.data.edges.filter((e) => this.inFocus(e));
    for (const cell of document.querySelectorAll('[data-count-type]')) {
      cell.textContent = String(edges.filter((e) => e.type === cell.dataset.countType).length);
    }
    for (const cell of document.querySelectorAll('[data-count-tier]')) {
      cell.textContent = String(edges.filter((e) => e.tier === Number(cell.dataset.countTier)).length);
    }
  }

  _buildLegend() {
    const host = el('legend');
    host.innerHTML = this.data.taxonomy.hueFamilies.map((fam) => {
      const cats = this.data.taxonomy.categories.filter((c) => c.family === fam.key);
      // The note rides on title for the pointer and on aria-describedby for
      // everyone else — title alone reaches neither a keyboard nor a fingertip.
      const rows = cats.map((c) => {
        const note = c.note || '';
        const nid = `cat-note-${c.key}`;
        return `
        <label class="check" data-cat="${c.key}" title="${esc(note || c.label)}">
          <input type="checkbox" checked data-category="${c.key}"${
            note ? ` aria-describedby="${nid}"` : ''}>
          ${swatchSVG(c.shape, c.fill, this.hue(fam.key))}
          <span class="label">${esc(c.label)}</span>
          <span class="n" data-count-cat="${c.key}">${this._countNodes(c.key)}</span>
          ${note ? `<span class="visually-hidden" id="${nid}">${esc(note)}</span>` : ''}
        </label>`;
      }).join('');
      return `<div class="family">
        <span class="family-label">${esc(fam.label)}</span>${rows}</div>`;
    }).join('');

    host.addEventListener('change', (ev) => {
      const key = ev.target.dataset.category;
      if (!key) return;
      ev.target.checked ? this.activeCategories.add(key) : this.activeCategories.delete(key);
      ev.target.closest('.check').classList.toggle('off', !ev.target.checked);
      this.syncFilterCount();
      this.h.onFilter();
    });

    el('legend-toggle').addEventListener('click', () => {
      const all = this.activeCategories.size === this.data.taxonomy.categories.length;
      host.querySelectorAll('input[data-category]').forEach((i) => {
        i.checked = !all;
        i.closest('.check').classList.toggle('off', all);
      });
      this.activeCategories = all ? new Set()
        : new Set(this.data.taxonomy.categories.map((c) => c.key));
      this.syncFilterCount();
      this.h.onFilter();
    });
  }

  _buildTypes() {
    const host = el('types');
    const counts = new Map();
    for (const e of this.data.edges) {
      if (this.inFocus(e)) counts.set(e.type, (counts.get(e.type) || 0) + 1);
    }
    host.innerHTML = this.data.taxonomy.connectionTypes.map((t) => {
      const note = t.note || '';
      const nid = `type-note-${t.key}`;
      return `
      <label class="check" title="${esc(note)}">
        <input type="checkbox" checked data-type="${t.key}"${
          note ? ` aria-describedby="${nid}"` : ''}>
        <span class="label">${esc(t.label)}</span>
        <span class="n" data-count-type="${t.key}">${counts.get(t.key) || 0}</span>
        ${note ? `<span class="visually-hidden" id="${nid}">${esc(note)}</span>` : ''}
      </label>`;
    }).join('');

    host.addEventListener('change', (ev) => {
      const key = ev.target.dataset.type;
      if (!key) return;
      ev.target.checked ? this.activeTypes.add(key) : this.activeTypes.delete(key);
      ev.target.closest('.check').classList.toggle('off', !ev.target.checked);
      this.syncFilterCount();
      this.h.onFilter();
    });
  }

  _buildTiers() {
    const host = el('tiers');
    const counts = new Map();
    for (const e of this.data.edges) {
      if (this.inFocus(e)) counts.set(e.tier, (counts.get(e.tier) || 0) + 1);
    }
    host.innerHTML = [1, 2, 3].map((t) => `
      <label class="check tier-row">
        <input type="checkbox" checked data-tier="${t}">
        ${tierLineSVG(t, t === 3 ? '--ink-muted' : '--edge-strong')}
        <span class="label">${esc(TIER[t].label)}</span>
        <span class="n" data-count-tier="${t}">${counts.get(t) || 0}</span>
      </label>`).join('');

    host.addEventListener('change', (ev) => {
      const t = Number(ev.target.dataset.tier);
      if (!t) return;
      ev.target.checked ? this.activeTiers.add(t) : this.activeTiers.delete(t);
      ev.target.closest('.check').classList.toggle('off', !ev.target.checked);
      this.syncFilterCount();
      this.h.onFilter();
    });
  }

  /** The time key: the age ring's ramp. */
  _buildAgeKey() {
    const [t0, t1] = this.data.meta.timeExtent;
    el('age-key').innerHTML = `
      <div class="age-ramp">
        <span>${new Date(t0).getUTCFullYear()}</span>
        <span class="bar"></span>
        <span>${new Date(t1).getUTCFullYear()}</span>
      </div>`;
  }

  // -------------------------------------------------------------- search ---

  /** The ARIA 1.2 combobox pattern. The previous markup was a listbox holding
   *  buttons, which is not a thing: a listbox's children must be options, and
   *  aria-selected on a button is discarded. Focus stays in the input and the
   *  active option is named by aria-activedescendant, so arrowing through the
   *  results is spoken instead of silent. */
  _buildSearch() {
    const input = el('search');
    const list = el('suggest');
    const status = el('search-status');
    let cursor = -1;

    const options = () => [...list.querySelectorAll('[role="option"]')];

    const close = () => {
      list.innerHTML = '';
      cursor = -1;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    };

    const results = (q) => {
      const s = q.trim().toLowerCase();
      if (!s) return [];
      return this.data.nodes
        .map((n) => {
          const hay = [n.name, n.short, ...(n.aliases || [])].join(' ').toLowerCase();
          const i = hay.indexOf(s);
          return i < 0 ? null : { n, rank: i + (n.name.toLowerCase().startsWith(s) ? -50 : 0) };
        })
        .filter(Boolean)
        .sort((a, b) => a.rank - b.rank || b.n.degree - a.n.degree)
        .slice(0, 9)
        .map((r) => r.n);
    };

    const render = (items) => {
      list.innerHTML = items.map((n, i) => {
        const cat = this.catById.get(n.category);
        return `<div class="s-opt" role="option" id="suggest-opt-${i}"
                     aria-selected="false" data-id="${esc(n.id)}">
          ${swatchSVG(cat.shape, cat.fill, this.hue(n.family), 14)}
          <span class="s-name">${esc(n.name)}</span>
          <span class="s-cat">${esc(cat.label)}</span>
        </div>`;
      }).join('');
      cursor = -1;
      input.setAttribute('aria-expanded', 'true');
      input.removeAttribute('aria-activedescendant');
    };

    const announce = (n) => {
      status.textContent = n === 0 ? 'No matches.'
        : `${n} ${n === 1 ? 'match' : 'matches'}. Use the up and down arrow keys to review them.`;
    };

    const moveCursor = (delta) => {
      const opts = options();
      if (!opts.length) return;
      cursor = (cursor + delta + opts.length) % opts.length;
      opts.forEach((o, i) => o.setAttribute('aria-selected', String(i === cursor)));
      input.setAttribute('aria-activedescendant', opts[cursor].id);
      opts[cursor].scrollIntoView({ block: 'nearest' });
    };

    const choose = (id) => {
      close();
      input.value = '';
      status.textContent = '';
      this.setDrawer(false);
      // Deliberately no blur() here: _openPanel takes focus to the panel that
      // is opening. Blurring used to drop focus onto <body>.
      this.h.onPick(id);
    };

    input.addEventListener('input', () => {
      const items = results(input.value);
      items.length ? render(items) : close();
      announce(input.value.trim() ? items.length : 0);
      if (!input.value.trim()) status.textContent = '';
    });

    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { close(); return; }
      if (!options().length) return;
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        moveCursor(ev.key === 'ArrowDown' ? 1 : -1);
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        const opts = options();
        choose(opts[Math.max(0, cursor)].dataset.id);
      }
    });

    list.addEventListener('click', (ev) => {
      const o = ev.target.closest('[role="option"]');
      if (o) choose(o.dataset.id);
    });

    el('search-clear').addEventListener('click', () => {
      input.value = '';
      close();
      status.textContent = '';
      input.focus();
    });
    document.addEventListener('click', (ev) => {
      if (!ev.target.closest('.search-wrap')) close();
    });
  }

  // -------------------------------------------------------------- drawer ---

  /** Below the small-screen breakpoint the sidebar is a drawer over the map.
   *  Above it the class does nothing, so the same wiring runs at every width
   *  and there is no size to watch for. */
  _buildDrawer() {
    const bar = el('sidebar');
    const scrim = el('scrim');
    const toggle = el('open-menu');
    // The drawer only exists under the breakpoint. Above it the sidebar is an
    // ordinary column and must never be sealed off.
    const narrow = window.matchMedia('(max-width: 900px)');

    /** A drawer shut by transform alone is still in the tab order — 25 controls
     *  of it, off the left edge of the screen. */
    const syncInert = () => {
      const open = bar.classList.contains('open');
      bar.inert = narrow.matches && !open;
      // While the drawer is over the map, the map is not reachable behind it.
      const behind = narrow.matches && open;
      el('stage').inert = behind;
      el('timeline').inert = behind;
    };

    // Escape dismisses the innermost open thing, and over a phone the drawer is
    // one of those things — so it joins the same stack the dialogs are on
    // rather than keeping a second Escape handler of its own.
    const layer = { close: () => { set(false); toggle.focus(); } };

    const set = (open) => {
      const was = bar.classList.contains('open');
      if (open && !was) pushLayer(layer);
      else if (!open && was) popLayer(layer);
      bar.classList.toggle('open', open);
      scrim.hidden = false;
      scrim.classList.toggle('show', open);
      toggle.setAttribute('aria-expanded', String(open));
      syncInert();
      if (open && !was && narrow.matches) {
        el('sidebar-close').focus({ preventScroll: true });
      } else if (!open && was && narrow.matches && document.activeElement === document.body) {
        toggle.focus({ preventScroll: true });
      }
    };
    this.setDrawer = set;
    syncInert();
    narrow.addEventListener('change', syncInert);

    toggle.addEventListener('click', () => set(!bar.classList.contains('open')));
    el('sidebar-close').addEventListener('click', () => { set(false); toggle.focus(); });
    scrim.addEventListener('click', () => { set(false); toggle.focus(); });
  }

  // --------------------------------------------------------------- panel ---

  _buildPanel() {
    const panel = el('panel');
    panel.setAttribute('tabindex', '-1');
    // Closed, the panel is parked off-screen by a transform — which hides it
    // from the eye and from nothing else.
    panel.inert = true;
    this._panelOpener = null;
    el('panel-close').addEventListener('click', () => this.closePanel());
    el('panel').addEventListener('click', (ev) => {
      const edge = ev.target.closest('[data-edge]');
      if (edge) { this.h.onPickEdge(edge.dataset.edge); return; }
      const b = ev.target.closest('[data-goto]');
      if (b) { this.setDrawer(false); this.h.onPick(b.dataset.goto); }
    });
  }

  closePanel() {
    const panel = el('panel');
    const wasOpen = panel.classList.contains('open');
    panel.classList.remove('open');
    panel.inert = true;
    el('stage').classList.remove('panel-open');
    // Focus cannot be left standing on a control that just went inert.
    if (wasOpen) {
      const back = this._panelOpener && document.contains(this._panelOpener)
        ? this._panelOpener : el('canvas');
      try { back.focus({ preventScroll: true }); } catch { /* gone */ }
    }
    this._panelOpener = null;
    this.h.onClosePanel();
  }

  // Every cited file sits beside index.html, under evidence/, so a doc path is
  // already the href — no prefix. Six of the cited filenames carry spaces, so the
  // path is percent-encoded before it is used as one.
  _docHref(path) { return encodeURI(String(path)); }

  _citeDate(c) {
    if (!c.date) return null;
    const n = String(c.date).length;
    return formatDate({ t: Date.parse(c.date),
      precision: n === 4 ? 'year' : n === 7 ? 'month' : 'day' });
  }

  /** Citations marked `preview` are drawn, not only listed. They sit directly under
   *  the summary, against the prose that describes them, and each one still carries
   *  its label and date — a figure here is a source, not an illustration. The full
   *  excerpt and the links stay on the citation's own card further down, so the
   *  image appears once and the record of it appears once. */
  _platesHTML(citations) {
    const shown = citations.filter((c) => c.preview && c.doc);
    if (!shown.length) return '';
    const plates = shown.map((c) => {
      const date = this._citeDate(c);
      const href = this._docHref(c.doc);
      // The caption is the citation's label, which is often the same short words on
      // two different photographs. The alt text has to tell them apart, so it comes
      // from the excerpt — the sentence that says what is actually in the frame.
      const alt = c.excerpt
        ? String(c.excerpt).trim().split(/(?<=\.)\s/)[0] : c.label;
      return `<figure class="plate">
        <a href="${esc(href)}" target="_blank" rel="noopener"
           title="Open the full-size file">
          <img src="${esc(href)}" alt="${esc(alt)}" loading="lazy" decoding="async">
        </a>
        <figcaption>${esc(c.label)}${
          date ? `<span class="plate-date">${esc(date)}</span>` : ''}</figcaption>
      </figure>`;
    }).join('');
    return `<div class="p-plates${shown.length === 1 ? ' p-plates-one' : ''}">${plates}</div>`;
  }

  _citationHTML(c) {
    const date = this._citeDate(c);
    const quote = c.excerpt
      ? `<blockquote>${esc(String(c.excerpt).trim())}</blockquote>` : '';
    const link = c.doc
      ? `<a class="doc" href="${esc(this._docHref(c.doc))}" target="_blank" rel="noopener">${esc(c.doc)}</a>`
      : `<span class="ext">External source, not in evidence/</span>`;
    // The archived copy is the source of the claim and never moves. The live url,
    // where one exists, is where the same source can be read today — a reader's own
    // check on it, and the thing that can rot. Both are shown; the archived one first.
    const live = c.url
      ? `<a class="live" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">
           <span class="live-tag">Live</span>${esc(c.urlLabel || hostOf(c.url))}</a>`
      : '';
    return `<div class="cite">
      <div class="cite-head">
        <span class="cite-label">${esc(c.label || c.doc || c.external)}</span>
        ${date ? `<span class="cite-date">${esc(date)}</span>` : ''}
      </div>
      ${quote}<div class="cite-links">${link}${live}</div>
    </div>`;
  }

  // The chain of title, which the three sites carry in place of a flat source list.
  // Each step is a conveyance: who the interest passed out of, who it passed to, and
  // the instrument that says so. The order is itself the claim, so the steps are an
  // ordered list with the flow of ownership drawn between them, and a step the record
  // does not establish says so in its own words rather than being quietly dropped.
  _chainHTML(chain) {
    const steps = chain.map((s) => `<li class="chain-step">
      <div class="chain-flow">
        <span class="chain-party">${esc(s.from)}</span>
        <span class="chain-to" aria-hidden="true">→</span>
        <span class="chain-party">${esc(s.to)}</span>
      </div>
      ${s.date || s.interest ? `<div class="chain-meta">${
        [s.date ? formatDate(s.date) : null, s.interest]
          .filter(Boolean).map((x) => esc(x)).join(' · ')}</div>` : ''}
      ${s.note ? `<p class="chain-note">${esc(s.note)}</p>` : ''}
      ${s.citations.map((c) => this._citationHTML(c)).join('')}
    </li>`).join('');
    return `<div class="p-section">Chain of title · ${chain.length} step${
      chain.length === 1 ? '' : 's'}</div><ol class="chain">${steps}</ol>`;
  }

  /** What opens an entity's panel: the same mark the map draws inside its
   *  glyph, at reading size, so opening a node shows what clicking it showed.
   *
   *  A person always has one — their portrait where the file carries one, and
   *  the blank avatar where it does not, because an absent portrait is a gap
   *  in what we have rather than a fact about the person, and must not read as
   *  a thinner entry. An organisation gets its logo where the file has one and
   *  nothing at all where it does not: there is no blank logo to fall back to,
   *  since a wordmark is only a convenience for recognising a company and not
   *  having one says nothing whatever about it. Those panels keep the layout
   *  they had before there were any logos here.
   *
   *  Both marks are decorative, and their alt text is empty on purpose: the
   *  name they belong to is the next line, and a screen reader saying it twice
   *  is worse than not saying it at all. */
  _faceHTML(node) {
    const hue = this.hue(node.family);
    if (node.category === 'person') {
      if (!node.image) return `<div class="p-face">${avatarSVG(hue, 80)}</div>`;
      return `<div class="p-face p-face-photo" style="color:var(${hue})">
        <img src="${esc(this._docHref(node.image))}" alt="" loading="lazy" decoding="async">
      </div>`;
    }
    if (!node.logo) return '';
    // The plate follows the artwork, not the theme: a mark drawn in white for
    // a dark site header is white in both modes, and a plate that flipped with
    // the theme would erase it in one of them.
    const plate = node.logoOn === 'dark' ? 'p-mark-dark' : 'p-mark-light';
    return `<div class="p-mark ${plate}" style="color:var(${hue})">
      <img src="${esc(this._docHref(node.logo))}" alt="" loading="lazy" decoding="async">
    </div>`;
  }

  showNode(node) {
    const cat = this.catById.get(node.category);
    const date = formatDate(node.date);
    const related = this.data.edges
      .filter((e) => e.sourceId === node.id || e.targetId === node.id)
      .map((e) => {
        const otherId = e.sourceId === node.id ? e.targetId : e.sourceId;
        const other = this.nodeById.get(otherId);
        const dir = e.sourceId === node.id ? '' : '← ';
        const oc = this.catById.get(other.category);
        // The row opens the CONNECTION, so its citation is one click away —
        // an edge's sources must be reachable, not only a node's.
        return `<button class="rel" data-edge="${esc(e.id)}"
                  title="Show the document behind this connection">
          <span class="rel-name">${swatchSVG(oc.shape, oc.fill, this.hue(other.family), 13)}
            ${esc(other.name)}</span>
          <span class="rel-desc">${esc(dir)}${esc(e.label)}${
            e.date ? ` · ${esc(formatDate(e.date))}` : ''}${
            e.tier === 3 ? ' · unresolved' : e.tier === 2 ? ' · attributed' : ''} ·
            ${e.citations.length} source${e.citations.length === 1 ? '' : 's'}</span>
        </button>`;
      }).join('');

    el('panel-body').innerHTML = `
      <div class="p-head">
        ${this._faceHTML(node)}
        <div class="p-head-text">
          <div class="p-kicker">${swatchSVG(cat.shape, cat.fill, this.hue(node.family), 15)}
            <span>${esc(cat.label)}</span>
            ${node.tier !== 1 ? `<span>· ${esc(TIER[node.tier].label)}</span>` : ''}
            ${recencyOf(node.date) ? `<span class="p-new">New</span>` : ''}</div>
          <h2 class="p-title">${esc(node.name)}</h2>
          ${date ? `<p class="p-date">${esc(date)}${
            node.dateNote ? ` · ${esc(node.dateNote)}` : ''}</p>` : ''}
        </div>
      </div>
      <p class="p-body">${esc(node.summary)}</p>
      ${this._platesHTML(node.citations)}
      ${node.caveat ? `<p class="p-caveat"><b>What this does not establish.</b>
        ${esc(node.caveat)}</p>` : ''}
      ${node.chain && node.chain.length
        ? this._chainHTML(node.chain) + (node.citations.length
          ? `<div class="p-section">Also on file · ${node.citations.length}</div>
             ${node.citations.map((c) => this._citationHTML(c)).join('')}` : '')
        : `<div class="p-section">Sources · ${node.citations.length}</div>
           ${node.citations.map((c) => this._citationHTML(c)).join('')}`}
      <details class="p-fold">
        <summary class="p-section p-fold-head">Connections · ${
          this.data.edges.filter((e) => e.sourceId === node.id || e.targetId === node.id).length
        }<span class="p-fold-hint">on the map</span></summary>
        ${related}
      </details>`;
    this._openPanel();
  }

  _openPanel() {
    const panel = el('panel');
    const wasOpen = panel.classList.contains('open');
    // Where to send focus back to. A .rel button inside the panel swaps the
    // panel's own contents, so it is not a destination to return to.
    if (!wasOpen) {
      const a = document.activeElement;
      this._panelOpener = (a && a !== document.body && !panel.contains(a)) ? a : el('canvas');
    }
    panel.inert = false;
    panel.classList.add('open');
    el('stage').classList.add('panel-open');
    panel.scrollTop = 0;
    // The panel is the content that was just asked for, so focus follows it —
    // and a keyboard user is no longer dropped onto <body>.
    panel.focus({ preventScroll: true });
  }

  showEdge(edge) {
    const s = this.nodeById.get(edge.sourceId);
    const t = this.nodeById.get(edge.targetId);
    const type = this.typeById.get(edge.type);
    el('panel-body').innerHTML = `
      <div class="p-kicker"><span>${esc(type.label)}</span>
        <span>· ${esc(TIER[edge.tier].label)}</span></div>
      <h2 class="p-title">${esc(s.short)} <span class="p-verb">${esc(edge.label)}</span> ${esc(t.short)}</h2>
      ${edge.date ? `<p class="p-date">${esc(formatDate(edge.date))}</p>` : ''}
      ${edge.because ? `<p class="p-because"><span class="p-because-arrow">↳</span> ${esc(edge.because)}</p>` : ''}
      ${edge.summary ? `<p class="p-body">${esc(edge.summary)}</p>` : ''}
      ${edge.resolves ? `<p class="p-caveat"><b>What would resolve this.</b>
        ${esc(edge.resolves)}</p>` : ''}
      <div class="p-section">Sources · ${edge.citations.length}</div>
      ${edge.citations.map((c) => this._citationHTML(c)).join('')}
      <div class="p-section">Endpoints</div>
      <button class="rel" data-goto="${esc(s.id)}"><span class="rel-name">${esc(s.name)}</span>
        <span class="rel-desc">from · open this entity</span></button>
      <button class="rel" data-goto="${esc(t.id)}"><span class="rel-name">${esc(t.name)}</span>
        <span class="rel-desc">to · open this entity</span></button>`;
    this._openPanel();
  }

  // ------------------------------------------------------- developments ---

  /** Recent developments: the curated list, and the dialog behind each entry.
   *
   *  This is the one part of the interface that is written rather than derived,
   *  and it says so. An entry is an event — the Warsaw tract changing hands —
   *  where the file itself holds four deeds and a permit, and no arrangement of
   *  those five rows adds up to the sentence a reader wants. So the sentence is
   *  authored, in data/developments.yaml, and the documents it rests on come
   *  with it: every entry opens onto its own sources, cited the same way a node
   *  or an edge cites its own. */
  _buildDevelopments() {
    const host = el('developments');
    const group = el('developments-group');
    if (!host) return;
    const items = this.data.developments || [];
    if (!items.length) {
      if (group) group.hidden = true;
      return;
    }

    host.innerHTML = `<ul class="dev-list">${items.map((d) => `
      <li><button class="dev-go" data-dev="${esc(d.id)}" aria-haspopup="dialog">
        <span class="dev-title">${esc(d.title)}</span>
        <span class="dev-meta">
          ${d.live ? '<span class="dev-live">Live</span>' : ''}
          <span class="dev-when">${esc(formatDate(d.date))}</span>
          ${d.kind ? `<span class="dev-kind">${esc(d.kind)}</span>` : ''}
        </span>
        <span class="dev-summary">${esc(d.summary)}</span>
      </button></li>`).join('')}</ul>`;

    const byDevId = new Map(items.map((d) => [d.id, d]));
    const dialog = new Dialog({ id: 'development-modal', label: 'Recent development' });
    this._devDialog = dialog;

    host.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-dev]');
      if (!b) return;
      const d = byDevId.get(b.dataset.dev);
      if (d) this.showDevelopment(d);
    });

    // An entity named in a development is a way into the map, not a footnote:
    // the dialog closes, the drawer with it, and the map goes where it says.
    dialog.el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-goto]');
      if (!b) return;
      dialog.close();
      this.setDrawer(false);
      this.h.onPick(b.dataset.goto);
    });
  }

  showDevelopment(d) {
    if (!this._devDialog) return;
    const links = (d.entities || []).map((id) => this.nodeById.get(id)).filter(Boolean);
    this._devDialog.el.setAttribute('aria-label', d.title);
    this._devDialog.setBody(`
      <div class="p-kicker"><span>Recent development</span>${
        d.kind ? `<span>· ${esc(d.kind)}</span>` : ''}${
        d.live ? '<span class="dev-live">Live</span>' : ''}</div>
      <h2 class="p-title">${esc(d.title)}</h2>
      <p class="p-date">${esc(formatDate(d.date))}${
        d.dateNote ? ` · ${esc(d.dateNote)}` : ''}</p>
      ${d.detail.map((para) => `<p class="p-body">${esc(para)}</p>`).join('')}
      <div class="p-section">Sources · ${d.citations.length}</div>
      ${d.citations.map((c) => this._citationHTML(c)).join('')}
      ${links.length ? `<div class="p-section">On the map · ${links.length}</div>${
        links.map((n) => {
          const cat = this.catById.get(n.category);
          return `<button class="rel" data-goto="${esc(n.id)}">
            <span class="rel-name">${swatchSVG(cat.shape, cat.fill, this.hue(n.family), 13)}
              ${esc(n.name)}</span>
            <span class="rel-desc">${esc(cat.label)} · open this entity</span>
          </button>`;
        }).join('')}` : ''}`);
    this._devDialog.open();
  }

  // --------------------------------------------------------------- panels ---

  /** The counts a panel's prose interpolates, so no panel can state a number
   *  the build would disagree with. */
  _panelVars() {
    const m = this.data.meta;
    return {
      nodeCount: m.nodeCount,
      edgeCount: m.edgeCount,
      documentCount: m.documentCount,
      recentPhrase: RECENT_PHRASE,
    };
  }

  /** One panel from data/panels.yaml, in a dialog of its own. Four of these
   *  used to be four hundred lines of template literal and four copies of the
   *  same focus routine. */
  _panel(key, id, opener, width) {
    const p = (this.data.panels || {})[key];
    if (!p) return null;
    const d = new Dialog({ id, label: p.label || p.title, width });
    d.setBody(renderPanel(p, {
      vars: this._panelVars(),
      nonClaims: this.data.nonClaims || {},
    }));
    if (opener && el(opener)) d.openedBy(opener);
    return d;
  }

  _buildModal() { this._panel('notClaimed', 'modal', 'open-modal'); }

  _buildTiplineModal() { this._panel('tipline', 'tipline-modal', 'open-tipline'); }

  _buildShortcutsModal() {
    this._panel('shortcuts', 'shortcuts-modal', 'open-shortcuts', 'narrow');
  }

  _buildPrivacyModal() { this._panel('privacy', 'privacy-modal', 'open-privacy'); }

  _buildTermsModal() { this._termsModal = this._panel('terms', 'terms-modal', 'open-terms'); }

  // ------------------------------------------------------------- filters ---

  /** The category, connection, tier and time filters used to be five panels of
   *  the sidebar, which put the map's opening question — which build am I
   *  looking at — below a fold of controls most readers never touch. They live
   *  in a dialog now. This is the one dialog whose markup stays in index.html:
   *  it is a rack of live controls rather than prose, and _buildLegend and the
   *  rest still write into the same four elements. */
  _buildFiltersModal() {
    const host = el('filters-modal');
    if (!host) return;
    const dialog = new Dialog({ id: 'filters-modal', el: host, width: 'mid' });
    dialog.openedBy('open-filters');
    this.closeFilters = () => dialog.close();

    el('filters-reset').addEventListener('click', () => {
      this.activeCategories = new Set(this.data.taxonomy.categories.map((c) => c.key));
      this.activeTypes = new Set(this.data.taxonomy.connectionTypes.map((t) => t.key));
      this.activeTiers = new Set([1, 2, 3]);
      for (const input of host.querySelectorAll('input[type="checkbox"]')) {
        input.checked = true;
        input.closest('.check').classList.remove('off');
      }
      this.syncFilterCount();
      this.h.onFilter();
    });

    this.syncFilterCount();
  }

  /** How many filters are currently holding something back. A control that has
   *  been put behind a button has to say when it is doing something, or a map
   *  drawing two thirds of what it should looks like a map that is broken. */
  syncFilterCount() {
    const badge = el('filters-count');
    if (!badge) return;
    const off = (this.data.taxonomy.categories.length - this.activeCategories.size) +
      (this.data.taxonomy.connectionTypes.length - this.activeTypes.size) +
      (3 - this.activeTiers.size);
    badge.hidden = off === 0;
    badge.textContent = String(off);
    el('open-filters').setAttribute('aria-label', off
      ? `Filters: ${off} of them narrowing the map`
      : 'Filters');
  }

  // ------------------------------------------------------------ consent ---

  /** Said once, to everyone, before anything else on the page: continuing
   *  past this is agreeing to the terms of use, and in particular to the
   *  acceptable-use section, quoted here so no one has to leave the page to
   *  find it before agreeing to it.
   *
   *  Not a panel: no ✕ in the corner, not dismissible by a backdrop click or
   *  Escape, so agreeing is the only way out — and closing it is what records
   *  that it has been read. Two buttons at the foot rather than one: the
   *  terms panel opens on top of this note, so the full terms can be read
   *  before anything is agreed to or the map is ever seen, and closing that
   *  panel returns here rather than dropping straight to the map underneath. */
  _buildConsentNote() {
    const n = (this.data.panels || {}).consent;
    if (!n) return;
    const vars = this._panelVars();
    const dialog = new Dialog({
      id: 'consent-note',
      label: n.label || n.title,
      closeButton: false,
      dismissible: false,
      width: 'mid',
    });
    dialog.setBody(`
      <h2>${inline(n.title, vars)}</h2>
      ${(n.paragraphs || []).map((p) => `<p>${inline(p, vars)}</p>`).join('')}
      <div class="consent-actions">
        <button type="button" id="consent-note-terms">${esc(n.linkLabel)}</button>
        <button id="consent-note-agree" data-close type="button">${esc(n.button)}</button>
      </div>`);
    dialog.onClose = () => {
      try { localStorage.setItem(CONSENT_KEY, '1'); } catch { /* private mode */ }
      this.showMobileNote();
    };
    const termsBtn = el('consent-note-terms');
    if (termsBtn) termsBtn.addEventListener('click', () => { if (this._termsModal) this._termsModal.open(); });
    this._consentNote = dialog;
  }

  /** Opens it, unless it has already been agreed to — in which case the
   *  small-screen note gets its turn instead, exactly as it would once this
   *  one closed. Called once the map is painted, so the note arrives over
   *  the thing it is about rather than over an empty plane. */
  showConsentNote() {
    let seen = false;
    try { seen = localStorage.getItem(CONSENT_KEY) === '1'; } catch { /* private mode */ }
    if (seen || !this._consentNote) { this.showMobileNote(); return; }
    this._consentNote.open(el('consent-note-agree'));
  }

  // --------------------------------------------------- small-screen note ---

  /** Said once, to whoever arrives on a phone: the map is usable here, and it
   *  is still a picture that wants more room than a phone has. Dismissal is
   *  remembered, because a disclaimer that reappears on every visit stops
   *  being read and starts being swatted.
   *
   *  Not a panel: no ✕ in the corner, one button at the foot, and closing it
   *  is what records that it has been read — however it was closed. */
  _buildMobileNote() {
    const n = (this.data.panels || {}).mobileNote;
    if (!n) return;
    const vars = this._panelVars();
    const dialog = new Dialog({
      id: 'mobile-note',
      label: n.label || n.title,
      closeButton: false,
      width: 'narrow',
    });
    dialog.setBody(`
      <h2>${inline(n.title, vars)}</h2>
      ${(n.paragraphs || []).map((p) => `<p>${inline(p, vars)}</p>`).join('')}
      <button id="mobile-note-close" data-close type="button">${esc(n.button)}</button>`);
    dialog.onClose = () => {
      try { localStorage.setItem(NOTE_KEY, '1'); } catch { /* private mode */ }
    };
    this._mobileNote = dialog;
  }

  /** Opens it, unless this is a wide screen or it has been dismissed before.
   *  Called once the map is painted, so the note arrives over the thing it is
   *  a note about rather than over an empty plane. */
  showMobileNote() {
    let seen = false;
    try { seen = localStorage.getItem(NOTE_KEY) === '1'; } catch { /* private mode */ }
    if (seen || !this._mobileNote) return;
    if (window.matchMedia && !window.matchMedia('(max-width: 900px)').matches) return;
    this._mobileNote.open(el('mobile-note-close'));
  }

  // ------------------------------------------------------------- tooltip ---

  showTooltip(node, pt) {
    const tip = el('tooltip');
    if (!node) { tip.classList.remove('show'); return; }
    const cat = this.catById.get(node.category);
    const date = formatDate(node.date);
    tip.innerHTML = `
      <div class="t-name">${esc(node.name)}</div>
      <div class="t-meta">${swatchSVG(cat.shape, cat.fill, this.hue(node.family), 12)}
        <span>${esc(cat.label)}</span>${date ? `<span>· ${esc(date)}</span>` : ''}${
        recencyOf(node.date) ? `<span class="t-new">New</span>` : ''}</div>
      <div class="t-cites">${node.citations.length} source${
        node.citations.length === 1 ? '' : 's'} · ${node.degree} connection${
        node.degree === 1 ? '' : 's'}${node.tier === 3 ? ' · unresolved' : ''}</div>`;
    tip.classList.add('show');
    const stage = el('stage').getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    tip.style.left = `${Math.min(pt.x + 16, stage.width - w - 10)}px`;
    tip.style.top = `${Math.max(8, Math.min(pt.y + 16, stage.height - h - 10))}px`;
  }
}

MAP.UI = UI;
MAP.formatDate = formatDate;
MAP.esc = esc;
}(window.MAP));
