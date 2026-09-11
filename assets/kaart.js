/* De kaart. Leaflet met de tegels van OpenStreetMap, de zaken
   geclusterd zodat tweeduizend spelden geen brij worden. */

const START = [51.03, 4.35];   /* ergens tussen Gent, Brussel en Antwerpen */
const START_ZOOM = 9;

/* Gesloten zaken blijven van de kaart. Een zaak die dicht is heeft vaak een
   opvolger op hetzelfde adres, en dan staan er twee spelden op een punt. */
TOON_GESLOTEN = false;

const kaart = L.map('kaart', {
  center: START, zoom: START_ZOOM, minZoom: 7, maxZoom: 19,
  zoomControl: true, scrollWheelZoom: true
});

/* De gewone tegels van OpenStreetMap. Die mogen zonder sleutel voor een site
   van deze omvang, zolang de bronvermelding zichtbaar blijft staan. Carto viel af:
   dat is enkel voor hun eigen klanten en zet anders "API KEY REQUIRED" over de
   kaart. De tegels worden in css wat ontkleurd zodat ze niet vechten met het
   palet en de spelden het luidst blijven. */
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19
}).addTo(kaart);

const KLEUR = {'Geverifieerd': '#2f6b43', 'Te checken': '#cf4521'};

const cluster = L.markerClusterGroup({
  /* Van dichtbij kleinere trossen: wie In de buurt gebruikt in een stad, wil de
     cafés zelf zien en niet op een bolletje met 15 moeten tikken. */
  maxClusterRadius: z => z >= 15 ? 22 : 48,
  showCoverageOnHover: false,
  spiderfyOnMaxZoom: true,
  chunkedLoading: true,
  iconCreateFunction(c) {
    const n = c.getChildCount();
    const maat = n < 10 ? 'klein' : n < 100 ? 'midden' : 'groot';
    return L.divIcon({
      html: `<div><span>${n}</span></div>`,
      className: 'tros tros-' + maat,
      iconSize: L.point(38, 38)
    });
  }
});
kaart.addLayer(cluster);

const spelden = new Map();   /* index in DATA -> marker */
let ZICHTBAAR = [];          /* de zaken die nu op de kaart staan, na de filters */

/* ---- in de buurt -------------------------------------------------------------
   De plek van de bezoeker komt van de browser, die daar zelf toestemming voor
   vraagt. Dat werkt alleen over https, dus op de echte site en niet vanaf een
   los bestand. De plek blijft in de pagina en gaat nergens naartoe. */
let mijnPlek = null;
kaart.createPane('jij');
kaart.getPane('jij').style.zIndex = 640;   /* boven de spelden, onder de ballonnetjes */
const jijLaag = L.layerGroup().addTo(kaart);

function afstand(a, b) {   /* in km, over de bol */
  const r = Math.PI / 180;
  const h = Math.sin((b[0] - a[0]) * r / 2) ** 2
    + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
function km(x) {
  if (x < 1) return Math.max(10, Math.round(x * 100) * 10) + ' m';
  return x.toFixed(x < 10 ? 1 : 0).replace('.', ',') + ' km';
}

let meldKlok = null;
function meld(tekst) {
  const el = document.getElementById('melding');
  el.textContent = tekst;
  el.hidden = false;
  clearTimeout(meldKlok);
  meldKlok = setTimeout(() => { el.hidden = true; }, 7000);
}

/* Zoom zo dat de bezoeker en de acht dichtste zaken samen in beeld staan. In een
   stad is dat een paar straten, op het platteland een paar dorpen. Een vaste
   zoomstand zou op het platteland vaak een lege kaart geven. */
function toonBuurt() {
  const lijst = ZICHTBAAR.map(d => [afstand(mijnPlek, [d.lat, d.lon]), d])
    .sort((x, y) => x[0] - y[0]);
  if (!lijst.length) {
    kaart.setView(mijnPlek, 14);
    meld('Er staan geen zaken op de kaart die bij de filters passen.');
    return;
  }
  const dichtst = lijst.slice(0, 8);
  kaart.fitBounds(L.latLngBounds([mijnPlek, ...dichtst.map(([, d]) => [d.lat, d.lon])]),
                  {padding: [44, 44], maxZoom: 16});
  if (lijst[0][0] > 40) meld(`Het dichtste café uit de gids ligt op ${km(lijst[0][0])}.`);
}

function zoekMij() {
  const knop = document.getElementById('buurt');
  if (!('geolocation' in navigator)) {
    meld('Deze browser kan je locatie niet doorgeven.');
    return;
  }
  knop.setAttribute('aria-busy', 'true');
  navigator.geolocation.getCurrentPosition(pos => {
    knop.removeAttribute('aria-busy');
    mijnPlek = [pos.coords.latitude, pos.coords.longitude];
    jijLaag.clearLayers();
    L.circle(mijnPlek, {radius: Math.min(pos.coords.accuracy || 0, 1500), pane: 'jij',
      weight: 0, fillColor: '#2a7de1', fillOpacity: .12, interactive: false}).addTo(jijLaag);
    L.circleMarker(mijnPlek, {radius: 7, weight: 2.5, color: '#ffffff', opacity: 1,
      fillColor: '#2a7de1', fillOpacity: 1, pane: 'jij'})
      .bindTooltip('Jij bent hier', {direction: 'top', offset: [0, -7]}).addTo(jijLaag);
    toonBuurt();
  }, err => {
    knop.removeAttribute('aria-busy');
    meld(err.code === 1
      ? 'Je locatie is niet gedeeld. Sta locatie toe voor deze site in je browser en probeer opnieuw.'
      : 'Je locatie kon niet bepaald worden. Probeer het straks nog eens, liefst buiten.');
  }, {enableHighAccuracy: true, timeout: 12000, maximumAge: 60000});
}
document.getElementById('buurt').addEventListener('click', zoekMij);

function ballon(d) {
  return `<div class="ballon">`
    + `<span class="nm">${esc(d.n)}</span>`
    + `<span class="ad">${esc([d.a, d.g].filter(Boolean).join(', ') || 'adres nog aan te vullen')}</span>`
    + (mijnPlek ? `<span class="afst">op ${km(afstand(mijnPlek, [d.lat, d.lon]))} van jou</span>` : '')
    + `<span class="st">${esc(d.t || 'soort nog te bepalen')} · ${esc(d.s)}`
    + `${d.z ? ' ' + esc(d.z) : ''}</span>`
    + (d.i ? `<p>${esc(d.i)}</p>` : '')
    + `<div class="acts">`
      + `<a class="btn map" href="${mapsUrl(d)}" target="_blank" rel="noopener"`
      + ` title="${esc(d.n)} op Google Maps" aria-label="${esc(d.n)} op Google Maps">${SPELD}</a>`
      + `<a class="btn" href="index.html#${d._i}">In de lijst</a>`
      + socKnop(d, d.fb, 'fb', 'Facebook') + socKnop(d, d.ig, 'ig', 'Instagram')
    + `</div></div>`;
}

function teken() {
  const res = DATA.filter(d => d.lat && d.s !== 'Gesloten' && match(d));
  ZICHTBAAR = res;
  cluster.clearLayers();
  spelden.clear();
  const laag = res.map(d => {
    const m = L.circleMarker([d.lat, d.lon], {
      radius: 6, weight: 1.5, color: '#fdf8ee', opacity: .9,
      fillColor: KLEUR[d.s] || '#cf4521', fillOpacity: .92
    });
    m.bindPopup(() => ballon(d), {maxWidth: 300, minWidth: 220, autoPanPadding: [24, 24]});
    m.bindTooltip(d.n + ' — ' + d.g, {direction: 'top', offset: [0, -6]});
    spelden.set(d._i, m);
    return m;
  });
  cluster.addLayers(laag);

  const gv = res.filter(d => d.s === 'Geverifieerd').length;
  const plaatsen = new Set(res.map(d => d.p + '|' + d.g)).size;
  document.getElementById('tally').innerHTML =
    `<div><b>${res.length}</b><span>op de kaart</span></div>`
    + `<div><b>${gv}</b><span>geverifieerd</span></div>`
    + `<div><b>${res.length - gv}</b><span>te checken</span></div>`
    + `<div><b>${plaatsen}</b><span>plaatsen</span></div>`;
}

/* kaart.html#123 opent die ene zaak, zodat de lijst ernaar kan doorlinken.
   kaart.html#buurt zoekt meteen de zaken rond de bezoeker. */
function naarAnker() {
  if (location.hash === '#buurt') { zoekMij(); return; }
  const i = parseInt(location.hash.slice(1), 10);
  if (isNaN(i) || !DATA[i] || !DATA[i].lat || DATA[i].s === 'Gesloten') return;
  const d = DATA[i];
  kaart.setView([d.lat, d.lon], 17);
  const m = spelden.get(i);
  if (m) cluster.zoomToShowLayer(m, () => m.openPopup());
}
addEventListener('hashchange', naarAnker);

document.getElementById('heel').addEventListener('click', () => {
  kaart.setView(START, START_ZOOM);
});

laadData(() => {
  const open = DATA.filter(d => d.s !== 'Gesloten');
  const zonder = open.filter(d => !d.lat).length;
  document.getElementById('foot').textContent =
    (open.length - zonder) + ' zaken met een adres op de kaart · '
    + zonder + ' wachten nog op coördinaten · gesloten zaken staan alleen in de '
    + 'lijst · bijgewerkt ' + BIJGEWERKT;
  renderChips();
  teken();
  naarAnker();
  opnieuw = teken;
});
