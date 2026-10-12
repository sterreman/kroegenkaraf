/* De lijst. De zaken gegroepeerd per plaats; elke zaak linkt naar haar eigen
   pagina op /cafe/<plaats>/<naam>/. De zoekbalk, de filters en de chips komen
   uit filterbalk.js, het filteren zelf uit gemeen.js. */

let geladen = false;

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

/* Hoe vaak elk kenmerk voorkomt. In de lijst tonen we per zaak de drie
   zeldzaamste: "Aan het water" zegt meer over een café dan "Gezellig". */
const TAGTEL = {};
function telKenmerken() {
  DATA.forEach(d => d.tags.forEach(t => { TAGTEL[t] = (TAGTEL[t] || 0) + 1; }));
}
function kenmerken(d) {
  const kies = [...d.tags].sort((a, b) => (TAGTEL[a] || 0) - (TAGTEL[b] || 0)).slice(0, 3);
  const ts = d.tags.filter(t => kies.includes(t));
  return ts.length ? `<span class="ztags">${ts.map(esc).join('<span class="sep" aria-hidden="true"> · </span>')}</span>` : '';
}

function rij(d) {
  const meta = [d.a ? esc(d.a) : '<span class="onbekend">adres nog aan te vullen</span>',
                d.t ? esc(d.t) : ''].filter(Boolean).join('<span class="sep" aria-hidden="true"> · </span>');
  const binnen = `<span class="ztekst"><span class="znaam">${esc(d.n)}</span>`
    + `<span class="zmeta">${meta}</span>${kenmerken(d)}${statusRegel(d)}</span>`
    + (d.foto ? `<img class="zfoto" src="fotos/${esc(d.foto)}-klein.avif" alt="" width="64" height="64"`
      + ` loading="lazy" decoding="async">` : '');
  return `<li class="zaak${d.s === 'Gesloten' ? ' dicht' : ''}" data-i="${d._i}">`
    + (d.u ? `<a class="rij" href="/${esc(d.u)}/">${binnen}</a>` : `<div class="rij">${binnen}</div>`)
    + '</li>';
}

/* De plaatsnaam boven een groep linkt door. Heeft de hoofdgemeente een eigen
   pagina (GEMEENTEPAGINAS, door cafepaginas.py in lijst.html gezet), dan gaat
   de link daarheen; een deelgemeente springt naar haar kopje op die pagina,
   zoals de kruimel op een cafepagina. Zonder pagina filtert de link de lijst op
   die plaats. Staat de lijst al op die plaats gefilterd, dan is er geen link. */
const urlDeel = t => norm(t).replace(/&/g, ' en ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'zaak';
const hoofdVan = g => ((g || '').match(/\(([^)]+)\)/) || [, g || ''])[1].trim();
const plaatsVan = g => (g || '').split(' (')[0].trim();
const OPENPLAATS = new Set();
function gemeenteLink(g) {
  if (!g) return '';
  const pagina = typeof GEMEENTEPAGINAS === 'object' && GEMEENTEPAGINAS
    ? GEMEENTEPAGINAS[sleutel(hoofdVan(g))] : '';
  const p = plaatsVan(g);
  if (pagina) {
    if (sleutel(p) === sleutel(hoofdVan(g))) return `/${pagina}/`;
    /* op de gemeentepagina staan gesloten zaken onder hun eigen kopjes */
    return `/${pagina}/#${OPENPLAATS.has(g) ? '' : 'gesloten-'}${urlDeel(p)}`;
  }
  if (f.q && f.q.trim() === norm(p)) return '';
  return '/lijst?q=' + encodeURIComponent(p);
}
function plaatsNaam(g) {
  if (!g) return '<span class="pnaam">Gemeente nog te bepalen</span>';
  const u = gemeenteLink(g);
  const pagina = u && !u.startsWith('/lijst');
  return u
    ? `<a class="pnaam" href="${esc(u)}"${pagina ? ` title="Alle cafés in ${esc(hoofdVan(g))}"` : ''}>${esc(g)}</a>`
    : `<span class="pnaam">${esc(g)}</span>`;
}

function render() {
  const res = selectie();
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
      html += `<section class="plaats"><h2 class="plaatskop">${plaatsNaam(d.g)}`
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

/* lijst.html#123 of #cafe/... wijst een zaak aan, bijvoorbeeld vanuit een oude
   link. Valt die buiten de filters, dan gaan die open. */
function naarAnker() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (!h) return;
  const i = h.startsWith('cafe/') ? DATA.findIndex(d => d.u === h) : parseInt(h, 10);
  if (isNaN(i) || !DATA[i]) return;
  if (!match(DATA[i])) {
    wisAlles(); f.s = '';
    render();
  }
  const el = document.querySelector(`.zaak[data-i="${DATA[i]._i}"]`);
  if (!el) return;
  el.classList.add('gevonden');
  el.scrollIntoView({block: 'center'});
  setTimeout(() => el.classList.remove('gevonden'), 2600);
}
addEventListener('hashchange', naarAnker);

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
  telKenmerken();
  DATA.forEach(d => { if (d.g && d.s !== 'Gesloten') OPENPLAATS.add(d.g); });
  $('foot').textContent = 'De gids telt ' + DATA.length.toLocaleString('nl-BE')
    + ' zaken · bijgewerkt ' + BIJGEWERKT;
  FB.teken = render;
  FB.naZoeken = () => scrollTo({top: 0});
  startFilterbalk();
  render();
  if (location.hash) naarAnker();
  else herstelPlek();
}

laadData(gereed, laadfout);
