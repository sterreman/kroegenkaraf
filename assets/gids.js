/* De lijst. Groepeert op provincie en gemeente, klapt open per zaak. */

/* Een pictogram voor zaken zonder foto, per soort. Rustige lijntekening in de
   zandtint van de pagina, 24x24. */
const P = (...d) => '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + d.map(x => x[0] === '<' ? x : `<path d="${x}"/>`).join('') + '</svg>';
const ICOON = {
  /* tapkraan */
  'Volkscafé': P('M14.4 4.8h4.2v14.1h-4.2z', 'M12.3 18.9h8.4',
                 'M14.4 10.9H9.7a3.1 3.1 0 0 0-3.1 3.1v.7', 'M6.6 14.6 5.1 16.3',
                 '<ellipse cx="9.8" cy="4.9" rx="2" ry="2.7"/>', 'M9.8 7.6v3.3'),
  /* pot met oor */
  'Bruine kroeg': P('M6.6 4.4h8.3l-.8 14.8a1 1 0 0 1-1 .9H8.4a1 1 0 0 1-1-.9z',
                    'M15 7.6h2.1a1.8 1.8 0 0 1 1.8 1.8v3.2a1.8 1.8 0 0 1-1.8 1.8h-2.4',
                    'M7.3 8.4h7.4'),
  /* tulpglas met schuimkraag */
  'Biercafé': P('M8 4.2h8l-1 14a1.7 1.7 0 0 1-1.7 1.6h-2.6A1.7 1.7 0 0 1 9 18.2z',
                'M8.3 8.2h7.4'),
  /* huis met dak */
  'Herberg': P('M3.6 10.6 12 4.2l8.4 6.4', 'M5.6 9.6V20h12.8V9.6', 'M10 20v-4.8h4V20'),
  /* vork en mes */
  'Bistro of brasserie': P('M7.2 4v4.2a1.7 1.7 0 0 0 3.4 0V4', 'M8.9 8.4V20',
                           'M16.4 4c1.6 1.4 2 3.4 1.6 5.4-.2 1-.7 1.6-1.6 1.8', 'M16.4 11.2V20'),
  /* martiniglas met olijf */
  'Cocktailbar': P('M4.6 5.4h14.8L12 13.4z', 'M12 13.4V19.6', 'M8.6 20h6.8',
                   'M14.6 8.4a.9.9 0 1 0 0-.1'),
  /* wijnglas */
  'Wijnbar': P('M8 3.8h8l-.7 5.6a3.3 3.3 0 0 1-6.6 0z', 'M12 12.6V19.6', 'M8.6 20h6.8'),
  /* nog te bepalen: leeg vakje, daar valt nog niets over te zeggen */
  '': ''
};

let FOTOS = false;

function render() {
  const res = DATA.filter(match);
  const gv = res.filter(d => d.s === 'Geverifieerd').length;
  const gs = res.filter(d => d.s === 'Gesloten').length;
  const plaatsen = new Set(res.map(d => d.p + '|' + d.g)).size;
  document.getElementById('tally').innerHTML =
    `<div><b>${res.length}</b><span>in beeld</span></div>`
    + `<div><b>${gv}</b><span>geverifieerd</span></div>`
    + `<div><b>${res.length - gv - gs}</b><span>te checken</span></div>`
    + `<div><b>${plaatsen}</b><span>plaatsen</span></div>`;
  const L = document.getElementById('list');
  if (!res.length) {
    L.innerHTML = '<div class="empty-state"><p>Niets gevonden.</p>'
      + 'Probeer een andere zoekterm of zet een filter af.</div>';
    return;
  }
  let html = '', last = null;
  const perGroup = {};
  res.forEach(d => { const k = d.p + '|' + d.g; perGroup[k] = (perGroup[k] || 0) + 1; });
  for (const d of res) {
    const k = d.p + '|' + d.g;
    if (k !== last) {
      html += `<div class="ghead"><span class="pl">${esc(d.g)}</span>`
        + `<span class="pr">${esc(d.p)}</span><span class="rule"></span>`
        + `<span class="n">${perGroup[k]}</span></div>`;
      last = k;
    }
    const dead = d.s === 'Gesloten';
    html += `<div class="card${dead ? ' dead' : ''}" data-i="${d._i}">`
      + `<button class="row" type="button" aria-expanded="false">`
        + `<span class="dot ${d.s === 'Geverifieerd' ? 'ok' : dead ? 'cl' : ''}"></span>`
        + (FOTOS ? (d.foto
            ? `<img class="thumb" src="fotos/${esc(d.foto)}-klein.avif" alt=""`
              + ` width="46" height="46" loading="lazy" decoding="async">`
            : `<span class="thumb leeg">${ICOON[d.t] || ICOON['']}</span>`) : '')
        + `<span class="meta"><span class="nm">${esc(d.n)}</span>`
        + `<span class="ad${d.a ? '' : ' none'}">${esc(d.a || 'adres nog aan te vullen')}</span></span>`
        + `<span class="side">`
          + `<span class="soort${d.t ? '' : ' none'}">${esc(d.t || 'soort onbekend')}</span>`
          + (dead ? `<span class="flag dead">gesloten${d.z ? ' ' + esc(d.z) : ''}</span>`
                  : d.s === 'Te checken' ? '<span class="flag">te checken</span>' : '')
        + `</span>`
      + `</button>`
      + `<div class="body">`
        + (d.i ? `<p>${esc(d.i)}</p>` : '<p class="empty">Nog geen beschrijving.</p>')
        + `<div class="kv"><span>Toegevoegd <b>${esc(d.d) || '—'}</b></span>`
        + `<span>Geverifieerd <b>${esc(d.v) || '—'}</b></span>`
        + (d.z ? `<span>Gesloten <b>${esc(d.z)}</b></span>` : '')
        + `<span>Soort <b>${esc(d.t || 'nog te bepalen')}</b></span></div>`
        + `<div class="acts">`
          + `<a class="btn map" href="${mapsUrl(d)}" target="_blank" rel="noopener"`
          + ` title="${esc(d.n)} op Google Maps" aria-label="${esc(d.n)} op Google Maps">${SPELD}</a>`
          + (d.lat && !dead ? `<a class="btn" href="kaart.html#${d._i}">Op de kaart</a>` : '')
          + socKnop(d, d.fb, 'fb', 'Facebook') + socKnop(d, d.ig, 'ig', 'Instagram')
        + `</div>`
      + `</div></div>`;
  }
  L.innerHTML = html;
}

/* Het grote beeld komt er pas in bij het openklappen. Bij tweeduizend zaken hoeft
   de browser dan niet alles op voorhand te halen. */
function toonFoto(card) {
  const d = DATA[+card.dataset.i];
  if (!d || !d.foto) return;
  const body = card.querySelector('.body');
  if (body.querySelector('img.shot')) return;
  const img = document.createElement('img');
  img.className = 'shot';
  img.src = 'fotos/' + d.foto + '.avif';
  img.alt = 'Foto van ' + d.n;
  img.loading = 'lazy';
  body.insertBefore(img, body.firstChild);
}

/* index.html#123 klapt die ene zaak open, zodat de kaart ernaar kan doorlinken.
   Valt de zaak buiten de huidige filters, bijvoorbeeld omdat ze gesloten is, dan
   gaan de filters open. Anders stuur je iemand naar een lege pagina. */
function naarAnker() {
  const i = parseInt(location.hash.slice(1), 10);
  if (isNaN(i) || !DATA[i]) return;
  if (!match(DATA[i])) {
    f.p = f.t = f.q = ''; f.s = '';
    document.getElementById('q').value = '';
    renderChips(); render();
  }
  const card = document.querySelector(`.card[data-i="${i}"]`);
  if (!card) return;
  card.classList.add('open', 'gevonden');
  card.querySelector('.row').setAttribute('aria-expanded', 'true');
  toonFoto(card);
  card.scrollIntoView({block: 'center', behavior: 'smooth'});
  setTimeout(() => card.classList.remove('gevonden'), 2600);
}
addEventListener('hashchange', naarAnker);

document.addEventListener('click', e => {
  const row = e.target.closest('.row');
  if (row) {
    const card = row.parentElement;
    const open = card.classList.toggle('open');
    row.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) toonFoto(card);
  }
});

laadData(() => {
  FOTOS = DATA.some(d => d.foto);
  document.getElementById('foot').textContent =
    DATA.length + ' zaken in de lijst · bijgewerkt ' + BIJGEWERKT;
  renderChips();
  render();
  naarAnker();
  opnieuw = () => { render(); window.scrollTo({top: 0}); };
});
