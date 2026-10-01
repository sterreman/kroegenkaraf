/* De zoekbalk, de filterbalk en de chips met actieve filters, gedeeld door de
   lijst (gids.js) en de kaart (kaart.js). Het filteren zelf (f, match) staat in
   gemeen.js. Elke pagina zet in FB wat bij haar hoort:

     FB.basis(d)      welke zaken die pagina kan tonen (de kaart: met ligging, niet dicht)
     FB.statussen     de statuskeuzes in Meer filters
     FB.teken()       de resultaten opnieuw tekenen
     FB.naZoeken()    wat er na het typen gebeurt (de lijst springt naar boven)

   De zoekopdracht en de filters staan in de url (?q=&p=&t=&s=&tag=), zodat een
   link deelbaar is en Lijst en Kaart dezelfde selectie tonen. */

const $ = id => document.getElementById(id);
const STATUS_ALLE = [
  ['_open', 'Zonder gesloten zaken'],
  ['Geverifieerd', 'Alleen online gecontroleerd'],
  ['Te checken', 'Alleen status te bevestigen'],
  ['', 'Ook gesloten zaken'],
  ['Gesloten', 'Alleen gesloten zaken']
];
const STATUS_CHIP = {'Geverifieerd': 'Online gecontroleerd', 'Te checken': 'Status te bevestigen',
  '': 'Ook gesloten zaken', 'Gesloten': 'Alleen gesloten zaken'};
/* De kenmerken uit scripts/taxonomy.py, per thema voor het paneel Meer filters. */
const TAGGROEPEN = [
  ['Buiten', ['Terras', 'Groot terras', 'Verwarmd terras', 'Café met tuin', 'Aan het water', 'Uitzicht', 'Zomerbar']],
  ['Drinken', ['Speciaalbier', 'Grote bierkaart', 'Belgische bieren', 'Trappist', 'Brouwerijcafé', 'Cocktails',
    'Wijn', 'Natuurwijn', 'Aperitief', 'Sterke drank', 'Koffie']],
  ['Eten', ['Eten', 'Snacks', 'Kleine kaart', 'Lunch', 'Ontbijt', 'Brunch']],
  ['Spelen en sport', ['Biljart', 'Darts', 'Kicker', 'Pool', 'Kaarten', 'Sport op tv', 'Supporterscafé', 'Wielercafé']],
  ['Muziek en uitgaan', ['Live muziek', 'DJ', 'Rock', 'Jazz', 'Dansen', 'Feestcafé', 'Late night']],
  ['Karakter', ['Dorpscafé', 'Buurtcafé', 'Gezellig', 'Historisch', 'Erfgoed', 'Authentiek interieur', 'Stamcafé',
    'Studentencafé', 'Rustig', 'Trendy', 'Alternatief', 'Speakeasy', 'Date night']],
  ['Voor wie', ['Fietscafé', 'Wandelcafé', 'Gezinsvriendelijk', 'Honden welkom', 'Motorrijders']]
];
const soortLabel = t => t === '_geen' ? 'Soort nog te bepalen' : t;
const telwoord = n => n === 1 ? '1 zaak' : n.toLocaleString('nl-BE') + ' zaken';

const FB = {
  basis: () => true,
  statussen: STATUS_ALLE,
  teken: () => {},
  naZoeken: () => {}
};
let ruweQ = '';

/* De zaken die de pagina nu toont. */
const selectie = () => DATA.filter(d => FB.basis(d) && match(d));

/* Hoeveel zaken er overblijven als je een filter anders zet en de rest laat
   staan. Zo klopt het getal bij elke keuze met wat je dan te zien krijgt. */
function telMet(wijzig) {
  const oud = {...f, tags: [...f.tags]};
  Object.assign(f, wijzig);
  let n = 0;
  for (const d of DATA) if (FB.basis(d) && match(d)) n++;
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
  const basis = DATA.filter(FB.basis);
  if (id === 'paneel-p') {
    const aanwezig = new Set(basis.map(d => d.p));
    $('f-prov').innerHTML = keuze('p', '', 'Alle provincies', telMet({p: ''}))
      + PROV_ORDER.filter(p => aanwezig.has(p)).map(p => keuze('p', p, p, telMet({p}))).join('');
  } else if (id === 'paneel-t') {
    const aanwezig = new Set(basis.map(d => d.t).filter(Boolean));
    const soorten = [...SOORT_ORDER.filter(s => aanwezig.has(s)),
      ...[...aanwezig].filter(s => !SOORT_ORDER.includes(s)).sort((a, b) => a.localeCompare(b, 'nl'))];
    const zonder = basis.some(d => !d.t);
    $('f-soort').innerHTML = keuze('t', '', 'Alle soorten', telMet({t: ''}))
      + soorten.map(t => keuze('t', t, t, telMet({t}))).join('')
      + (zonder ? keuze('t', '_geen', 'Soort nog te bepalen', telMet({t: '_geen'})) : '');
  } else if (id === 'paneel-meer') {
    $('f-status').innerHTML = FB.statussen.map(([v, l]) => keuze('s', v, l, telMet({s: v}))).join('');
    /* Kenmerken per thema, in een vaste volgorde; binnen een groep staat het
       meest vastgelegde kenmerk bovenaan. Een kenmerk dat in geen enkele groep
       staat, komt onder Overige, zodat een nieuwe tag nooit verdwijnt. */
    const aantal = {};
    basis.forEach(d => d.tags.forEach(t => { aantal[t] = (aantal[t] || 0) + 1; }));
    const bekend = new Set(TAGGROEPEN.flatMap(([, ts]) => ts));
    const overige = Object.keys(aantal).filter(t => !bekend.has(t));
    const groepen = [...TAGGROEPEN, ['Overige', overige]]
      .map(([naam, ts]) => [naam, ts.filter(t => aantal[t] || f.tags.includes(t))
        .sort((a, b) => (aantal[b] || 0) - (aantal[a] || 0) || a.localeCompare(b, 'nl'))])
      .filter(([, ts]) => ts.length);
    const tagLabel = tag => {
      const aan = f.tags.includes(tag);
      const n = aan ? telMet({}) : telMet({tags: [...f.tags, tag]});
      return `<label class="tag${n === 0 && !aan ? ' leeg' : ''}"><input type="checkbox" value="${esc(tag)}"`
        + `${aan ? ' checked' : ''}><span>${esc(tag)}</span><span class="n">${n.toLocaleString('nl-BE')}</span></label>`;
    };
    $('f-tags').innerHTML = groepen.map(([naam, ts]) =>
      `<div class="taggroep" role="group" aria-label="${esc(naam)}"><h3>${esc(naam)}</h3>`
      + `<div class="taggroepkeuzes">${ts.map(tagLabel).join('')}</div></div>`).join('');
  }
  const n = selectie().length;
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

function sluiten(focusTerug = true, naarRes = false) {
  if (!openPaneel) return;
  const id = openPaneel;
  openPaneel = null;
  $(id).hidden = true;
  $('scherm').hidden = true;
  document.body.classList.remove('paneel-open');
  $(KNOP[id]).setAttribute('aria-expanded', 'false');
  if (naarRes) naarResultaten();
  else if (focusTerug) $(KNOP[id]).focus({preventScroll: true});
}

/* Na een keuze meteen naar de resultaten, vooral op de gsm, waar het paneel
   het scherm vult. De balk blijft bovenaan kleven, dus alleen als de resultaten
   er nog onder zitten schuift de pagina op. */
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
  const ander = $('andereweergave');
  ander.href = ander.dataset.doel + query;
  try { history.replaceState(history.state, '', location.pathname + query + location.hash); } catch (e) {}
}

/* ---- bediening ------------------------------------------------------------ */

function wijzig() {
  if (openPaneel) tekenPaneel(openPaneel);
  FB.teken();
}

function wisAlles() {
  f.p = f.t = f.q = ''; f.s = '_open'; f.tags = []; ruweQ = ''; $('q').value = '';
}

function koppelFilterbalk() {
  let t = null;
  $('q').addEventListener('input', e => {
    ruweQ = e.target.value;
    $('wisq').hidden = !ruweQ;
    clearTimeout(t);
    t = setTimeout(() => { f.q = norm(ruweQ); wijzig(); FB.naZoeken(); }, 120);
  });
  $('zoekform').addEventListener('submit', e => {
    e.preventDefault();
    clearTimeout(t); f.q = norm(ruweQ); wijzig();
    $('q').blur();
    naarResultaten();
  });
  $('wisq').addEventListener('click', () => {
    ruweQ = ''; f.q = ''; $('q').value = ''; wijzig(); $('q').focus();
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
      ruweQ = ''; f.q = ''; $('q').value = ''; wijzig(); $('q').focus();
      return;
    }
    if (e.target.closest('[data-toongesloten]')) {
      f.s = ''; wijzig();
    }
  });
  $('f-tags').addEventListener('change', e => {
    const tag = e.target.value;
    f.tags = e.target.checked ? [...f.tags, tag] : f.tags.filter(x => x !== tag);
    FB.teken();
    tekenPaneel('paneel-meer');
    [...$('f-tags').querySelectorAll('input')].find(i => i.value === tag)?.focus({preventScroll: true});
  });
}

/* Na het laden: de toestand uit de url halen, de knoppen vrijgeven. Een status
   die de pagina niet kent (de kaart heeft geen gesloten zaken) valt terug op de
   standaard. */
function startFilterbalk() {
  ruweQ = leesStaat();
  if (!FB.statussen.some(([v]) => v === f.s)) f.s = '_open';
  $('q').value = ruweQ;
  Object.values(KNOP).forEach(k => { $(k).disabled = false; });
  koppelFilterbalk();
}
