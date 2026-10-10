/* Wat de lijst en de kaart delen: het laden van de data, het filteren (f en match)
   en de toestand in de url. De bediening zelf staat in filterbalk.js; wat maar op
   een van beide pagina's thuishoort in gids.js of kaart.js. */

const SOORT_ORDER = ['Volkscafé', 'Bruin café', 'Biercafé', 'Eetcafé', 'Muziekcafé',
  'Sportcafé', 'Dans- & feestcafé', 'Stadscafé / Grand Café', 'Cocktail- & wijnbar'];
const PROV_ORDER = [];

/* De statusfilter begint op '_open': gesloten zaken staan standaard niet in beeld.
   In de lijst blijven ze bereikbaar via Meer filters. */
const f = {q: '', p: '', t: '', s: '_open', tags: []};

let DATA = [];
/* Alle gemeenten en deelgemeenten, genormaliseerd, voor de zoekfunctie. */
const PLAATSEN = new Set();

/* Accenten en apostrofs vallen weg, zodat "'t Boshuisje", "\u2019t boshuisje" en "t boshuisje"
   hetzelfde zoeken (de apostrof staat in de data recht, op een gsm vaak gekruld). */
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f'\u2019\u2018`\u00b4]/g, '');
const esc = s => (s || '').replace(/[&<>"]/g, c =>
  ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

function mapsUrl(d) {
  return 'https://www.google.com/maps/search/?api=1&query='
    + encodeURIComponent([d.n, d.a, d.g, 'België'].filter(Boolean).join(', '));
}
function match(d) {
  if (f.p && d.p !== f.p) return false;
  if (f.t === '_geen' ? d.t : (f.t && d.t !== f.t)) return false;
  if (f.s === '_open' ? d.s === 'Gesloten' : (f.s && d.s !== f.s)) return false;
  if (f.tags.some(tag => !(d.tags || []).includes(tag))) return false;
  if (f.q) {
    /* Is de zoekterm precies een gemeente of deelgemeente, dan tellen alleen de
       zaken uit die plaats. Anders duikt bij "Haacht" ook een Gents café op
       omdat brouwerij Haacht in de beschrijving staat. */
    const q = f.q.trim();
    if (PLAATSEN.has(q) ? !d._g.includes(q) : !d._k.includes(f.q)) return false;
  }
  return true;
}

/* De zoekopdracht en de filters in de url, zodat een link deelbaar is en de lijst
   en de kaart dezelfde selectie tonen: ?q=haacht&p=Antwerpen&t=Volkscafé&tag=Terras.
   De standaardstatus (zonder gesloten zaken) komt er niet in. */
function leesStaat(zoek) {
  const u = new URLSearchParams(zoek === undefined ? location.search : zoek);
  const q = u.get('q') || '';
  f.q = norm(q);
  f.p = u.get('p') || '';
  f.t = u.get('t') || '';
  f.s = u.has('s') ? (u.get('s') === 'alles' ? '' : u.get('s')) : '_open';
  f.tags = u.getAll('tag').filter(Boolean);
  return q;
}
function staatQuery(ruweQ) {
  const u = new URLSearchParams();
  if ((ruweQ || '').trim()) u.set('q', ruweQ.trim());
  if (f.p) u.set('p', f.p);
  if (f.t) u.set('t', f.t);
  if (f.s !== '_open') u.set('s', f.s || 'alles');
  f.tags.forEach(tag => u.append('tag', tag));
  const s = u.toString();
  return s ? '?' + s : '';
}

/* Een gedeelde json voor beide pagina's, zodat de browser ze maar een keer haalt.
   De zoeksleutel wordt hier gezet en niet in het bouwscript: dat scheelt bijna
   een derde van het bestand. */
function laadData(dan, fout) {
  fetch('data/zaken.json')
    .then(r => { if (!r.ok) throw new Error(r.status + ' ' + r.statusText); return r.json(); })
    .then(rijen => {
      DATA = rijen;
      const sorteerwoord = s => norm(s).replace(/^[^a-z0-9]+/, '');
      const alfabetisch = (a, b) => sorteerwoord(a).localeCompare(
        sorteerwoord(b), 'nl', {sensitivity: 'base'});
      DATA.sort((a, b) =>
        alfabetisch(a.p, b.p)
        || Number(!a.g) - Number(!b.g)
        || alfabetisch(a.g, b.g)
        || alfabetisch(a.n, b.n));
      DATA.forEach((d, i) => {
        d.tags = Array.isArray(d.tags) ? [...new Set(d.tags.filter(t => typeof t === 'string' && t))] : [];
        d._k = norm([d.n, d.g, d.p, d.a, d.i, d.t, ...d.tags].join(' '));
        d._g = (d.g || '').split(/[()]/).map(x => norm(x).trim()).filter(Boolean);
        d._g.forEach(x => PLAATSEN.add(x));
        d._i = i;
        if (!PROV_ORDER.includes(d.p)) PROV_ORDER.push(d.p);
      });
      dan();
    })
    .catch(err => {
      console.error('zaken.json kwam niet binnen:', err);
      if (fout) fout(err);
      else document.getElementById('laadfout').hidden = false;
    });
}

/* ---- plaatsen met hun ligging (afspreken, en zoeken rond een adres op de kaart)
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
