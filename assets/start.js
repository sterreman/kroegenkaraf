/* De startpagina. Zes zaken om te ontdekken (met een knop voor zes andere), de tegel Pas open, de artikels van Op pad
   uit assets/oppad.json (via oppad.js), en de provincies;
   de zoekbalk is een gewoon formulier naar /lijst.

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

/* Dagnummer in de eigen tijdzone van de bezoeker: om middernacht wisselt het. */
function dagNummer(d) {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
}

/* Kleine voorspelbare toevalsgenerator: met hetzelfde zaadje krijgt elke
   bezoeker dezelfde volgorde. */
function toeval(zaad) {
  let a = zaad >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function geschud(pool, ronde) {
  const r = toeval(ronde * 2654435761), rij = pool.slice();
  for (let k = rij.length - 1; k > 0; k--) {
    const j = Math.floor(r() * (k + 1));
    [rij[k], rij[j]] = [rij[j], rij[k]];
  }
  return rij;
}

/* Elke dag zes andere zaken. De pool wordt per ronde geschud en dag na dag
   afgelopen, zodat elke zaak aan de beurt komt voor er een terugkeert. Door het
   schudden staan de provincies vanzelf door elkaar. */
function ontdekPool(zaken) {
  return zaken.filter(d => d.s === 'Geverifieerd' && d.u && d.i)
    .sort((x, y) => (x.id || x.u).localeCompare(y.id || y.u));
}

/* `verder` telt de klikken op "Toon zes andere": elke klik loopt verder in
   dezelfde geschudde volgorde, dus je ziet de hele pool voor er een zaak
   terugkeert. Zonder klik is het de keuze van de dag. */
function kies(pool, verder = 0) {
  if (!pool.length) return [];
  const n = pool.length, pos = (dagNummer(new Date()) + verder) * ZES, keuze = [];
  for (let k = 0; keuze.length < Math.min(n, ZES) && k < n * 2; k++) {
    const p = pos + k;
    const d = geschud(pool, Math.floor(p / n))[p % n];
    if (!keuze.includes(d)) keuze.push(d);
  }
  return keuze;
}

/* ---- laatste ronde -----------------------------------------------------------
   Elke dag één verdwenen café uit assets/laatsteronde.json, in een geschudde
   volgorde zodat elke zaak aan de beurt komt voor er een terugkeert. Een zaak komt pas
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
  kand.sort((x, y) => (x.id || x.u).localeCompare(y.id || y.u));
  const dag = dagNummer(new Date()), n = kand.length;
  const d = geschud(kand, Math.floor(dag / n))[dag % n];
  $('ronde').innerHTML = `<div class="ronde">`
    + `<span class="rkop">Laatste ronde</span>`
    + (d.foto ? `<img class="rfoto" src="fotos/${esc(d.foto)}-klein.avif" alt="" width="64" height="64" loading="lazy" decoding="async">` : '')
    + `<h3 class="rnaam"><a href="/${esc(d.u)}/">${esc(d.n)}</a></h3>`
    + `<span class="rplaats">${esc(d.g || d.p)} · ${esc(sluiting(d.z).tekst)}</span>`
    + `<p class="rreden">${esc(d.k || eersteZin(d.i))}</p>`
    + `<p class="racties"><a href="/${esc(d.u)}/">Lees het verhaal</a>`
    + (d.oproep ? `<a href="${esc(d.oproep)}" target="_blank" rel="noopener">Ken je dit café? Stuur je eigen oude foto</a>` : '')
    + '</p>'
    + (d.buur ? `<p class="rbuur">Een ander café in de buurt: <a href="/${esc(d.buur.u)}/">${esc(d.buur.n)}</a>`
      + ` <span>(${esc(d.buur.a)}${d.buur.g && d.buur.g !== d.g ? ', ' + esc(d.buur.g) : ''})</span></p>` : '')
    + '</div>';
  $('verhalen').hidden = false;
}

/* ---- pas open ----------------------------------------------------------------
   Recent (her)geopende zaken uit assets/nieuwopen.json, al gesorteerd met de
   recentste eerst. "sinds" is een maand (JJJJ-MM); de tegel toont alleen wat de
   voorbije twaalf maanden opende en telt dat hier, zodat ze niet veroudert als er
   een tijd geen nieuwe bouw is. Eerst zes, met een knop voor de rest. */
const PAS_OPEN_MAANDEN = 12;

function pasOpenPool(rij) {
  const nu = new Date(), grens = nu.getFullYear() * 12 + nu.getMonth() - PAS_OPEN_MAANDEN;
  return (rij || []).filter(d => {
    const m = /^(\d{4})-(\d{2})$/.exec(d.sinds || '');
    return d.u && m && (+m[1] * 12 + (+m[2] - 1)) > grens;
  });
}

function pasOpenKaart(d) {
  const [j, m] = d.sinds.split('-');
  const wat = d.soort === 'heropend' ? 'Heropend' : 'Nieuw';
  return `<li class="cafekaart${d.foto ? ' metfoto' : ''}"><a href="/${esc(d.u)}/">`
    + `<span class="pasdatum"><b>${wat}</b> ${MAANDEN[+m - 1]} ${j}</span>`
    + (d.foto ? `<span class="cafefoto"><img src="fotos/${esc(d.foto)}-klein.avif" alt="" width="92" height="92" loading="lazy" decoding="async"></span>` : '')
    + `<span class="cafenaam">${esc(d.n)}</span>`
    + `<span class="cafeplaats">${esc(d.g || d.p)}</span>`
    + `<span class="caferede">${esc(d.k || eersteZin(d.i))}</span></a></li>`;
}

function tekenPasOpen(rij) {
  const pool = pasOpenPool(rij);
  if (!pool.length) return;
  const lijst = $('pasopenlijst');
  lijst.innerHTML = pool.slice(0, ZES).map(pasOpenKaart).join('');
  $('pasopen').hidden = false;
  if (pool.length > ZES) {
    const knop = $('pasopenmeer');
    $('pasopenaantal').textContent = pool.length;
    $('pasopenmeerp').hidden = false;
    knop.addEventListener('click', () => {
      lijst.insertAdjacentHTML('beforeend', pool.slice(ZES).map(pasOpenKaart).join(''));
      knop.setAttribute('aria-expanded', 'true');
      $('pasopenmeerp').hidden = true;
      const eerste = lijst.children[ZES] && lijst.children[ZES].querySelector('a');
      if (eerste) eerste.focus({preventScroll: true});
    });
  }
}

function tekenOntdek(keuze) {
  const lijst = $('ontdeklijst');
  lijst.innerHTML = keuze.map(d =>
    `<li class="cafekaart${d.foto ? ' metfoto' : ''}"><a href="/${esc(d.u)}/">`
    + (d.foto ? `<span class="cafefoto"><img src="fotos/${esc(d.foto)}-klein.avif" alt="" width="92" height="92" loading="lazy" decoding="async"></span>` : '')
    + `<span class="cafenaam">${esc(d.n)}</span>`
    + `<span class="cafeplaats">${esc(d.g || d.p)}</span>`
    + `<span class="caferede">${esc(d.k || eersteZin(d.i))}</span></a></li>`).join('');
}

/* Op pad: het eerste artikel groot, de volgende twee compact. Zonder artikels
   (of zonder bestand) verdwijnt de rubriek; de link naar het overzicht blijft.
   De publicatie zet de kaarten al in de html (scripts/oppad_statisch.py); dan
   blijft het hierbij. */
function toonOpPad() {
  if ($('op-uitgelicht').children.length) return;
  OpPad.laad().then(artikels => {
    const rij = OpPad.ordenen(artikels);
    if (!rij.length) throw new Error('geen artikels');
    const uit = $('op-uitgelicht');
    uit.innerHTML = OpPad.kaart(rij[0], 'groot', true);
    uit.removeAttribute('aria-busy');
    const meer = rij.slice(1, 3);
    if (meer.length) {
      $('op-meer').innerHTML = meer.map(a => `<li>${OpPad.kaart(a, 'klein')}</li>`).join('');
      $('op-meer').hidden = false;
    }
  }).catch(err => {
    console.error('Op pad kreeg zijn artikels niet binnen:', err);
    $('oppad').hidden = true;
  });
}
toonOpPad();
function toon(start) {
  tekenRonde(start.ronde);
  tekenPasOpen(start.nieuw);
  const pool = ontdekPool(start.zaken || []);
  const lijst = $('ontdeklijst');
  lijst.removeAttribute('aria-busy');
  if (!pool.length) { $('ontdek').hidden = true; } else {
    tekenOntdek(kies(pool));
    const knop = $('ontdekmeer');
    if (pool.length > ZES) {
      let verder = 0;
      knop.hidden = false;
      knop.addEventListener('click', () => {
        verder++;
        tekenOntdek(kies(pool, verder));
        $('ontdekstatus').textContent = 'Zes andere cafés getoond.';
        lijst.classList.remove('vers');
        void lijst.offsetWidth;
        lijst.classList.add('vers');
        const kop = $('ontdekkop').getBoundingClientRect();
        if (kop.top < 0) $('ontdekkop').scrollIntoView({block: 'start', behavior: 'smooth'});
      });
    }
  }
  const prov = start.provincies || [];
  if (prov.length) {
    $('provlijst').innerHTML = prov.map(([p, n]) =>
      `<li><a href="/lijst?p=${encodeURIComponent(p)}"><span>${esc(p)}</span>`
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
    fetch('assets/ontdek.json').then(r => r.json()),
    fetch('assets/nieuwopen.json').then(r => r.json()).catch(() => ({}))
  ]).then(([data, ontdek, nieuwopen]) => {
    const tel = {};
    data.forEach(d => { if (d.s !== 'Gesloten') tel[d.p] = (tel[d.p] || 0) + 1; });
    const perId = {};
    data.forEach(d => { if (d.id) perId[d.id] = d; });
    return {
      nieuw: (nieuwopen.zaken || [])
        .filter(r => perId[r.id] && perId[r.id].s === 'Geverifieerd')
        .map(r => Object.assign({}, perId[r.id], {sinds: r.sinds, soort: r.soort}))
        .sort((x, y) => y.sinds.localeCompare(x.sinds)),
      aantal: data.length,
      provincies: Object.entries(tel).sort((a, b) => a[0].localeCompare(b[0], 'nl')),
      zaken: data.filter(d => (ontdek.ids || []).includes(d.id)
        || (d.s === 'Geverifieerd' && (d.i || '').split(/\s+/).filter(Boolean).length >= 100))
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

/* ---- delen ---------------------------------------------------------------
   Zoals op de pagina van een zaak: op de gsm de eigen deelknop van het toestel,
   op de computer een rij met WhatsApp, Facebook, e-mail en kopiëren. */
(function () {
  const knop = $('deel');
  const paneel = $('deelpaneel');
  const melding = $('gekopieerd');
  if (!knop || !paneel) return;
  const url = 'https://kroegenkaraf.be/';
  knop.addEventListener('click', async () => {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({title: 'Kroeg & Karaf', text: knop.dataset.tekst, url});
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    paneel.hidden = !paneel.hidden;
    knop.setAttribute('aria-expanded', paneel.hidden ? 'false' : 'true');
  });
  $('kopieer').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      melding.textContent = 'Link gekopieerd';
    } catch (err) {
      window.prompt('Kopieer deze link:', url);
    }
    setTimeout(() => { melding.textContent = ''; }, 3000);
  });
})();
