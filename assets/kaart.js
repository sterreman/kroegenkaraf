/* De kaart. Leaflet met de tegels van OpenStreetMap, de zaken
   geclusterd zodat tweeduizend spelden geen brij worden. */

const START = [51.03, 4.35];   /* ergens tussen Gent, Brussel en Antwerpen */
const START_ZOOM = 9;

/* Gesloten zaken blijven van de kaart. Een zaak die dicht is heeft vaak een
   opvolger op hetzelfde adres, en dan staan er twee spelden op een punt. Dat
   staat in FB.basis, onderaan. */
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

/* De spelden in roest, de kleur die op de ontkleurde tegels het meest opvalt.
   Online gecontroleerd is een volle stip met een crème rand, status te bevestigen
   een ring met een crème kern. Zo verschillen ze ook in vorm, niet alleen in kleur. */
const SPELD_STIJL = {
  'Geverifieerd': {radius: 8, weight: 3, color: '#fbf7f0', opacity: 1, fillColor: '#cf4521', fillOpacity: 1},
  'Te checken': {radius: 7.5, weight: 3.5, color: '#cf4521', opacity: 1, fillColor: '#fbf7f0', fillOpacity: 1}
};

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

/* Lange beschrijvingen staan volledig op de cafépagina; de ballon toont een begin. */
function inkort(t, n = 220) {
  t = t.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return t.slice(0, n).replace(/\s+\S*$/, '').replace(/[,;:.]+$/, '') + '…';
}

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli',
  'augustus', 'september', 'oktober', 'november', 'december'];
function datum(t) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t || '');
  return m ? `${+m[3]} ${MAANDEN[+m[2] - 1]} ${m[1]}` : (t || '');
}

function ballon(d) {
  const status = d.s === 'Geverifieerd'
    ? 'Online gecontroleerd' + (d.v ? ' op ' + esc(datum(d.v)) : '') + '. Dat zegt niets over de openingsuren van vandaag.'
    : 'Status te bevestigen. Controleer voor je bezoek of de zaak nog actief is.';
  return `<div class="ballon">`
    + (d.u ? `<a class="bnaam" href="/${esc(d.u)}/">${esc(d.n)}</a>` : `<span class="bnaam">${esc(d.n)}</span>`)
    + `<span class="bmeta">${esc([d.t, [d.a, d.g].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'adres nog aan te vullen')}</span>`
    + (mijnPlek ? `<span class="bafst">Op ${km(afstand(mijnPlek, [d.lat, d.lon]))} van jou</span>` : '')
    + (d.k || d.i ? `<p>${esc(inkort(d.k || d.i, 160))}</p>` : '')
    + `<p class="bstatus">${status}</p>`
    + `<div class="bacties">`
      + (d.u ? `<a class="bmeer" href="/${esc(d.u)}/">Meer info</a>` : '')
      + `<a class="blink" href="${mapsUrl(d)}" target="_blank" rel="noopener">Google Maps</a>`
    + `</div></div>`;
}

function teken() {
  const res = DATA.filter(d => d.lat && d.s !== 'Gesloten' && match(d));
  ZICHTBAAR = res;
  cluster.clearLayers();
  spelden.clear();
  const laag = res.map(d => {
    const m = L.circleMarker([d.lat, d.lon], SPELD_STIJL[d.s] || SPELD_STIJL['Te checken']);
    m.bindPopup(() => ballon(d), {maxWidth: 300, minWidth: 230, autoPanPadding: [24, 24]});
    m.bindTooltip(d.n + ', ' + d.g, {direction: 'top', offset: [0, -6]});
    spelden.set(d._i, m);
    return m;
  });
  cluster.addLayers(laag);
  /* Bij één zaak staat de naam er meteen bij, zonder eerst te moeten wijzen. */
  if (laag.length === 1) {
    laag[0].setStyle({radius: 11});
    laag[0].unbindTooltip().bindTooltip(res[0].n, {direction: 'top', offset: [0, -9],
      permanent: true, className: 'enkel'});
  }

  const zoek = ruweQ.trim();
  $('aantal').innerHTML = `<b>${telwoord(res.length)}</b> op de kaart`
    + (zoek ? ` voor <q>${esc(zoek)}</q>` : '');
  /* Zaken die bij de selectie passen maar nog geen ligging hebben, staan alleen
     in de lijst. Dat zeggen we, anders lijkt de kaart er zaken te missen. */
  const zonder = DATA.filter(d => !d.lat && d.s !== 'Gesloten' && match(d)).length;
  const zl = $('zonderligging');
  zl.hidden = !zonder;
  zl.innerHTML = zonder ? `${zonder === 1 ? 'Eén zaak' : zonder.toLocaleString('nl-BE') + ' zaken'} uit deze selectie `
    + `${zonder === 1 ? 'heeft' : 'hebben'} nog geen ligging en ${zonder === 1 ? 'staat' : 'staan'} alleen in de `
    + `<a href="lijst.html${staatQuery(ruweQ)}">lijst</a>.` : '';
  tekenBalk();
}

function pasAan() {
  if (!ZICHTBAAR.length) { meld('Geen zaak op de kaart past bij deze zoekopdracht en filters.'); return; }
  $('melding').hidden = true;
  if (!f.q && !filtersActief()) { kaart.setView(START, START_ZOOM); return; }
  kaart.fitBounds(L.latLngBounds(ZICHTBAAR.map(d => [d.lat, d.lon])),
                  {padding: [48, 48], maxZoom: 15});
}

/* kaart.html#123 opent die ene zaak, zodat de lijst ernaar kan doorlinken.
   kaart.html#buurt zoekt meteen de zaken rond de bezoeker. */
function naarAnker() {
  if (location.hash === '#buurt') { zoekMij(); return; }
  /* kaart.html#cafe/haacht/de-klok komt van de pagina van een zaak; het oude
     kaart.html#123 (de rij in zaken.json) blijft werken voor bestaande links. */
  const h = decodeURIComponent(location.hash.slice(1));
  const i = h.startsWith('cafe/') ? DATA.findIndex(d => d.u === h) : parseInt(h, 10);
  if (isNaN(i) || !DATA[i] || !DATA[i].lat || DATA[i].s === 'Gesloten') return;
  const d = DATA[i];
  if (!match(d)) {
    wisAlles();
    wijzig();
  }
  const m = spelden.get(i);
  if (!m) { kaart.setView([d.lat, d.lon], 17); return; }
  /* Eerst dichtbij, dan de tros openvouwen tot de speld zelf zichtbaar is en het
     ballonnetje openen. zoomToShowLayer roept zijn callback niet altijd aan als
     de kaart al stilstaat, vandaar de controle erna. */
  kaart.setView([d.lat, d.lon], 17, {animate: false});
  let open = false;
  const toon = () => { if (!open && m._map) { open = true; m.openPopup(); } };
  cluster.zoomToShowLayer(m, toon);
  setTimeout(() => { if (!open) cluster.zoomToShowLayer(m, toon); setTimeout(toon, 500); }, 700);
}
addEventListener('hashchange', naarAnker);

document.getElementById('heel').addEventListener('click', () => {
  kaart.setView(START, START_ZOOM);
});

function laadfout() {
  $('aantal').textContent = 'De zaken kwamen niet binnen.';
  $('kaartladen').innerHTML = '<p><b>De zaken kwamen niet binnen.</b> Controleer je verbinding en probeer het opnieuw.</p>'
    + '<button type="button" class="knop" id="opnieuw">Opnieuw proberen</button>';
  $('opnieuw').addEventListener('click', () => {
    $('kaartladen').innerHTML = '<p>De zaken worden geladen.</p>';
    $('aantal').textContent = 'Zaken laden…';
    laadData(gereed, laadfout);
  });
}

let geladen = false;
function gereed() {
  if (geladen) return;
  geladen = true;
  $('kaartladen').hidden = true;
  $('foot').textContent = 'De gids telt ' + DATA.length.toLocaleString('nl-BE')
    + ' zaken, gesloten zaken staan alleen in de lijst · bijgewerkt ' + BIJGEWERKT;
  FB.basis = d => d.lat && d.s !== 'Gesloten';
  FB.statussen = STATUS_ALLE.slice(0, 3);
  /* Na een zoekopdracht of filter zoomt de kaart op wat overblijft. Zonder
     selectie blijft ze op het overzicht staan. */
  FB.teken = () => { teken(); pasAan(); };
  startFilterbalk();
  teken();
  if (location.hash) naarAnker();
  else if (f.q || filtersActief()) pasAan();
}

laadData(gereed, laadfout);
