/* ============================================================
   Blog de Notas – app.js
   ============================================================ */

'use strict';

// ============================================================
// Configuration & LocalStorage helpers
// ============================================================
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbzfWrvoGp56K5RpNI5NO-kK91L25NP3l68QxduSjD8a6vlKzVozksX8Ro-avo65gdBS/exec';

const Config = {
  STORAGE_KEY: 'blogNotas_notes',
  CONFIG_KEY:  'blogNotas_config',

  load() {
    try {
      const raw = localStorage.getItem(this.CONFIG_KEY);
      return raw ? JSON.parse(raw) : { apiUrl: DEFAULT_API_URL, demoMode: false };
    } catch (_) {
      return { apiUrl: DEFAULT_API_URL, demoMode: false };
    }
  },

  save(cfg) {
    localStorage.setItem(this.CONFIG_KEY, JSON.stringify(cfg));
  }
};

// ============================================================
// Notes API (wraps AppScript web app OR localStorage demo mode)
// ============================================================
class NotesAPI {
  constructor() {
    this._cfg = Config.load();
  }

  get usesLocalStorage() {
    return this._cfg.demoMode || !this._cfg.apiUrl;
  }

  // --- Local Storage helpers ---
  _lsAll() {
    try {
      const raw = localStorage.getItem(Config.STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }

  _lsSave(notes) {
    localStorage.setItem(Config.STORAGE_KEY, JSON.stringify(notes));
  }

  _genId() {
    const hex = () => Math.floor(Math.random() * 0xffffffff).toString(16).toUpperCase().padStart(8, '0');
    return 'NOTA-' + hex().substring(0, 8);
  }

  // --- AppScript call ---
  async _fetch(params) {
    const url = this._cfg.apiUrl;
    const response = await fetch(url + '?' + new URLSearchParams(params));
    if (!response.ok) throw new Error('Error HTTP ' + response.status);
    return response.json();
  }

  async _post(body) {
  const url = this._cfg.apiUrl;

  // POST "simple" (sin preflight): application/x-www-form-urlencoded
  const formBody = new URLSearchParams();
  Object.entries(body).forEach(([k, v]) => {
    // Para arrays/objetos, lo mandamos como string
    formBody.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: formBody.toString()
  });

  if (!response.ok) throw new Error('Error HTTP ' + response.status);
  return response.json();
}

  // --- Public CRUD ---
  async getAll() {
    if (this.usesLocalStorage) return this._lsAll();
    const result = await this._fetch({ action: 'getAll' });
    if (result.error) throw new Error(result.error);
    return result;
  }

  async getById(id) {
    if (this.usesLocalStorage) {
      return this._lsAll().find(n => n.ID_Nota === id) || null;
    }
    const result = await this._fetch({ action: 'getById', id });
    if (result && result.error) throw new Error(result.error);
    return result;
  }

  async create(titulo, contenido, responsable, citas = []) {
    if (this.usesLocalStorage) {
      const notes = this._lsAll();
      const nota = {
        ID_Nota: this._genId(),
        'Título': titulo,
        Contenido: contenido,
        'Fecha de Creación': new Date().toISOString(),
        Responsable: responsable,
        'Citas (IDs)': citas.join(', '),
        citas
      };
      notes.push(nota);
      this._lsSave(notes);
      return { success: true, id: nota.ID_Nota, nota };
    }
    const result = await this._post({ action: 'crear', titulo, contenido, responsable, citas });
    if (result.error) throw new Error(result.error);
    return result;
  }

  async update(id, titulo, contenido, responsable, citas = []) {
    if (this.usesLocalStorage) {
      const notes = this._lsAll();
      const idx = notes.findIndex(n => n.ID_Nota === id);
      if (idx === -1) throw new Error('Nota no encontrada');
      notes[idx] = {
        ...notes[idx],
        'Título': titulo,
        Contenido: contenido,
        Responsable: responsable,
        'Citas (IDs)': citas.join(', '),
        citas
      };
      this._lsSave(notes);
      return { success: true, id };
    }
    const result = await this._post({ action: 'actualizar', id, titulo, contenido, responsable, citas });
    if (result.error) throw new Error(result.error);
    return result;
  }

  async delete(id) {
    if (this.usesLocalStorage) {
      const notes = this._lsAll().filter(n => n.ID_Nota !== id);
      this._lsSave(notes);
      return { success: true, id };
    }
    const result = await this._post({ action: 'eliminar', id });
    if (result.error) throw new Error(result.error);
    return result;
  }
}

// ============================================================
// Application State
// ============================================================
const state = {
  notes: [],
  currentNoteId: null,
  editingNoteId: null,   // null = new note
  selectedCitations: [], // array of IDs selected in editor
  view: 'lista'
};

const api = new NotesAPI();

// ============================================================
// Utilities
// ============================================================
function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });
}

function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + type;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3200);
}

function getNoteById(id) {
  return state.notes.find(n => n.ID_Nota === id) || null;
}

function getCitations(note) {
  if (!note) return [];
  if (Array.isArray(note.citas) && note.citas.length) return note.citas;
  const raw = note['Citas (IDs)'];
  if (!raw) return [];
  return String(raw).split(',').map(s => s.trim()).filter(Boolean);
}

function setView(v) {
  // Destroy active map when leaving mapa view
  if (state.view === 'mapa' && v !== 'mapa' && _activeMap) {
    _activeMap.destroy();
    _activeMap = null;
  }
  document.querySelectorAll('.view').forEach(el => {
    el.classList.add('hidden');
    el.classList.remove('active');
  });
  const el = document.getElementById('view-' + v);
  if (el) { el.classList.remove('hidden'); el.classList.add('active'); }

  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.view === v);
  });
  state.view = v;
}

// ============================================================
// Seeding demo data (only if localStorage is empty)
// ============================================================
async function seedDemoData() {
  const notes = await api.getAll();
  if (notes.length > 0) return;

  const id1 = (await api.create(
    'Reunión de Planificación',
    '<p>Definimos los <strong>objetivos del trimestre</strong>. El equipo acordó las siguientes prioridades:</p><ul><li>Entrega del módulo A</li><li>Revisión de métricas</li><li>Capacitación interna</li></ul>',
    'Ana López',
    []
  )).id;

  const id2 = (await api.create(
    'Actualización de Objetivos',
    '<p>Revisamos lo acordado en la <em>reunión anterior</em> y cambiamos las fechas de entrega del módulo A al siguiente mes.</p>',
    'Carlos Ruiz',
    [id1]
  )).id;

  await api.create(
    'Informe Final del Trimestre',
    '<h2>Resumen Ejecutivo</h2><p>El trimestre cerró con resultados <strong>satisfactorios</strong>. Se cumplieron 3 de los 4 objetivos establecidos inicialmente.</p><blockquote>El equipo superó las expectativas en la entrega del módulo A.</blockquote>',
    'María García',
    [id1, id2]
  );
}

// ============================================================
// View: Lista
// ============================================================
async function renderLista(filter = '') {
  setView('lista');
  const grid = document.getElementById('notas-grid');
  const empty = document.getElementById('empty-state');
  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px"><span class="spinner"></span></div>';
  empty.classList.add('hidden');

  try {
    state.notes = await api.getAll();
  } catch (err) {
    showToast('Error al cargar notas: ' + err.message, 'error');
    grid.innerHTML = '';
    return;
  }

  const lower = filter.toLowerCase();
  const filtered = filter
    ? state.notes.filter(n =>
        (n['Título'] || '').toLowerCase().includes(lower) ||
        (n.Responsable || '').toLowerCase().includes(lower) ||
        stripHtml(n.Contenido || '').toLowerCase().includes(lower)
      )
    : state.notes;

  grid.innerHTML = '';

  if (!filtered.length) {
    if (!filter && !state.notes.length) {
      empty.classList.remove('hidden');
    } else {
      grid.innerHTML = '<p style="color:var(--text-secondary);grid-column:1/-1">No se encontraron notas.</p>';
    }
    return;
  }

  filtered.forEach(nota => {
    const citas = getCitations(nota);
    const excerpt = stripHtml(nota.Contenido || '').substring(0, 120).trim();
    const card = document.createElement('div');
    card.className = 'nota-card';
    card.innerHTML = `
      <div class="nota-card-title">${escHtml(nota['Título'] || 'Sin título')}</div>
      <div class="nota-card-meta">
        <span>📅 ${formatDate(nota['Fecha de Creación'])}</span>
        <span>👤 ${escHtml(nota.Responsable || 'Sin responsable')}</span>
      </div>
      ${excerpt ? `<div class="nota-card-excerpt">${escHtml(excerpt)}${excerpt.length >= 120 ? '…' : ''}</div>` : ''}
      <div class="nota-card-footer">
        <span class="badge badge-blue">ID: ${escHtml(nota.ID_Nota)}</span>
        ${citas.length ? `<span class="badge badge-gray">🔗 ${citas.length} cita${citas.length !== 1 ? 's' : ''}</span>` : ''}
      </div>
    `;
    card.addEventListener('click', () => navigateTo(`#/nota/${nota.ID_Nota}`));
    grid.appendChild(card);
  });
}

// ============================================================
// View: Nota
// ============================================================
async function renderNota(id) {
  setView('nota');
  try {
    if (!state.notes.length) {
      state.notes = await api.getAll();
    }
    const nota = getNoteById(id) || await api.getById(id);
    if (!nota) { showToast('Nota no encontrada', 'error'); navigateTo('#/'); return; }

    state.currentNoteId = id;
    document.getElementById('nota-titulo').textContent = nota['Título'] || 'Sin título';
    document.getElementById('nota-fecha').innerHTML = `📅 ${formatDate(nota['Fecha de Creación'])}`;
    document.getElementById('nota-responsable').innerHTML = `👤 ${escHtml(nota.Responsable || '')}`;
    document.getElementById('nota-contenido').innerHTML = nota.Contenido || '';

    // Citations
    const citas = getCitations(nota);
    const citasEl = document.getElementById('nota-citas');
    if (citas.length) {
      const citasHtml = citas.map(cid => {
        const cited = getNoteById(cid);
        const label = cited ? cited['Título'] : cid;
        return `<span class="cita-link" data-id="${escHtml(cid)}">${escHtml(label)}</span>`;
      }).join('');
      citasEl.innerHTML = `<h3>Citas (${citas.length})</h3><div>${citasHtml}</div>`;
      citasEl.querySelectorAll('.cita-link').forEach(link => {
        link.addEventListener('click', () => navigateTo(`#/nota/${link.dataset.id}`));
      });
    } else {
      citasEl.innerHTML = '';
    }

    // Edit / Delete handlers
    document.getElementById('btn-edit-nota').onclick = () => navigateTo(`#/editar/${id}`);
    document.getElementById('btn-delete-nota').onclick = () => confirmDelete(id);
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ============================================================
// View: Editor
// ============================================================
function renderEditor(editId) {
  setView('editor');
  state.editingNoteId = editId || null;
  state.selectedCitations = [];

  const titleInput = document.getElementById('editor-titulo');
  const respInput  = document.getElementById('editor-responsable');
  const content    = document.getElementById('editor-content');

  titleInput.value = '';
  respInput.value  = '';
  content.innerHTML = '';

  if (editId) {
    const nota = getNoteById(editId);
    if (nota) {
      titleInput.value   = nota['Título'] || '';
      respInput.value    = nota.Responsable || '';
      content.innerHTML  = nota.Contenido || '';
      state.selectedCitations = getCitations(nota).slice();
    }
  }

  renderCitaChips();
  updateToolbarState();
}

// ---- Toolbar ----
function updateToolbarState() {
  const cmds = ['bold', 'italic', 'underline', 'strikeThrough',
                 'insertUnorderedList', 'insertOrderedList',
                 'justifyLeft', 'justifyCenter', 'justifyRight'];
  cmds.forEach(cmd => {
    const btn = document.querySelector(`[data-cmd="${cmd}"]`);
    if (btn) btn.classList.toggle('active', document.queryCommandState(cmd));
  });

  // Heading select
  const sel = document.getElementById('heading-select');
  if (sel) {
    const tag = document.queryCommandValue('formatBlock').toLowerCase().replace(/[<>]/g, '');
    const validTags = ['h1', 'h2', 'h3'];
    sel.value = validTags.includes(tag) ? tag : 'p';
  }
}

function initToolbar() {
  // Toolbar buttons with data-cmd
  document.querySelectorAll('.toolbar-btn[data-cmd]').forEach(btn => {
    btn.addEventListener('mousedown', e => {
      e.preventDefault(); // prevent blur on editor
      document.execCommand(btn.dataset.cmd, false, null);
      updateToolbarState();
    });
  });

  // Heading select
  document.getElementById('heading-select').addEventListener('change', function () {
    const val = this.value;
    document.getElementById('editor-content').focus();
    document.execCommand('formatBlock', false, val === 'p' ? '<p>' : `<${val}>`);
    updateToolbarState();
  });

  // Link button
  document.getElementById('btn-add-link').addEventListener('mousedown', e => {
    e.preventDefault();
    const url = prompt('URL del enlace:');
    if (url) {
      document.execCommand('createLink', false, url);
      // Make inserted link open in new tab
      document.querySelectorAll('#editor-content a').forEach(a => {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      });
    }
    updateToolbarState();
  });

  // Update state on selection change
  document.getElementById('editor-content').addEventListener('keyup', updateToolbarState);
  document.getElementById('editor-content').addEventListener('mouseup', updateToolbarState);
}

// ---- Citation chips ----
function renderCitaChips() {
  const container = document.getElementById('citas-seleccionadas');
  container.innerHTML = '';
  state.selectedCitations.forEach(id => {
    const nota = getNoteById(id);
    const label = nota ? nota['Título'] : id;
    const chip = document.createElement('span');
    chip.className = 'cita-chip';
    chip.innerHTML = `${escHtml(label)}<button title="Quitar cita" aria-label="Quitar">✕</button>`;
    chip.querySelector('button').addEventListener('click', () => {
      state.selectedCitations = state.selectedCitations.filter(c => c !== id);
      renderCitaChips();
    });
    container.appendChild(chip);
  });
}

// ---- Save note ----
async function saveNote() {
  const titulo     = document.getElementById('editor-titulo').value.trim();
  const responsable = document.getElementById('editor-responsable').value.trim();
  const contenido  = document.getElementById('editor-content').innerHTML.trim();

  if (!titulo) { showToast('El título es obligatorio', 'error'); return; }
  if (!responsable) { showToast('El responsable es obligatorio', 'error'); return; }

  const btn = document.getElementById('btn-save-nota');
  btn.disabled = true;
  btn.textContent = 'Guardando…';

  try {
    let id;
    if (state.editingNoteId) {
      await api.update(state.editingNoteId, titulo, contenido, responsable, state.selectedCitations);
      id = state.editingNoteId;
      showToast('Nota actualizada', 'success');
    } else {
      const result = await api.create(titulo, contenido, responsable, state.selectedCitations);
      id = result.id;
      showToast('Nota creada', 'success');
    }
    state.notes = await api.getAll();
    navigateTo('#/nota/' + id);
  } catch (err) {
    showToast('Error al guardar: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '💾 Guardar';
  }
}

// ============================================================
// NodeMap – pure Canvas, no external dependencies
// ============================================================
class NodeMap {
  constructor(container, notes) {
    this._stopped = false;
    this.container = container;
    this.notes = notes;
    this.transform = { x: 0, y: 0, scale: 1 };
    this._dragNode = null;
    this._panStart = null;

    // Canvas setup
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'mapa-canvas';
    this.canvas.setAttribute('aria-label', 'Mapa de relaciones entre notas');
    this.canvas.setAttribute('role', 'img');
    container.innerHTML = '';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    // Tooltip element
    this._tooltip = document.createElement('div');
    this._tooltip.className = 'map-tooltip hidden';
    document.body.appendChild(this._tooltip);

    this._buildGraph();
    this._resize();
    this._initInteraction();
    this._simulate();
  }

  _buildGraph() {
    const nodeMap = new Map();
    this.nodes = this.notes.map(n => {
      const node = {
        id: n.ID_Nota,
        title: n['Título'] || n.ID_Nota,
        author: n.Responsable || '',
        citas: getCitations(n),
        x: Math.random() * 500 + 150,
        y: Math.random() * 350 + 100,
        vx: 0, vy: 0,
        pinned: false
      };
      nodeMap.set(n.ID_Nota, node);
      return node;
    });

    const nodeIds = new Set(this.nodes.map(n => n.id));
    this.links = [];
    this.nodes.forEach(src => {
      src.citas.forEach(cid => {
        if (nodeIds.has(cid) && cid !== src.id) {
          this.links.push({ source: src, target: nodeMap.get(cid) });
        }
      });
    });

    const citedIds   = new Set(this.links.map(l => l.target.id));
    const citingIds  = new Set(this.links.map(l => l.source.id));
    this.nodes.forEach(n => {
      n.isCiting = citingIds.has(n.id);
      n.isCited  = citedIds.has(n.id);
      n.isolated = !n.isCiting && !n.isCited;
    });
  }

  _resize() {
    const rect = this.container.getBoundingClientRect();
    this.W = rect.width  || 800;
    this.H = rect.height || 600;
    this.canvas.width  = this.W;
    this.canvas.height = this.H;
  }

  _simulate() {
    if (this._stopped) return;
    let alpha = 1;
    const DECAY = 0.018;
    const MIN_ALPHA = 0.003;

    const tick = () => {
      if (this._stopped) return;
      if (alpha > MIN_ALPHA) {
        alpha *= (1 - DECAY);
        this._applyForces(alpha);
      }
      this._draw();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  _applyForces(alpha) {
    const n = this.nodes;
    const cx = this.W / 2;
    const cy = this.H / 2;

    // Center gravity
    n.forEach(node => {
      if (node.pinned) return;
      node.vx += (cx - node.x) * 0.012 * alpha;
      node.vy += (cy - node.y) * 0.012 * alpha;
    });

    // N-body repulsion
    for (let i = 0; i < n.length; i++) {
      for (let j = i + 1; j < n.length; j++) {
        const dx = n[j].x - n[i].x;
        const dy = n[j].y - n[i].y;
        const dist2 = Math.max(dx * dx + dy * dy, 1);
        const dist  = Math.sqrt(dist2);
        const force = -380 / dist2;
        const fx = force * dx / dist;
        const fy = force * dy / dist;
        n[i].vx += fx;
        n[i].vy += fy;
        n[j].vx -= fx;
        n[j].vy -= fy;
      }
    }

    // Link spring
    this.links.forEach(link => {
      const dx   = link.target.x - link.source.x;
      const dy   = link.target.y - link.source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const delta = (dist - 170) * 0.09 * alpha;
      const fx = delta * dx / dist;
      const fy = delta * dy / dist;
      if (!link.source.pinned) { link.source.vx += fx; link.source.vy += fy; }
      if (!link.target.pinned) { link.target.vx -= fx; link.target.vy -= fy; }
    });

    // Integrate + damp + clamp
    const R = 34;
    n.forEach(node => {
      if (node.pinned) return;
      node.vx *= 0.68;
      node.vy *= 0.68;
      node.x += node.vx;
      node.y += node.vy;
      node.x = Math.max(R, Math.min(this.W - R, node.x));
      node.y = Math.max(R, Math.min(this.H - R, node.y));
    });
  }

  _draw() {
    const { x: tx, y: ty, scale: ts } = this.transform;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(ts, ts);

    // Links
    this.links.forEach(link => {
      const sx = link.source.x, sy = link.source.y;
      const ex0 = link.target.x, ey0 = link.target.y;
      const dx = ex0 - sx, dy = ey0 - sy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const ex = ex0 - (dx / dist) * 36;
      const ey = ey0 - (dy / dist) * 36;

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Arrowhead
      const angle = Math.atan2(dy, dx);
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - 11 * Math.cos(angle - 0.38), ey - 11 * Math.sin(angle - 0.38));
      ctx.lineTo(ex - 11 * Math.cos(angle + 0.38), ey - 11 * Math.sin(angle + 0.38));
      ctx.closePath();
      ctx.fillStyle = '#94a3b8';
      ctx.fill();
    });

    // Nodes
    this.nodes.forEach(node => {
      const R = 28;
      const color = node.isolated
        ? '#94a3b8'
        : (node.isCited && !node.isCiting ? '#a855f7' : '#4f8ef7');

      ctx.beginPath();
      ctx.arc(node.x, node.y, R, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Label (up to 2 lines, 14 chars max per line)
      ctx.font = '10px "Segoe UI",system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'white';

      const words = node.title.split(' ');
      let line1 = '', line2 = '';
      for (let i = 0; i < words.length; i++) {
        const candidate = (line1 ? line1 + ' ' : '') + words[i];
        if (!line1 || candidate.length <= 13) {
          line1 = candidate;
        } else if (!line2 || (line2 + ' ' + words[i]).length <= 13) {
          line2 = (line2 ? line2 + ' ' : '') + words[i];
        }
      }
      if (line2) {
        ctx.fillText(line1.substring(0, 14), node.x, node.y - 7);
        ctx.fillText((line2 + (words.length > 5 ? '…' : '')).substring(0, 15), node.x, node.y + 7);
      } else {
        ctx.fillText(line1.substring(0, 14), node.x, node.y);
      }
    });

    ctx.restore();
  }

  _hitTest(wx, wy) {
    return this.nodes.find(n => {
      const dx = n.x - wx, dy = n.y - wy;
      return Math.sqrt(dx * dx + dy * dy) < 32;
    }) || null;
  }

  _worldPos(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.transform.x) / this.transform.scale,
      y: (clientY - rect.top  - this.transform.y) / this.transform.scale
    };
  }

  _initInteraction() {
    const c = this.canvas;

    c.addEventListener('mousedown', e => {
      const pos = this._worldPos(e.clientX, e.clientY);
      this._dragNode = this._hitTest(pos.x, pos.y);
      if (this._dragNode) {
        this._dragNode.pinned = true;
      } else {
        this._panStart = { ox: e.clientX - this.transform.x, oy: e.clientY - this.transform.y };
      }
    });

    c.addEventListener('mousemove', e => {
      const pos = this._worldPos(e.clientX, e.clientY);
      if (this._dragNode) {
        this._dragNode.x = pos.x;
        this._dragNode.y = pos.y;
        this._dragNode.vx = 0; this._dragNode.vy = 0;
      } else if (this._panStart) {
        this.transform.x = e.clientX - this._panStart.ox;
        this.transform.y = e.clientY - this._panStart.oy;
        c.style.cursor = 'grabbing';
      }
      const hit = this._hitTest(pos.x, pos.y);
      if (hit) {
        this._tooltip.textContent = hit.title + (hit.author ? ' — ' + hit.author : '');
        this._tooltip.classList.remove('hidden');
        this._tooltip.style.left = (e.clientX + 14) + 'px';
        this._tooltip.style.top  = (e.clientY - 30) + 'px';
        c.style.cursor = 'pointer';
      } else {
        this._tooltip.classList.add('hidden');
        if (!this._panStart) c.style.cursor = 'grab';
      }
    });

    c.addEventListener('mouseup', e => {
      const pos = this._worldPos(e.clientX, e.clientY);
      const hit = this._hitTest(pos.x, pos.y);
      if (this._dragNode && hit === this._dragNode) {
        navigateTo('#/nota/' + this._dragNode.id);
      }
      if (this._dragNode) { this._dragNode.pinned = false; this._dragNode = null; }
      this._panStart = null;
      c.style.cursor = 'grab';
    });

    c.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.2, Math.min(3, this.transform.scale * factor));
      const rect = c.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.transform.x = mx - (mx - this.transform.x) * (newScale / this.transform.scale);
      this.transform.y = my - (my - this.transform.y) * (newScale / this.transform.scale);
      this.transform.scale = newScale;
    }, { passive: false });

    this._resizeHandler = () => this._resize();
    window.addEventListener('resize', this._resizeHandler);
  }

  resetView() {
    this.transform = { x: 0, y: 0, scale: 1 };
  }

  destroy() {
    this._stopped = true;
    this._tooltip.remove();
    window.removeEventListener('resize', this._resizeHandler);
  }
}

let _activeMap = null;

// ============================================================
// View: Mapa de Nodos
// ============================================================
function renderMapa() {
  setView('mapa');
  if (_activeMap) { _activeMap.destroy(); _activeMap = null; }

  const container = document.getElementById('mapa-container');

  if (!state.notes.length) {
    container.innerHTML = '<div class="mapa-empty"><p>No hay notas para mostrar en el mapa.</p><a href="#/" class="btn btn-secondary">Ver lista</a></div>';
    document.getElementById('btn-reset-zoom').onclick = () => {};
    return;
  }

  _activeMap = new NodeMap(container, state.notes);
  document.getElementById('btn-reset-zoom').onclick = () => _activeMap && _activeMap.resetView();
}

// ============================================================
// Delete Note
// ============================================================
function confirmDelete(id) {
  const modal = document.getElementById('modal-delete');
  modal.classList.remove('hidden');
  document.getElementById('btn-confirm-delete').onclick = async () => {
    modal.classList.add('hidden');
    try {
      await api.delete(id);
      state.notes = await api.getAll();
      showToast('Nota eliminada', 'success');
      navigateTo('#/');
    } catch (err) {
      showToast('Error al eliminar: ' + err.message, 'error');
    }
  };
  document.getElementById('btn-cancel-delete').onclick = () => modal.classList.add('hidden');
}

// ============================================================
// Citation Picker Modal
// ============================================================
function openCitasPicker() {
  const modal  = document.getElementById('modal-citas');
  const search = document.getElementById('citas-search');
  const lista  = document.getElementById('citas-lista');

  modal.classList.remove('hidden');
  search.value = '';

  const buildList = (filter = '') => {
    lista.innerHTML = '';
    const lower = filter.toLowerCase();
    const candidates = state.notes.filter(n =>
      n.ID_Nota !== state.editingNoteId &&
      (!filter || n['Título'].toLowerCase().includes(lower))
    );

    if (!candidates.length) {
      lista.innerHTML = '<p style="color:var(--text-secondary);font-size:.88rem">No hay notas disponibles.</p>';
      return;
    }

    candidates.forEach(nota => {
      const selected = state.selectedCitations.includes(nota.ID_Nota);
      const row = document.createElement('div');
      row.className = 'cita-option' + (selected ? ' selected' : '');
      row.innerHTML = `
        <div>
          <div class="cita-option-title">${escHtml(nota['Título'])}</div>
          <div class="cita-option-meta">📅 ${formatDate(nota['Fecha de Creación'])} · 👤 ${escHtml(nota.Responsable || '')}</div>
        </div>
        ${selected ? '<span class="cita-option-check">✓</span>' : ''}
      `;
      row.addEventListener('click', () => {
        if (selected) {
          state.selectedCitations = state.selectedCitations.filter(c => c !== nota.ID_Nota);
        } else {
          state.selectedCitations.push(nota.ID_Nota);
        }
        renderCitaChips();
        buildList(search.value);
      });
      lista.appendChild(row);
    });
  };

  buildList();
  search.addEventListener('input', () => buildList(search.value));
  document.getElementById('modal-citas-close').onclick = () => modal.classList.add('hidden');
}

// ============================================================
// Config Modal
// ============================================================
function openConfig() {
  const modal = document.getElementById('modal-config');
  const cfg = Config.load();
  document.getElementById('config-api-url').value = cfg.apiUrl || '';
  document.getElementById('config-demo-mode').checked = cfg.demoMode !== false;
  modal.classList.remove('hidden');
}

function initConfigModal() {
  document.getElementById('btn-config').addEventListener('click', openConfig);
  document.getElementById('modal-config-close').addEventListener('click', () => {
    document.getElementById('modal-config').classList.add('hidden');
  });
  document.getElementById('btn-save-config').addEventListener('click', () => {
    const cfg = {
      apiUrl: document.getElementById('config-api-url').value.trim(),
      demoMode: document.getElementById('config-demo-mode').checked
    };
    Config.save(cfg);
    api._cfg = cfg;
    document.getElementById('modal-config').classList.add('hidden');
    showToast('Configuración guardada. Recarga la página.', 'success');
  });
  // Close on backdrop click
  document.querySelector('#modal-config .modal-backdrop').addEventListener('click', () => {
    document.getElementById('modal-config').classList.add('hidden');
  });
}

// ============================================================
// Router (hash-based)
// ============================================================
function navigateTo(hash) {
  window.location.hash = hash;
}

async function handleRoute() {
  const hash = window.location.hash || '#/';

  if (hash === '#/' || hash === '') {
    await renderLista();
  } else if (hash === '#/nueva') {
    if (!state.notes.length) state.notes = await api.getAll().catch(() => []);
    renderEditor(null);
  } else if (hash.startsWith('#/nota/')) {
    const id = hash.replace('#/nota/', '');
    if (!state.notes.length) state.notes = await api.getAll().catch(() => []);
    await renderNota(id);
  } else if (hash.startsWith('#/editar/')) {
    const id = hash.replace('#/editar/', '');
    if (!state.notes.length) state.notes = await api.getAll().catch(() => []);
    renderEditor(id);
  } else if (hash === '#/mapa') {
    if (!state.notes.length) state.notes = await api.getAll().catch(() => []);
    renderMapa();
  } else {
    navigateTo('#/');
  }
}

// ============================================================
// HTML escape helper
// ============================================================
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================
// Init
// ============================================================
async function init() {
  // Seed demo data on first load
  if (api.usesLocalStorage) {
    await seedDemoData();
  }

  // Toolbar
  initToolbar();

  // Editor: save & cancel
  document.getElementById('btn-save-nota').addEventListener('click', saveNote);
  document.getElementById('btn-cancel-editor').addEventListener('click', () => {
    history.back();
  });

  // Add citation button
  document.getElementById('btn-add-cita').addEventListener('click', openCitasPicker);

  // Search
  document.getElementById('search-input').addEventListener('input', e => {
    renderLista(e.target.value);
  });

  // Config modal
  initConfigModal();

  // Nav links
  document.querySelectorAll('.nav-link').forEach(a => {
    a.addEventListener('click', e => {
      // Let hash navigation handle it
    });
  });

  // Router
  window.addEventListener('hashchange', handleRoute);
  await handleRoute();
}

document.addEventListener('DOMContentLoaded', init);
