/* De kaart. Leaflet met de tegels van OpenStreetMap, de zaken
   geclusterd zodat tweeduizend spelden geen brij worden. */

const START = [51.03, 4.35];   /* ergens tussen Gent, Brussel en Antwerpen */
const START_ZOOM = 9;

const kaart = L.map('kaart', {
  center: START, zoom: START_ZOOM, minZoom: 7, maxZoom: 19,
  zoomControl: true, scrollWheelZoom: true
});

/* De gewone tegels van OpenStreetMap. Die mogen zonder sleutel voor een site
   van deze omvang, zolang de bronvermelding zichtbaar blijft staan. Carto viel af:
   dat is enkel voor hun eigen klanten en zet anders "API KEY REQUIRED" over de
   kaart. De tegels worden in css wat ontkleurd zodat ze niet vechten met het
   cremekleurige palet en de spelden het luidst blijven. */
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19
}).addTo(kaart);

const KLEUR = {'Geverifieerd': '#2f6b43', 'Te checken': '#cf4521', 'Gesloten': '#8d8378'};

const cluster = L.markerClusterGroup({
  maxClusterRadius: 48,
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

function ballon(d) {
  return `<div class="ballon">`
    + `<span class="nm">${esc(d.n)}</span>`
    + `<span class="ad">${esc([d.a, d.g].filter(Boolean).join(', ') || 'adres nog aan te vullen')}</span>`
    + `<span class="st">${esc(d.t || 'soort nog te bepalen')} · ${esc(d.s)}`
    + `${d.z ? ' ' + esc(d.z) : ''}</span>`
    + (d.i ? `<p>${esc(d.i)}</p>` : '')
    + `<div class="acts">`
      + `<a class="btn map" href="${mapsUrl(d)}" target="_blank" rel="noopener"`
      + ` title="${esc(d.n)} op Google Maps" aria-label="${esc(d.n)} op Google Maps">${SPELD}</a>`
      + `<a class="btn" href="index.html">In de lijst</a>`
      + socKnop(d, d.fb, 'fb', 'Facebook') + socKnop(d, d.ig, 'ig', 'Instagram')
    + `</div></div>`;
}

function teken() {
  const res = DATA.filter(d => d.lat && match(d));
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
  const gs = res.filter(d => d.s === 'Gesloten').length;
  const plaatsen = new Set(res.map(d => d.p + '|' + d.g)).size;
  document.getElementById('tally').innerHTML =
    `<div><b>${res.length}</b><span>op de kaart</span></div>`
    + `<div><b>${gv}</b><span>geverifieerd</span></div>`
    + `<div><b>${res.length - gv - gs}</b><span>te checken</span></div>`
    + `<div><b>${plaatsen}</b><span>plaatsen</span></div>`;
}

/* kaart.html#123 opent die ene zaak, zodat de lijst ernaar kan doorlinken. */
function naarAnker() {
  const i = parseInt(location.hash.slice(1), 10);
  if (isNaN(i) || !DATA[i] || !DATA[i].lat) return;
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
  const zonder = DATA.filter(d => !d.lat).length;
  document.getElementById('foot').textContent =
    (DATA.length - zonder) + ' zaken met een adres op de kaart · '
    + zonder + ' wachten nog op coördinaten · bijgewerkt ' + BIJGEWERKT;
  renderChips();
  teken();
  naarAnker();
  opnieuw = teken;
});
