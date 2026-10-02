/* Afspreken in het midden. Twee tot zes mensen vullen in waar ze vertrekken; de
   pagina zoekt plaatsen met cafés die voor iedereen ongeveer even ver liggen.

   Alles gebeurt hier in de browser: de plaatsen, de afstanden en de keuze. Er
   gaat niets naar een server. Wie "Mijn plek" gebruikt, krijgt de dichtste
   plaats uit de gids ingevuld; de coördinaten zelf blijven in de pagina en komen
   niet in de url.

   De url bewaart de keuze, zodat je ze kunt doorsturen:
   afspreken.html?van=Aalst&van=Sint-Niklaas&t=Volkscafé&tag=Terras&s=Geverifieerd */

const MAX_MENSEN = 6;
const VOORSTELLEN = 5;      /* zoveel plaatsen tonen we */
const PER_PLAATS = 3;       /* zoveel cafés per plaats in de uitslag */
const LETTERS = 'ABCDEF';

/* ---- de plaatsen ------------------------------------------------------------
   Een plaats is een gemeente of deelgemeente zoals ze in de gids staat. Haar
   ligging is de mediaan van de cafés die er liggen: zo trekt één verkeerde
   coördinaat het punt niet scheef. Een hoofdgemeente zonder eigen cafés krijgt
   de mediaan van de cafés in haar deelgemeenten. */
const PLAATS = new Map();   /* label -> {label, p, ll: [lat, lon]} */

const sleutel = s => norm(s).replace(/[^a-z0-9]/g, '');
const mediaan = xs => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function bouwPlaatsen() {
  const eigen = new Map(), binnen = new Map(), prov = new Map();
  const voeg = (m, k, d) => { if (!m.has(k)) m.set(k, []); m.get(k).push([d.lat, d.lon]); };
  for (const d of DATA) {
    if (!d.lat || !d.g) continue;
    voeg(eigen, d.g, d);
    if (!prov.has(d.g)) prov.set(d.g, d.p);
    const hoofd = (d.g.match(/\(([^)]+)\)\s*$/) || [])[1];
    if (hoofd) {
      voeg(binnen, hoofd.trim(), d);
      if (!prov.has(hoofd.trim())) prov.set(hoofd.trim(), d.p);
    }
  }
  for (const [label, pts] of [...binnen, ...eigen]) {
    PLAATS.set(label, {label, p: prov.get(label),
      ll: [mediaan(pts.map(x => x[0])), mediaan(pts.map(x => x[1]))]});
  }
  const labels = [...PLAATS.keys()].sort((a, b) => a.localeCompare(b, 'nl'));
  $('plaatsen').innerHTML = labels.map(l => `<option value="${esc(l)}">`).join('');
}

/* Wat iemand typt, terug naar een plaats uit de gids. Eerst de volledige naam,
   dan de deelgemeente zonder haakjes ("Grembergen"), dan het begin van een naam
   als dat maar op één plaats past ("Sint-Nik"). */
function vindPlaats(tekst) {
  const k = sleutel(tekst);
  if (!k) return null;
  const alle = [...PLAATS.values()];
  const exact = alle.find(x => sleutel(x.label) === k);
  if (exact) return exact;
  const deel = alle.filter(x => sleutel(x.label.split('(')[0]) === k);
  if (deel.length) return deel.sort((a, b) => a.label.length - b.label.length)[0];
  const begin = alle.filter(x => sleutel(x.label).startsWith(k));
  return begin.length === 1 ? begin[0] : null;
}

function dichtstePlaats(ll) {
  let best = null, bestKm = Infinity;
  for (const x of PLAATS.values()) {
    const a = afstand(ll, x.ll);
    if (a < bestKm) { best = x; bestKm = a; }
  }
  return best;
}

function afstand(a, b) {   /* in km, over de bol */
  const r = Math.PI / 180;
  const h = Math.sin((b[0] - a[0]) * r / 2) ** 2
    + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
function km(x) {
  if (x < 1) return Math.max(100, Math.round(x * 10) * 100) + ' m';
  return x.toFixed(x < 10 ? 1 : 0).replace('.', ',') + ' km';
}

/* ---- de keuze ---------------------------------------------------------------
   Eerlijk gaat voor gemiddeld: een café telt naar de langste rit van wie er moet
   komen. Het beste café bepaalt hoe ver iedereen minstens moet. Plaatsen die
   daar niet veel boven zitten (15% plus 2 km) zijn allemaal redelijk; daarbinnen
   gaat een plaats met meer cafés voor, want dan is er een plan B als het eerste
   dicht is. Een café met status te bevestigen telt daarbij half. */
function zoekMidden(vertrek) {
  const kand = [];
  for (const d of DATA) {
    if (!d.lat || d.s === 'Gesloten' || !match(d)) continue;
    const ritten = vertrek.map(v => afstand(v.ll, [d.lat, d.lon]));
    kand.push({d, ritten, max: Math.max(...ritten)});
  }
  if (!kand.length) return [];
  const best = Math.min(...kand.map(c => c.max));
  const grens = best * 1.15 + 2;
  const maat = Math.max(best, 5);

  const perPlaats = new Map();
  for (const c of kand) {
    const g = c.d.g || c.d.p;
    if (!perPlaats.has(g)) perPlaats.set(g, []);
    perPlaats.get(g).push(c);
  }
  const plaatsen = [];
  for (const [g, cs] of perPlaats) {
    cs.sort((a, b) => a.max - b.max);
    if (cs[0].max > grens) continue;
    /* Het voordeel van meer cafés blijft klein en houdt op bij acht: anders wint
       bij lange afstanden altijd de grote stad, ook als ze scheef ligt. */
    const gewicht = cs.reduce((n, c) => n + (c.d.s === 'Geverifieerd' ? 1 : .5), 0);
    const score = cs[0].max - Math.min(.08 * maat, 1.5) * Math.log(Math.min(Math.max(1, gewicht), 8));
    /* Binnen een plaats gaan de cafés binnen de grens voor, en daarbinnen de
       online gecontroleerde. Het eerste café is het punt op de kaart en in de ritten. */
    const rang = c => (c.max > grens ? 2 : 0) + (c.d.s !== 'Geverifieerd' ? 1 : 0);
    cs.sort((a, b) => rang(a) - rang(b) || a.max - b.max);
    plaatsen.push({g, p: cs[0].d.p, top: cs[0], cafes: cs, score});
  }
  plaatsen.sort((a, b) => a.score - b.score);
  return plaatsen.slice(0, VOORSTELLEN);
}

/* ---- het formulier ------------------------------------------------------------ */

function veld(i, waarde) {
  return `<li class="vertrek" data-i="${i}">`
    + `<span class="letter" aria-hidden="true">${LETTERS[i]}</span>`
    + `<label class="sr" for="van-${i}">Vertrekplaats ${i + 1}</label>`
    + `<input id="van-${i}" class="vanveld" list="plaatsen" autocomplete="off" spellcheck="false"`
    + ` enterkeyhint="search" placeholder="${i === 0 ? 'Bijvoorbeeld Aalst' : i === 1 ? 'Bijvoorbeeld Sint-Niklaas' : 'Nog een gemeente'}"`
    + ` value="${esc(waarde || '')}" aria-describedby="fout-${i}">`
    + `<button type="button" class="mijnplek" data-plek="${i}" title="Gebruik mijn plek">`
    + `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.6"/>`
    + `<path d="M12 2.5v2.8M12 18.7v2.8M2.5 12h2.8M18.7 12h2.8"/></svg><span class="sr">Gebruik mijn plek</span></button>`
    + (i >= 2 ? `<button type="button" class="weg" data-weg="${i}"><span class="sr">Vertrekplaats ${i + 1} weghalen</span>`
      + `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3 3 9"/></svg></button>` : '')
    + `<span class="veldfout" id="fout-${i}" role="alert"></span></li>`;
}

function waarden() {
  return [...document.querySelectorAll('.vanveld')].map(x => x.value);
}
function tekenVelden(lijst, focus) {
  $('vertrekken').innerHTML = lijst.map((w, i) => veld(i, w)).join('');
  $('erbij').hidden = lijst.length >= MAX_MENSEN;
  if (focus !== undefined) $('van-' + focus)?.focus();
}

function tekenFilters() {
  const open = DATA.filter(d => d.lat && d.s !== 'Gesloten');
  const soorten = SOORT_ORDER.filter(s => open.some(d => d.t === s));
  $('fsoort').innerHTML = '<option value="">Alle soorten</option>'
    + soorten.map(s => `<option${s === f.t ? ' selected' : ''}>${esc(s)}</option>`).join('');
  const aantal = {};
  open.forEach(d => d.tags.forEach(t => { aantal[t] = (aantal[t] || 0) + 1; }));
  $('fkenmerk').innerHTML = '<option value="">Geen voorkeur</option>'
    + TAGGROEPEN.map(([naam, ts]) => {
      const opts = ts.filter(t => aantal[t] >= 5 || f.tags.includes(t));
      return opts.length ? `<optgroup label="${esc(naam)}">`
        + opts.map(t => `<option${f.tags.includes(t) ? ' selected' : ''}>${esc(t)}</option>`).join('')
        + '</optgroup>' : '';
    }).join('');
  $('fgecontroleerd').checked = f.s === 'Geverifieerd';
}

function leesFilters() {
  f.t = $('fsoort').value;
  f.tags = $('fkenmerk').value ? [$('fkenmerk').value] : [];
  f.s = $('fgecontroleerd').checked ? 'Geverifieerd' : '_open';
}

/* ---- de url ------------------------------------------------------------------- */

function schrijfUrl(namen) {
  const u = new URLSearchParams();
  namen.forEach(n => u.append('van', n));
  if (f.t) u.set('t', f.t);
  f.tags.forEach(t => u.append('tag', t));
  if (f.s === 'Geverifieerd') u.set('s', 'Geverifieerd');
  try { history.replaceState(null, '', location.pathname + '?' + u); } catch (e) {}
}

/* ---- de kaart ------------------------------------------------------------------ */

let kaart = null, laag = null;
function maakKaart() {
  if (kaart) return;
  kaart = L.map('kaart', {zoomControl: true, scrollWheelZoom: false, minZoom: 7, maxZoom: 18});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18
  }).addTo(kaart);
  laag = L.layerGroup().addTo(kaart);
  /* De kaart staat eerst verborgen en springt bij een smaller scherm onder het
     formulier: telkens als haar vak van maat verandert, opnieuw passend zetten. */
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => { kaart.invalidateSize(); if (grenzen) pasKaart(); }).observe($('kaart'));
  }
}

let grenzen = null;
function pasKaart() {
  /* onderaan meer ruimte: daar hangt de naam onder elk vertrekpunt */
  kaart.fitBounds(grenzen, {paddingTopLeft: [36, 36], paddingBottomRight: [36, 58], maxZoom: 14});
}

function tekenKaart(vertrek, plaatsen) {
  maakKaart();
  laag.clearLayers();
  const punten = [];
  if (plaatsen[0]) {
    const doel = [plaatsen[0].top.d.lat, plaatsen[0].top.d.lon];
    vertrek.forEach(v => L.polyline([v.ll, doel], {color: '#132738', weight: 2, opacity: .55,
      dashArray: '4 7', interactive: false}).addTo(laag));
  }
  plaatsen.forEach((pl, i) => {
    pl.cafes.slice(0, PER_PLAATS).forEach((c, j) => {
      const ll = [c.d.lat, c.d.lon];
      punten.push(ll);
      const m = j === 0
        ? L.marker(ll, {icon: L.divIcon({className: 'nummer', html: `<span>${i + 1}</span>`,
            iconSize: [30, 30], iconAnchor: [15, 15]}), zIndexOffset: 500 - i})
        : L.circleMarker(ll, {radius: 6, weight: 2.5, color: '#fbf7f0', fillColor: '#cf4521', fillOpacity: 1});
      m.bindTooltip(`${c.d.n}, ${c.d.g}`, {direction: 'top', offset: [0, j ? -6 : -14]});
      if (c.d.u) m.on('click', () => { location.href = '/' + c.d.u + '/'; });
      m.addTo(laag);
    });
  });
  vertrek.forEach((v, i) => {
    punten.push(v.ll);
    L.marker(v.ll, {icon: L.divIcon({className: 'vertrekpunt', html: `<span>${LETTERS[i]}</span>`,
      iconSize: [28, 28], iconAnchor: [14, 14]}), keyboard: false})
      .bindTooltip(v.naam, {direction: 'bottom', offset: [0, 12], permanent: true, className: 'vertreklabel'})
      .addTo(laag);
  });
  kaart.invalidateSize();
  grenzen = L.latLngBounds(punten);
  pasKaart();
}

/* ---- de uitslag ----------------------------------------------------------------- */

function statusRegel(d) {
  return d.s === 'Te checken' ? '<span class="zstatus todo">Status te bevestigen</span>' : '';
}

function cafeRij(c) {
  const d = c.d;
  const meta = [d.a ? esc(d.a) : '<span class="onbekend">adres nog aan te vullen</span>', d.t ? esc(d.t) : '']
    .filter(Boolean).join('<span class="sep" aria-hidden="true"> · </span>');
  const binnen = `<span class="ztekst"><span class="znaam">${esc(c.d.n)}</span>`
    + `<span class="zmeta">${meta}</span>${statusRegel(c.d)}</span>`
    + (c.d.foto ? `<img class="zfoto" src="fotos/${esc(c.d.foto)}-klein.avif" alt="" width="64" height="64"`
      + ` loading="lazy" decoding="async">` : '');
  return `<li class="zaak">${c.d.u ? `<a class="rij" href="/${esc(c.d.u)}/">${binnen}</a>`
    : `<div class="rij">${binnen}</div>`}</li>`;
}

function ritten(vertrek, c) {
  return vertrek.map((v, i) => `<span class="rit"><span class="letter klein" aria-hidden="true">${LETTERS[i]}</span>`
    + `${esc(v.naam.split(' (')[0])} <b>${km(c.ritten[i])}</b></span>`).join('');
}

function noemNamen(vertrek) {
  const n = [...new Set(vertrek.map(v => v.naam.split(' (')[0]))];
  return n.length === 1 ? n[0] : n.slice(0, -1).join(', ') + ' en ' + n[n.length - 1];
}

function tekenUitslag(vertrek, plaatsen) {
  const U = $('uitslag');
  U.hidden = false;
  if (!plaatsen.length) {
    U.innerHTML = '<div class="leeg"><p class="leegkop">Geen café gevonden.</p>'
      + '<p>Geen enkel café uit de gids past bij deze keuzes. Laat een filter vallen en probeer opnieuw.</p></div>';
    $('kaartvak').hidden = true;
    return;
  }
  $('kaartvak').hidden = false;
  const zelfde = new Set(vertrek.map(v => v.naam)).size === 1;
  U.innerHTML = `<h2 class="uitslagkop">${zelfde ? 'Dicht bij ' : 'In het midden van '}${esc(noemNamen(vertrek))}</h2>`
    + '<ol class="voorstellen">' + plaatsen.map((pl, i) => {
      const n = pl.cafes.length;
      const zoek = 'index.html?q=' + encodeURIComponent(pl.g.split(' (')[0]);
      return `<li class="voorstel" data-i="${i}">`
        + `<div class="voorstelkop"><span class="nummer" aria-hidden="true"><span>${i + 1}</span></span>`
        + `<h3><span class="pnaam">${esc(pl.g)}</span><span class="pprov">${esc(pl.p)}</span></h3></div>`
        + `<p class="ritten" aria-label="Afstand in vogelvlucht">${ritten(vertrek, pl.top)}</p>`
        + `<ul class="zaken">${pl.cafes.slice(0, PER_PLAATS).map(cafeRij).join('')}</ul>`
        + (n > PER_PLAATS ? `<p class="meer"><a href="${zoek}">Alle ${n} cafés in ${esc(pl.g.split(' (')[0])}</a></p>` : '')
        + '</li>';
    }).join('') + '</ol>'
    + '<p class="uitleg-afstand">Afstanden in vogelvlucht, naar het eerste café van elke plaats. '
    + 'Wie over de Schelde of met de trein moet, is soms langer onderweg. '
    + 'Kijk voor je vertrekt even na of de zaak open is.</p>';
}

/* ---- zoeken -------------------------------------------------------------------- */

function zoek(focusUitslag) {
  const velden = [...document.querySelectorAll('.vanveld')];
  const vertrek = [];
  let fout = false;
  velden.forEach((x, i) => {
    const melding = $('fout-' + i);
    melding.textContent = '';
    x.removeAttribute('aria-invalid');
    if (!x.value.trim()) return;
    const pl = vindPlaats(x.value);
    if (!pl) {
      melding.textContent = 'Deze plaats staat niet in de gids. Kies een gemeente uit de lijst.';
      x.setAttribute('aria-invalid', 'true');
      fout = true;
      return;
    }
    x.value = pl.label;
    vertrek.push({naam: pl.label, ll: pl.ll});
  });
  if (fout) return;
  if (vertrek.length < 2) {
    $('formfout').textContent = 'Vul minstens twee vertrekplaatsen in.';
    return;
  }
  $('formfout').textContent = '';
  leesFilters();
  schrijfUrl(vertrek.map(v => v.naam));
  const plaatsen = zoekMidden(vertrek);
  document.body.classList.add('heeftuitslag');
  tekenUitslag(vertrek, plaatsen);
  if (plaatsen.length) tekenKaart(vertrek, plaatsen);
  if (focusUitslag) {
    $('uitslag').scrollIntoView({behavior: 'smooth', block: 'start'});
  }
}

function gebruikMijnPlek(i) {
  const knop = document.querySelector(`[data-plek="${i}"]`);
  const melding = $('fout-' + i);
  if (!('geolocation' in navigator)) { melding.textContent = 'Deze browser kan je locatie niet doorgeven.'; return; }
  knop.setAttribute('aria-busy', 'true');
  navigator.geolocation.getCurrentPosition(pos => {
    knop.removeAttribute('aria-busy');
    const pl = dichtstePlaats([pos.coords.latitude, pos.coords.longitude]);
    if (pl) { $('van-' + i).value = pl.label; melding.textContent = ''; }
  }, err => {
    knop.removeAttribute('aria-busy');
    melding.textContent = err.code === 1
      ? 'Je locatie is niet gedeeld. Typ je gemeente in, of sta locatie toe voor deze site.'
      : 'Je locatie kon niet bepaald worden. Typ je gemeente in.';
  }, {enableHighAccuracy: false, timeout: 12000, maximumAge: 300000});
}

function koppel() {
  $('afspraak').addEventListener('submit', e => { e.preventDefault(); zoek(true); });
  $('erbij').addEventListener('click', () => {
    const w = waarden();
    if (w.length < MAX_MENSEN) tekenVelden([...w, ''], w.length);
  });
  $('vertrekken').addEventListener('click', e => {
    const weg = e.target.closest('[data-weg]');
    if (weg) {
      const w = waarden();
      w.splice(+weg.dataset.weg, 1);
      tekenVelden(w, Math.min(+weg.dataset.weg, w.length - 1));
      return;
    }
    const plek = e.target.closest('[data-plek]');
    if (plek) gebruikMijnPlek(+plek.dataset.plek);
  });
  /* Een keuze uit de lijst met suggesties: meteen nakijken, zodat een fout al
     zichtbaar is voor je op de knop drukt. */
  $('vertrekken').addEventListener('change', e => {
    if (!e.target.classList.contains('vanveld')) return;
    const i = e.target.closest('.vertrek').dataset.i;
    const pl = vindPlaats(e.target.value);
    $('fout-' + i).textContent = e.target.value.trim() && !pl
      ? 'Deze plaats staat niet in de gids. Kies een gemeente uit de lijst.' : '';
    if (pl) e.target.value = pl.label;
  });
  ['fsoort', 'fkenmerk', 'fgecontroleerd'].forEach(id => $(id).addEventListener('change', () => {
    if (document.body.classList.contains('heeftuitslag')) zoek(false);
  }));
}

/* ---- laden ---------------------------------------------------------------------- */

function laadfout() {
  $('laadmelding').hidden = false;
  $('laadmelding').innerHTML = '<p class="leegkop">De lijst kwam niet binnen.</p>'
    + '<p>Controleer je verbinding en probeer het opnieuw.</p>'
    + '<p class="leegknoppen"><button type="button" class="knop" id="opnieuw">Opnieuw proberen</button></p>';
  $('opnieuw').addEventListener('click', () => { $('laadmelding').hidden = true; laadData(gereed, laadfout); });
}

let geladen = false;
function gereed() {
  if (geladen) return;
  geladen = true;
  bouwPlaatsen();
  const u = new URLSearchParams(location.search);
  f.t = u.get('t') || '';
  f.tags = u.getAll('tag').filter(Boolean).slice(0, 1);
  f.s = u.get('s') === 'Geverifieerd' ? 'Geverifieerd' : '_open';
  const van = u.getAll('van').filter(Boolean).slice(0, MAX_MENSEN);
  tekenVelden(van.length >= 2 ? van : [...van, '', ''].slice(0, 2));
  tekenFilters();
  koppel();
  document.querySelectorAll('#afspraak [disabled]').forEach(x => { x.disabled = false; });
  $('foot').textContent = 'De gids telt ' + DATA.length.toLocaleString('nl-BE') + ' zaken';
  if (van.length >= 2) zoek(false);
}

laadData(gereed, laadfout);
