/* De startpagina. Zes zaken om te ontdekken, de ingangen naar afspreken en de
   kaart, en de provincies. De zoekbalk is een gewoon formulier naar lijst.html.

   Alles komt uit data/start.json, dat cafepaginas.py bij de bouw maakt: een paar
   kilobyte in plaats van de hele zaken.json. Ontbreekt dat bestand (een lokale
   kopie zonder bouw), dan valt de pagina terug op zaken.json en assets/ontdek.json. */

const ZES = 6;
const $ = id => document.getElementById(id);
const esc = s => (s || '').replace(/[&<>"]/g, c =>
  ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

function eersteZin(info) {
  const t = (info || '').split(/\r?\n/)[0].trim();
  const m = t.match(/^(.+?[a-zà-ÿ0-9)]{2}[.!?])\s+[A-ZÀ-Ý'‘]/);
  let zin = (m ? m[1] : t).trim();
  if (zin.length > 160) zin = zin.slice(0, 160).replace(/\s+\S*$/, '').replace(/[,;:.]$/, '') + '…';
  return zin;
}

function weekNummer(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return t.getUTCFullYear() * 53 + Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}

/* Elke week schuift de selectie op. Eerst zoveel mogelijk verschillende
   provincies; zijn er te weinig, dan vullen we aan uit de rest van de pool. */
function kies(zaken) {
  const pool = zaken.filter(d => d.s === 'Geverifieerd' && d.u && d.i);
  if (!pool.length) return [];
  const start = (weekNummer(new Date()) * ZES) % pool.length;
  const rij = pool.map((_, k) => pool[(start + k) % pool.length]);
  const keuze = [], provincies = new Set();
  for (const d of rij) {
    if (keuze.length < ZES && !provincies.has(d.p)) { provincies.add(d.p); keuze.push(d); }
  }
  for (const d of rij) {
    if (keuze.length < ZES && !keuze.includes(d)) keuze.push(d);
  }
  return keuze;
}

/* ---- laatste ronde -----------------------------------------------------------
   Elke week één verdwenen café uit assets/laatsteronde.json. Een zaak komt pas
   aan de beurt als ze minstens drie maanden dicht is: "Gesloten op" mag een
   datum, een maand of alleen een jaar zijn, en telt dan vanaf het einde ervan. */
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli',
  'augustus', 'september', 'oktober', 'november', 'december'];

function sluiting(z) {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(z || '');
  if (!m) return {einde: new Date(0), tekst: 'gesloten'};
  const [, j, mnd, dag] = m;
  if (dag) return {einde: new Date(+j, +mnd - 1, +dag),
    tekst: `gesloten op ${+dag} ${MAANDEN[+mnd - 1]} ${j}`};
  if (mnd) return {einde: new Date(+j, +mnd, 0), tekst: `gesloten in ${MAANDEN[+mnd - 1]} ${j}`};
  return {einde: new Date(+j, 11, 31), tekst: `gesloten in ${j}`};
}

function tekenRonde(pool) {
  const grens = new Date();
  grens.setMonth(grens.getMonth() - 3);
  const kand = (pool || []).filter(d => d.u && d.i && sluiting(d.z).einde <= grens);
  if (!kand.length) return;
  const d = kand[weekNummer(new Date()) % kand.length];
  $('ronde').innerHTML = `<div class="ronde">`
    + `<span class="rkop">Laatste ronde</span>`
    + (d.foto ? `<img class="rfoto" src="fotos/${esc(d.foto)}-klein.avif" alt="" width="64" height="64" loading="lazy" decoding="async">` : '')
    + `<h3 class="rnaam"><a href="/${esc(d.u)}/">${esc(d.n)}</a></h3>`
    + `<span class="rplaats">${esc(d.g || d.p)} · ${esc(sluiting(d.z).tekst)}</span>`
    + `<p class="rreden">${esc(eersteZin(d.i))}</p>`
    + `<p class="racties"><a href="/${esc(d.u)}/">Lees het verhaal</a>`
    + (d.oproep ? `<a href="${esc(d.oproep)}" target="_blank" rel="noopener">Ken je dit café? Stuur je eigen oude foto</a>` : '')
    + '</p>'
    + (d.buur ? `<p class="rbuur">Hier vlakbij nog open: <a href="/${esc(d.buur.u)}/">${esc(d.buur.n)}</a>`
      + ` <span>(${esc(d.buur.a)}${d.buur.g && d.buur.g !== d.g ? ', ' + esc(d.buur.g) : ''})</span></p>` : '')
    + '</div>';
  $('ronde').hidden = false;
}

function toon(start) {
  tekenRonde(start.ronde);
  const keuze = kies(start.zaken || []);
  const lijst = $('ontdeklijst');
  lijst.removeAttribute('aria-busy');
  if (!keuze.length) { $('ontdek').hidden = true; } else {
    lijst.innerHTML = keuze.map(d =>
      `<li class="ontdekzaak${d.foto ? ' metfoto' : ''}"><a href="/${esc(d.u)}/">`
      + (d.foto ? `<img src="fotos/${esc(d.foto)}-klein.avif" alt="" width="64" height="64" loading="lazy" decoding="async">` : '')
      + `<span class="osoort">${esc(d.t || 'Café')}</span>`
      + `<span class="onaam">${esc(d.n)}</span>`
      + `<span class="oplaats">${esc(d.g || d.p)}</span>`
      + `<span class="oreden">${esc(eersteZin(d.i))}</span>`
      + `<span class="olink">Naar de zaak</span></a></li>`).join('');
  }
  const prov = start.provincies || [];
  if (prov.length) {
    $('provlijst').innerHTML = prov.map(([p, n]) =>
      `<li><a href="lijst.html?p=${encodeURIComponent(p)}"><span>${esc(p)}</span>`
      + `<span class="n">${n.toLocaleString('nl-BE')}</span></a></li>`).join('');
    $('provincies').hidden = false;
  }
  if (start.aantal) {
    $('foot').textContent = 'De gids telt ' + start.aantal.toLocaleString('nl-BE')
      + ' zaken · bijgewerkt ' + BIJGEWERKT;
  }
}

/* Zonder start.json: hetzelfde opbouwen uit de volledige data. */
function terugval() {
  return Promise.all([
    fetch('data/zaken.json').then(r => r.json()),
    fetch('assets/ontdek.json').then(r => r.json())
  ]).then(([data, ontdek]) => {
    const perId = new Map(data.map(d => [d.id, d]));
    const tel = {};
    data.forEach(d => { if (d.s !== 'Gesloten') tel[d.p] = (tel[d.p] || 0) + 1; });
    return {
      aantal: data.length,
      provincies: Object.entries(tel).sort((a, b) => a[0].localeCompare(b[0], 'nl')),
      zaken: (ontdek.ids || []).map(i => perId.get(i)).filter(Boolean)
    };
  });
}

fetch('data/start.json')
  .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .catch(terugval)
  .then(toon)
  .catch(err => {
    console.error('De startpagina kreeg haar gegevens niet binnen:', err);
    $('ontdek').hidden = true;
  });
