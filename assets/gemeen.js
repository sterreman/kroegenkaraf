/* Wat de lijst en de kaart delen: het laden van de data, de filters en de chips.
   Alles wat maar op een van beide pagina's thuishoort staat in gids.js of kaart.js. */

const SOORT_ORDER = ['Volkscafé', 'Bruine kroeg', 'Biercafé', 'Herberg',
                     'Bistro of brasserie', 'Cocktailbar', 'Wijnbar'];
const PROV_ORDER = [];

/* De statusfilter begint op '_open': gesloten zaken staan standaard niet in beeld.
   Ze blijven bereikbaar via de chip Gesloten of via Alles. */
const f = {q: '', p: '', t: '', s: '_open'};

let DATA = [];

const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const esc = s => (s || '').replace(/[&<>"]/g, c =>
  ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const count = fn => DATA.filter(fn).length;

/* Facebook en Instagram als gevuld glyph. Bewust geen lijntekening zoals de
   soortpictogrammen: deze twee zijn merken en worden alleen herkend in hun
   eigen vorm. Ze erven de kleur van de knop via fill:currentColor. */
const MERK = {
  fb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/></svg>',
  ig: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 0 1-2.88 0 1.44 1.44 0 0 1 2.88 0z"/></svg>'
};

/* De speld van Google Maps: druppelvorm met een uitgespaarde stip. Twee vormen
   met een eigen klasse, zodat de css het rood en de uitsparing kan zetten. */
const SPELD = '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<path class="pin" d="M12 2.2a7 7 0 0 0-7 7c0 5.25 7 12.6 7 12.6s7-7.35 7-12.6a7 7 0 0 0-7-7z"/>'
  + '<circle class="dot" cx="12" cy="9.2" r="2.5"/></svg>';

function mapsUrl(d) {
  return 'https://www.google.com/maps/search/?api=1&query='
    + encodeURIComponent([d.n, d.a, d.g, 'België'].filter(Boolean).join(', '));
}
function socKnop(d, url, merk, naam) {
  return url ? `<a class="btn soc" href="${esc(url)}" target="_blank" rel="noopener"`
    + ` title="${naam} van ${esc(d.n)}" aria-label="${naam} van ${esc(d.n)}">${MERK[merk]}</a>` : '';
}

function match(d) {
  if (f.p && d.p !== f.p) return false;
  if (f.t === '_geen' ? d.t : (f.t && d.t !== f.t)) return false;
  if (f.s === '_open' ? d.s === 'Gesloten' : (f.s && d.s !== f.s)) return false;
  if (f.q && !d._k.includes(f.q)) return false;
  return true;
}

function chipRow(el, items, key) {
  el.innerHTML = items.map(([v, lab, c]) =>
    `<button class="chip${f[key] === v ? ' on' : ''}" data-k="${key}" data-v="${esc(v)}" type="button">`
    + `${esc(lab)}${c != null ? `<span class="c">${c}</span>` : ''}</button>`).join('');
}
function renderChips() {
  chipRow(document.getElementById('f-p'),
    [['', 'Alle', DATA.length], ...PROV_ORDER.map(p => [p, p, count(d => d.p === p)])], 'p');
  const soorten = SOORT_ORDER.filter(s => count(d => d.t === s) > 0)
    .map(s => [s, s, count(d => d.t === s)]);
  const leeg = count(d => !d.t);
  chipRow(document.getElementById('f-t'),
    [['', 'Alle'], ...soorten, ...(leeg ? [['_geen', 'Nog te bepalen', leeg]] : [])], 't');
  chipRow(document.getElementById('f-s'),
    [['_open', 'Open', count(d => d.s !== 'Gesloten')],
     ['Geverifieerd', 'Geverifieerd', count(d => d.s === 'Geverifieerd')],
     ['Te checken', 'Te checken', count(d => d.s === 'Te checken')],
     ['Gesloten', 'Gesloten', count(d => d.s === 'Gesloten')],
     ['', 'Alles', DATA.length]], 's');
  const STATUS_LBL = {'_open': '', '': 'ook gesloten'};
  const actief = [f.p, f.t === '_geen' ? 'Nog te bepalen' : f.t,
                  f.s in STATUS_LBL ? STATUS_LBL[f.s] : f.s].filter(Boolean);
  document.getElementById('clr').hidden = !(f.p || f.t || f.s !== '_open' || f.q);
  document.getElementById('filtoggle-lbl').textContent =
    actief.length ? 'Filters: ' + actief.join(', ') : 'Filters';
}

/* De pagina zegt zelf wat er moet gebeuren als de filters wijzigen. */
let opnieuw = () => {};

function koppelFilters() {
  document.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (chip) {
      const k = chip.dataset.k, leeg = k === 's' ? '_open' : '';
      f[k] = f[k] === chip.dataset.v ? leeg : chip.dataset.v;
      renderChips(); opnieuw(); return;
    }
    if (e.target.closest('#clr')) {
      f.p = f.t = f.q = ''; f.s = '_open';
      document.getElementById('q').value = '';
      renderChips(); opnieuw();
    }
  });
  const ft = document.getElementById('filtoggle');
  ft.addEventListener('click', () => {
    const open = document.getElementById('filters').classList.toggle('open');
    ft.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  let t = null;
  document.getElementById('q').addEventListener('input', e => {
    clearTimeout(t);
    const v = norm(e.target.value);
    t = setTimeout(() => { f.q = v; renderChips(); opnieuw(); }, 110);
  });
}

/* Een gedeelde json voor beide pagina's, zodat de browser ze maar een keer haalt.
   De zoeksleutel wordt hier gezet en niet in het bouwscript: dat scheelt bijna
   een derde van het bestand. */
function laadData(dan) {
  fetch('data/zaken.json')
    .then(r => { if (!r.ok) throw new Error(r.status + ' ' + r.statusText); return r.json(); })
    .then(rijen => {
      DATA = rijen;
      DATA.forEach((d, i) => {
        d._k = norm([d.n, d.g, d.p, d.a, d.i, d.t].join(' '));
        d._i = i;
        if (!PROV_ORDER.includes(d.p)) PROV_ORDER.push(d.p);
      });
      koppelFilters();
      dan();
    })
    .catch(err => {
      document.getElementById('laadfout').hidden = false;
      console.error('zaken.json kwam niet binnen:', err);
    });
}
