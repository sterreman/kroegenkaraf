/* Op pad: de artikels uit assets/oppad.json, voor de startpagina en voor het
   overzicht (oppad.html). Beide pagina's gebruiken dezelfde gegevens en dezelfde
   kaart, zodat ze niet uit elkaar groeien. Een artikel erbij zetten gebeurt in
   het json-bestand, niet hier. */

window.OpPad = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

  function laad() {
    return fetch('/assets/oppad.json')
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(d => (d.artikels || []).filter(a => a.url && a.titel));
  }

  /* Het recentste artikel eerst (op 'datum'); artikels zonder datum komen achteraan, in bestandsvolgorde. */
  function ordenen(artikels) {
    return artikels.map((a, i) => [a, i])
      .sort((x, y) => (y[0].datum || '').localeCompare(x[0].datum || '') || x[1] - y[1]).map(x => x[0]);
  }

  const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus',
    'september', 'oktober', 'november', 'december'];
  function datum(a) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a.datum || '');
    return m ? `<time datetime="${a.datum}">${+m[3]} ${MAANDEN[+m[2] - 1]} ${m[1]}</time>` : '';
  }
  function beeld(a, sizes, eerste) {
    const b = a.beeld;
    if (!b || !(b.bestanden || []).length) return '';
    const set = soort => b.bestanden.map(f => `${esc(f[soort])} ${f.w}w`).join(', ');
    const basis = b.bestanden.find(f => f.w === b.breed) || b.bestanden[0];
    return `<span class="opfoto"><picture>`
      + `<source type="image/avif" srcset="${set('avif')}" sizes="${esc(sizes)}">`
      + `<source type="image/webp" srcset="${set('webp')}" sizes="${esc(sizes)}">`
      + `<img src="${esc(basis.webp)}" width="${b.breed}" height="${b.hoog}" alt="${esc(b.alt || '')}"`
      + (eerste ? ' fetchpriority="high"' : ' loading="lazy"') + ' decoding="async"></picture></span>';
  }

  /* de fotocredit: onder de foto, of in de tekstkolom bij een compacte kaart */
  function credit(a) {
    const b = a.beeld && a.beeld.bron;
    return b ? `<small class="opbron">Foto: ${esc(b.maker)}, <a href="${esc(b.licentieurl)}" rel="license noopener">${esc(b.licentie)}</a></small>` : '';
  }

  /* variant: 'groot' (uitgelicht), 'klein' (compact) of 'lijst' (overzicht) */
  function kaart(a, variant, eerste) {
    const sizes = {groot: '(min-width: 900px) 46vw, 100vw', klein: '(min-width: 520px) 180px, 96px',
      lijst: '(min-width: 900px) 520px, 100vw'}[variant];
    const feiten = (a.feiten || []).length
      ? `<ul class="opfeiten">${a.feiten.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : '';
    return `<article class="opkaart op-${variant}">`
      + beeld(a, sizes, eerste)
      + (variant === 'klein' ? '' : credit(a))
      + `<div class="optekst">`
      + (a.rubriek || a.datum ? `<p class="oprubriek">${[a.rubriek ? esc(a.rubriek) : '', datum(a)].filter(Boolean).join('<span aria-hidden="true"> · </span>')}</p>` : '')
      + `<h3 class="optitel"><a href="${esc(a.url)}">${esc(a.titel)}</a></h3>`
      + (variant === 'klein' ? '' : (a.omschrijving ? `<p class="opomschrijving">${esc(a.omschrijving)}</p>` : '') + feiten)
      + (variant === 'klein' ? credit(a) : `<p class="oplees" aria-hidden="true">Lees het artikel</p>`)
      + `</div></article>`;
  }

  return {laad, ordenen, kaart, esc};
})();
