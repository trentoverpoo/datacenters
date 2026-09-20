// One dialog, wired once — and the renderer that turns data/panels.yaml into one.
//
// Five dialogs on this site each used to carry a private copy of the same
// routine: add a class, seal the background, move focus in, watch for Escape,
// watch for a click on the backdrop, put focus back on the way out. Five copies
// is five places to fix the same accessibility bug in, and four of them to
// forget. The words were no better off: every panel was a template literal of
// HTML in the middle of ui.js, so changing a sentence meant editing JavaScript.
//
// So the mechanics are here, once, and the words are in data/panels.yaml. A
// dialog does not know what it says; a panel does not know how it opens.

(function (MAP) {
'use strict';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Makes everything outside `keep` unreachable — to the pointer, to Tab, and
 *  to a screen reader's own cursor. `inert` is what aria-modal only promises:
 *  aria-hidden on a container full of buttons is itself a violation, and a
 *  hand-rolled Tab trap does nothing about a virtual cursor. */
function setBackgroundInert(keep) {
  for (const child of document.body.children) {
    if (child === keep) child.inert = false;
    else child.inert = !!keep;
  }
}

/** Opens a dialog: remembers the opener, seals the background, moves focus in.
 *  Returns the close half, which puts all three back. */
function dialogFocus(dialog, firstFocus) {
  const opener = document.activeElement;
  setBackgroundInert(dialog);
  const target = firstFocus || dialog.querySelector('button, [href], input, [tabindex]') || dialog;
  if (target === dialog && !dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
  try { target.focus({ preventScroll: true }); } catch { /* detached */ }
  return () => {
    setBackgroundInert(null);
    if (opener && document.contains(opener)) {
      try { opener.focus({ preventScroll: true }); } catch { /* gone */ }
    }
  };
}

// The one Escape handler on the page, over the one stack of things Escape can
// dismiss: dialogs, and the small-screen drawer. Innermost last.
//
// Two handlers cannot do this. When a dialog opens over the drawer and both
// listen for Escape, both fire on the same keystroke — the dialog closes, and
// then the drawer asks whether a dialog is open, finds none, and closes too.
// The layer that was on top is the only one the key was about, so there is one
// listener and it asks the stack.
const stack = [];
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape' || !stack.length) return;
  stack[stack.length - 1].close();
});

/** For a dismissible layer that is not a dialog — the drawer. `layer.close()`
 *  is called when Escape reaches it, and the layer removes itself as it goes. */
function pushLayer(layer) { if (!stack.includes(layer)) stack.push(layer); }
function popLayer(layer) {
  const at = stack.indexOf(layer);
  if (at >= 0) stack.splice(at, 1);
}

const CARD = '<div class="modal-card"></div>';

class Dialog {
  /** `el` adopts markup already in the page — the filters dialog, which is a
   *  rack of live controls and not prose. Everything else is built here, so a
   *  new panel is a new entry in panels.yaml and nothing in index.html. */
  constructor({ id, label, el = null, closeButton = true, width = null, body = '' }) {
    this.id = id;
    const existing = el || document.getElementById(id);
    if (existing) {
      this.el = existing;
      this.el.classList.add('dialog');
      this.body = null;
    } else {
      this.el = document.createElement('div');
      this.el.id = id;
      this.el.className = 'dialog';
      this.el.setAttribute('role', 'dialog');
      this.el.setAttribute('aria-modal', 'true');
      this.el.innerHTML = CARD;
      const card = this.el.firstElementChild;
      if (closeButton) {
        card.innerHTML = '<button class="modal-close" data-close aria-label="Close">✕</button>';
      }
      this.body = document.createElement('div');
      this.body.className = 'dialog-body';
      card.appendChild(this.body);
      document.body.appendChild(this.el);
    }
    if (label) this.el.setAttribute('aria-label', label);
    if (width) this.el.dataset.width = width;
    this.release = null;
    if (body) this.setBody(body);

    this.el.addEventListener('click', (ev) => {
      if (ev.target === this.el || ev.target.closest('[data-close]')) this.close();
    });
  }

  setBody(html) {
    if (this.body) this.body.innerHTML = html;
    return this;
  }

  get isOpen() { return this.el.classList.contains('open'); }

  /** `firstFocus` overrides where focus lands; the close button otherwise, or
   *  the first thing focusable if this dialog has no close button. */
  open(firstFocus) {
    if (this.isOpen) return this;
    this.el.classList.add('open');
    pushLayer(this);
    this.release = dialogFocus(this.el,
      firstFocus || this.el.querySelector('.modal-close') || null);
    return this;
  }

  close() {
    if (!this.isOpen) return this;
    this.el.classList.remove('open');
    popLayer(this);
    if (this.release) { this.release(); this.release = null; }
    if (this.onClose) this.onClose();
    return this;
  }

  /** Wires a button to open this dialog. */
  openedBy(button) {
    const b = typeof button === 'string' ? document.getElementById(button) : button;
    if (b) b.addEventListener('click', () => this.open());
    return this;
  }
}

// ----------------------------------------------------------- panel text ---
//
// TEXT FROM YAML IS NOT HTML. It is escaped first and always, and then exactly
// three pieces of inline markup are put back: a link, a code span and a bold
// run. The escaping happens before the markup, so a link's href is already
// attribute-safe by the time it is one — there is no path by which a character
// in panels.yaml becomes a tag.
//
// build.mjs checks every href as well, and fails on one that is not http,
// https, mailto or a path inside this site. The check here is the second of the
// two: a link that gets past the build still does not become an anchor.

const TOKENS = /\{(nodeCount|edgeCount|documentCount|recentPhrase)\}/g;
const SAFE_HREF = /^(?:https?:\/\/|mailto:)[^\s]+$/i;
const SAFE_PATH = /^[A-Za-z0-9._~/-]+(?:#[A-Za-z0-9._~-]+)?$/;

function inline(text, vars) {
  const filled = String(text ?? '').replace(TOKENS,
    (m, key) => (vars && key in vars ? String(vars[key]) : m));
  return esc(filled)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, href) => {
      const h = href.trim();
      if (!SAFE_HREF.test(h) && !SAFE_PATH.test(h)) return label;
      const away = /^https?:/i.test(h);
      return `<a href="${h}"${away ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
    })
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}

const cardHTML = (c, vars) =>
  `<div class="nc"><b>${inline(c.title, vars)}</b><span>${inline(c.body, vars)}</span></div>`;

const rowHTML = (r, vars) => `
  <div class="shortcut-row">
    <span class="keys">${r.keys.map((k) => `<kbd>${esc(k)}</kbd>`).join(' ')}</span>
    <span class="desc">${inline(r.desc, vars)}</span>
  </div>`;

/** A panel from panels.yaml, as HTML. `nonClaims` is what a section's `from`
 *  draws its cards out of, so tier-4 prose is authored in one file and shown
 *  wherever a panel asks for it.
 *
 *  A section that would render nothing is not rendered at all, its heading
 *  included: an empty list in non-claims.yaml is how "there is nothing under
 *  this heading yet" gets said, and a bare heading over white space says it
 *  much worse. */
function renderPanel(p, { vars = {}, nonClaims = {} } = {}) {
  const out = [`<h2>${inline(p.title, vars)}</h2>`];
  if (p.lede) out.push(`<p class="lede">${inline(p.lede, vars)}</p>`);

  for (const s of p.sections || []) {
    const cards = s.from ? (nonClaims[s.from] || []) : (s.cards || []);
    const body = [
      ...cards.map((c) => cardHTML(c, vars)),
      ...(s.rows || []).map((r) => rowHTML(r, vars)),
      s.note ? `<p class="note">${inline(s.note, vars)}</p>` : '',
    ].filter(Boolean);
    if (!body.length) continue;
    if (s.heading) out.push(`<h3>${inline(s.heading, vars)}</h3>`);
    out.push(body.join(''));
  }

  if (p.foot) out.push(`<p class="lede panel-foot">${inline(p.foot, vars)}</p>`);
  return out.join('');
}

MAP.Dialog = Dialog;
MAP.pushLayer = pushLayer;
MAP.popLayer = popLayer;
MAP.renderPanel = renderPanel;
MAP.inline = inline;
MAP.setBackgroundInert = setBackgroundInert;
MAP.dialogFocus = dialogFocus;
}(window.MAP = window.MAP || {}));
