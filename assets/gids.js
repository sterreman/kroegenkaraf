/* De lijst. Zoeken, een compacte filterbalk en de zaken gegroepeerd per plaats.
   Elke zaak linkt naar haar eigen pagina op /cafe/<plaats>/<naam>/.

   De zoekopdracht en de filters staan in de url (?q=&p=&t=&s=&tag=), zodat een
   link deelbaar is, de kaart dezelfde selectie kan tonen en de terugknop vanuit
   een zaakpagina op dezelfde plek uitkomt. Het filteren zelf (match, f) komt uit
   gemeen.js, dat de kaart ook gebruikt. */

const $ = id => document.getElementById(id);
const STATUS_KEUZES = [
  ['_open', 'Zonder gesloten zaken'],
  ['Geverifieerd', 'Alleen online gecontroleerd'],
  ['Te checken', 'Alleen status te bevestigen'],
  ['', 'Ook gesloten zaken'],
  ['Gesloten', 'Alleen gesloten zaken']
];
const STATUS_CHIP = {'Geverifieerd': 'Online gecontroleerd', 'Te checken': 'Status te bevestigen',
  '': 'Ook gesloten zaken', 'Gesloten': 'Alleen gesloten zaken'};
const soortLabel = t => t === '_geen' ? 'Soort nog te bepalen' : t;
const telwoord = n => n === 1 ? '1 zaak' : n.toLocaleString('nl-BE') + ' zaken';

let ruweQ = '';
let geladen = false;

/* Hoeveel zaken er overblijven als je een filter anders zet en de rest laat
   staan. Zo klopt het getal bij elke keuze met wat je dan te zien krijgt. */
function telMet(wijzig) {
  const oud = {...f, tags: [...f.tags]};
  Object.assign(f, wijzig);
  let n = 0;
  for (const d of DATA) if (match(d)) n++;
  Object.assign(f, oud);
  return n;
}

/* ---- de filterpanelen --------------------------------------------------- */

function keuze(k, v, label, n) {
  const aan = f[k] === v;
  return `<button type="button" class="keuze" data-k="${k}" data-v="${esc(v)}" aria-pressed="${aan}"`
    + `${n === 0 && !aan ? ' data-leeg' : ''}><span>${esc(label)}</span>`
    + `<span class="n">${n.toLocaleString('nl-BE')}</span></button>`;
}

function tekenPaneel(id) {
  if (id === 'paneel-p') {
    $('f-prov').innerHTML = keuze('p', '', 'Alle provincies', telMet({p: ''}))
      + PROV_ORDER.map(p => keuze('p', p, p, telMet({p}))).join('');
  } else if (id === 'paneel-t') {
    const aanwezig = new Set(DATA.map(d => d.t).filter(Boolean));
    const soorten = [...SOORT_ORDER.filter(s => aanwezig.has(s)),
      ...[...aanwezig].filter(s => !SOORT_ORDER.includes(s)).sort((a, b) => a.localeCompare(b, 'nl'))];
    const zonder = DATA.some(d => !d.t);
    $('f-soort').innerHTML = keuze('t', '', 'Alle soorten', telMet({t: ''}))
      + soorten.map(t => keuze('t', t, t, telMet({t}))).join('')
      + (zonder ? keuze('t', '_geen', 'Soort nog te bepalen', telMet({t: '_geen'})) : '');
  } else if (id === 'paneel-meer') {
    $('f-status').innerHTML = STATUS_KEUZES.map(([v, l]) => keuze('s', v, l, telMet({s: v}))).join('');
    const tags = [...new Set(DATA.flatMap(d => d.tags))].sort((a, b) => a.localeCompare(b, 'nl'));
    $('f-tags').innerHTML = tags.map(tag => {
      const aan = f.tags.includes(tag);
      const n = aan ? telMet({}) : telMet({tags: [...f.tags, tag]});
      return `<label class="tag${n === 0 && !aan ? ' leeg' : ''}"><input type="checkbox" value="${esc(tag)}"`
        + `${aan ? ' checked' : ''}><span>${esc(tag)}</span><span class="n">${n.toLocaleString('nl-BE')}</span></label>`;
    }).join('');
  }
  const n = DATA.filter(match).length;
  document.querySelectorAll('#' + id + ' .toon-n').forEach(el => { el.textContent = telwoord(n); });
  document.querySelectorAll('[data-wisfilters]').forEach(el => { el.hidden = !filtersActief(); });
}

let openPaneel = null;
const KNOP = {'paneel-p': 'k-p', 'paneel-t': 'k-t', 'paneel-meer': 'k-meer'};

function openen(id) {
  if (openPaneel === id) return sluiten();
  if (openPaneel) sluiten(false);
  openPaneel = id;
  tekenPaneel(id);
  $(id).hidden = false;
  $('scherm').hidden = false;
  document.body.classList.add('paneel-open');
  $(KNOP[id]).setAttribute('aria-expanded', 'true');
  const eerste = $(id).querySelector('[aria-pressed="true"], input, .keuze');
  if (eerste) eerste.focus({preventScroll: true});
}

function sluiten(focusTerug = true, naarLijst = false) {
  if (!openPaneel) return;
  const id = openPaneel;
  openPaneel = null;
  $(id).hidden = true;
  $('scherm').hidden = true;
  document.body.classList.remove('paneel-open');
  $(KNOP[id]).setAttribute('aria-expanded', 'false');
  if (naarLijst) naarResultaten();
  else if (focusTerug) $(KNOP[id]).focus({preventScroll: true});
}

/* Na een keuze meteen naar de resultaten, vooral op de gsm, waar het paneel
   het scherm vult. De balk blijft bovenaan kleven, dus alleen als de lijst
   er nog onder zit schuift de pagina op. */
function naarResultaten() {
  const top = $('resultaten').getBoundingClientRect().top;
  const balk = $('filterbalk').getBoundingClientRect().height;
  if (top < balk || top > innerHeight * .6) {
    scrollTo({top: scrollY + top - balk - 8});
  }
  $('resultaten').focus({preventScroll: true});
}

/* ---- toestand tonen ------------------------------------------------------ */

function filtersActief() {
  return !!(f.p || f.t || f.s !== '_open' || f.tags.length);
}

function tekenBalk() {
  const zet = (knop, waarde, label) => {
    const k = $(knop);
    k.classList.toggle('aan', !!waarde);
    k.querySelector('.fwaarde').textContent = waarde || '';
    k.querySelector('.flabel').hidden = !!waarde;
    k.setAttribute('aria-label', waarde ? label + ': ' + waarde : label);
  };
  zet('k-p', f.p, 'Provincie');
  zet('k-t', f.t ? soortLabel(f.t) : '', 'Soort zaak');
  const meer = (f.s !== '_open' ? 1 : 0) + f.tags.length;
  zet('k-meer', meer ? 'Meer filters (' + meer + ')' : '', 'Meer filters');

  const chips = [];
  if (f.p) chips.push(['p', f.p, f.p]);
  if (f.t) chips.push(['t', f.t, soortLabel(f.t)]);
  if (f.s !== '_open') chips.push(['s', f.s, STATUS_CHIP[f.s] || f.s]);
  f.tags.forEach(tag => chips.push(['tag', tag, tag]));
  const box = $('actief');
  box.hidden = !chips.length;
  box.innerHTML = chips.length ? '<span class="sr">Actieve filters:</span>'
    + chips.map(([k, v, l]) => `<button type="button" class="chip" data-weg="${k}" data-v="${esc(v)}">`
      + `${esc(l)}<span class="sr"> verwijderen</span><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3 3 9"/></svg></button>`).join('')
    + '<button type="button" class="wisfilters" data-wisfilters>Wis filters</button>' : '';

  $('wisq').hidden = !$('q').value;
  const query = staatQuery(ruweQ);
  $('naarkaart').href = 'kaart.html' + query;
  try { history.replaceState(history.state, '', location.pathname + query); } catch (e) {}
}

/* Wie op naam zoekt, wil de zaak ook vinden als ze dicht is. Standaard blijven
   gesloten zaken buiten beeld, dus zeggen we hoeveel er dan wegvallen. */
function geslotenTreffers() {
  if (f.s !== '_open' || !f.q) return 0;
  return telMet({s: 'Gesloten'});
}
function geslotenMelding(n) {
  return `${n === 1 ? 'Eén gesloten zaak past' : n + ' gesloten zaken passen'} ook bij je zoekopdracht. `
    + `<button type="button" class="linkknop" data-toongesloten>Toon ${n === 1 ? 'ze' : 'ze erbij'}</button>`;
}

function statusRegel(d) {
  if (d.s === 'Gesloten') return `<span class="zstatus dicht">Gesloten${d.z ? ' sinds ' + esc(d.z) : ''}</span>`;
  if (d.s === 'Te checken') return '<span class="zstatus todo">Status te bevestigen</span>';
  return '';
}

function rij(d) {
  const meta = [d.a ? esc(d.a) : '<span class="onbekend">adres nog aan te vullen</span>',
                d.t ? esc(d.t) : ''].filter(Boolean).join('<span class="sep" aria-hidden="true"> · </span>');
  const binnen = `<span class="ztekst"><span class="znaam">${esc(d.n)}</span>`
    + `<span class="zmeta">${meta}</span>${statusRegel(d)}</span>`
    + (d.foto ? `<img class="zfoto" src="fotos/${esc(d.foto)}-klein.avif" alt="" width="64" height="64"`
      + ` loading="lazy" decoding="async">` : '');
  return `<li class="zaak${d.s === 'Gesloten' ? ' dicht' : ''}" data-i="${d._i}">`
    + (d.u ? `<a class="rij" href="/${esc(d.u)}/">${binnen}</a>` : `<div class="rij">${binnen}</div>`)
    + '</li>';
}

function render() {
  const res = DATA.filter(match);
  const dicht = geslotenTreffers();
  const zoek = ruweQ.trim();
  $('aantal').innerHTML = `<b>${telwoord(res.length)}</b>`
    + (zoek ? ` voor <q>${esc(zoek)}</q>` : '')
    + (f.s === '_open' ? '<span class="stil">zonder gesloten zaken</span>' : '');
  tekenBalk();
  const L = $('list');
  L.removeAttribute('aria-busy');
  if (!res.length) {
    const knoppen = [];
    if (filtersActief()) knoppen.push('<button type="button" class="knop" data-wisfilters>Wis filters</button>');
    if (zoek) knoppen.push('<button type="button" class="knop" data-wiszoek>Wis zoekopdracht</button>');
    L.innerHTML = '<div class="leeg"><p class="leegkop">Niets gevonden.</p><p>'
      + (dicht ? geslotenMelding(dicht)
        : zoek && filtersActief() ? 'Geen zaak past bij deze zoekopdracht en deze filters samen.'
        : zoek ? 'Controleer de schrijfwijze of zoek op een gemeente.'
        : 'Geen zaak past bij deze filters.')
      + '</p>' + (knoppen.length ? `<p class="leegknoppen">${knoppen.join('')}</p>` : '') + '</div>';
    return;
  }
  let html = dicht ? `<p class="melding">${geslotenMelding(dicht)}</p>` : '';
  let groep = null, items = '';
  const perGroep = {};
  res.forEach(d => { const k = d.p + '|' + d.g; perGroep[k] = (perGroep[k] || 0) + 1; });
  const sluitGroep = () => { if (groep) html += `<ul class="zaken">${items}</ul></section>`; };
  for (const d of res) {
    const k = d.p + '|' + d.g;
    if (k !== groep) {
      sluitGroep();
      html += `<section class="plaats"><h2 class="plaatskop"><span class="pnaam">${esc(d.g || 'Gemeente nog te bepalen')}</span>`
        + `<span class="pprov">${esc(d.p)}</span><span class="pn" aria-label="${telwoord(perGroep[k])}">${perGroep[k]}</span></h2>`;
      groep = k; items = '';
    }
    items += rij(d);
  }
  sluitGroep();
  L.innerHTML = html;
}

/* ---- terugkeren op dezelfde plek ---------------------------------------- */

const PLEK = 'kk-lijst-plek';
function bewaarPlek() {
  try { sessionStorage.setItem(PLEK, JSON.stringify({u: location.search, y: scrollY})); } catch (e) {}
}
function herstelPlek() {
  let nav = '';
  try { nav = performance.getEntriesByType('navigation')[0].type; } catch (e) {}
  if (nav !== 'back_forward') return false;
  try {
    const p = JSON.parse(sessionStorage.getItem(PLEK) || 'null');
    if (p && p.u === location.search) { scrollTo(0, p.y); return true; }
  } catch (e) {}
  return false;
}
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
addEventListener('pagehide', bewaarPlek);

/* index.html#123 of #cafe/... wijst een zaak aan, bijvoorbeeld vanuit een oude
   link. Valt die buiten de filters, dan gaan die open. */
function naarAnker() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (!h) return;
  const i = h.startsWith('cafe/') ? DATA.findIndex(d => d.u === h) : parseInt(h, 10);
  if (isNaN(i) || !DATA[i]) return;
  if (!match(DATA[i])) {
    f.p = f.t = f.q = ''; f.s = ''; f.tags = []; ruweQ = ''; $('q').value = '';
    render();
  }
  const el = document.querySelector(`.zaak[data-i="${DATA[i]._i}"]`);
  if (!el) return;
  el.classList.add('gevonden');
  el.scrollIntoView({block: 'center'});
  setTimeout(() => el.classList.remove('gevonden'), 2600);
}
addEventListener('hashchange', naarAnker);

/* ---- bediening ------------------------------------------------------------ */

function wijzig() {
  if (openPaneel) tekenPaneel(openPaneel);
  render();
}

function koppel() {
  let t = null;
  $('q').addEventListener('input', e => {
    ruweQ = e.target.value;
    $('wisq').hidden = !ruweQ;
    clearTimeout(t);
    t = setTimeout(() => { f.q = norm(ruweQ); render(); scrollTo({top: 0}); }, 120);
  });
  $('zoekform').addEventListener('submit', e => {
    e.preventDefault();
    clearTimeout(t); f.q = norm(ruweQ); render();
    $('q').blur();
    naarResultaten();
  });
  $('wisq').addEventListener('click', () => {
    ruweQ = ''; f.q = ''; $('q').value = ''; render(); $('q').focus();
  });

  Object.entries(KNOP).forEach(([paneel, knop]) =>
    $(knop).addEventListener('click', () => openen(paneel)));
  $('scherm').addEventListener('click', () => sluiten(false));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && openPaneel) { e.preventDefault(); sluiten(); }
  });
  document.addEventListener('click', e => {
    const k = e.target.closest('.keuze');
    if (k) {
      f[k.dataset.k] = k.dataset.v;
      wijzig();
      /* een provincie of soort is een enkele keuze: het paneel mag dicht */
      if (k.dataset.k !== 's') sluiten(false, true);
      else k.parentElement.querySelector(`[data-v="${CSS.escape(k.dataset.v)}"]`)?.focus({preventScroll: true});
      return;
    }
    if (e.target.closest('[data-sluit]')) {
      sluiten(false, true);
      return;
    }
    const weg = e.target.closest('[data-weg]');
    if (weg) {
      const {weg: sl, v} = weg.dataset;
      if (sl === 'tag') f.tags = f.tags.filter(x => x !== v);
      else f[sl] = sl === 's' ? '_open' : '';
      wijzig();
      (document.querySelector('#actief .chip') || document.querySelector('#actief .wisfilters')
        || $('q')).focus({preventScroll: true});
      return;
    }
    if (e.target.closest('[data-wisfilters]')) {
      f.p = f.t = ''; f.s = '_open'; f.tags = [];
      wijzig();
      if (!openPaneel) $('q').focus({preventScroll: true});
      return;
    }
    if (e.target.closest('[data-wiszoek]')) {
      ruweQ = ''; f.q = ''; $('q').value = ''; render(); $('q').focus();
      return;
    }
    if (e.target.closest('[data-toongesloten]')) {
      f.s = ''; wijzig();
    }
  });
  $('f-tags').addEventListener('change', e => {
    const tag = e.target.value;
    f.tags = e.target.checked ? [...f.tags, tag] : f.tags.filter(x => x !== tag);
    render();
    tekenPaneel('paneel-meer');
    [...$('f-tags').querySelectorAll('input')].find(i => i.value === tag)?.focus({preventScroll: true});
  });
}

/* ---- laden ----------------------------------------------------------------- */

function laadfout() {
  $('aantal').textContent = 'De lijst kwam niet binnen.';
  $('list').removeAttribute('aria-busy');
  $('list').innerHTML = '<div class="leeg"><p class="leegkop">De lijst kwam niet binnen.</p>'
    + '<p>Controleer je verbinding en probeer het opnieuw.</p>'
    + '<p class="leegknoppen"><button type="button" class="knop" id="opnieuw">Opnieuw proberen</button></p></div>';
  $('opnieuw').addEventListener('click', () => {
    $('list').setAttribute('aria-busy', 'true');
    $('list').innerHTML = '<p class="laden">De zaken worden geladen.</p>';
    $('aantal').textContent = 'Zaken laden…';
    laadData(gereed, laadfout);
  });
}

function gereed() {
  if (geladen) return;
  geladen = true;
  $('foot').textContent = 'De gids telt ' + DATA.length.toLocaleString('nl-BE')
    + ' zaken · bijgewerkt ' + BIJGEWERKT;
  ruweQ = leesStaat();
  $('q').value = ruweQ;
  Object.values(KNOP).forEach(k => { $(k).disabled = false; });
  koppel();
  render();
  if (location.hash) naarAnker();
  else herstelPlek();
}

laadData(gereed, laadfout);
