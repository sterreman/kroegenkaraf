/* De pagina van een zaak: delen en het kaartje. De inhoud zelf staat al in de
   html, dus zonder javascript is alles leesbaar; dit maakt het alleen handiger. */
(function () {
  const canon = document.querySelector('link[rel=canonical]');
  const url = canon ? canon.href : location.href;

  /* ---- delen ---------------------------------------------------------------
     Op de gsm opent de eigen deelknop van het toestel, met WhatsApp, Messenger
     en alles wat erop staat. Op een computer is die knop er vaak niet of hij is
     onhandig, dan klapt een rij met WhatsApp, Facebook, e-mail en kopiëren open. */
  const knop = document.getElementById('deel');
  const paneel = document.getElementById('deelpaneel');
  const melding = document.getElementById('gekopieerd');
  if (knop && paneel) {
    knop.addEventListener('click', async () => {
      const aanraak = matchMedia('(pointer: coarse)').matches;
      if (navigator.share && aanraak) {
        try {
          await navigator.share({title: document.title, text: knop.dataset.tekst, url});
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
      }
      paneel.hidden = !paneel.hidden;
      knop.setAttribute('aria-expanded', paneel.hidden ? 'false' : 'true');
    });
    document.getElementById('kopieer').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        melding.textContent = 'Link gekopieerd';
      } catch (err) {
        window.prompt('Kopieer deze link:', url);
      }
      setTimeout(() => { melding.textContent = ''; }, 3000);
    });
  }

  /* ---- de carrousel ----------------------------------------------------------
     De foto's staan naast elkaar in een rail die op elke foto vastklikt. Vegen
     werkt vanzelf; de pijltjes en de teller zijn er voor wie een muis heeft. */
  document.querySelectorAll('.carrousel').forEach((c) => {
    const rail = c.querySelector('.rail');
    const dias = rail.children;
    const teller = c.querySelector('.teller');
    const vorige = c.querySelector('.vorige');
    const volgende = c.querySelector('.volgende');
    const nu = () => Math.round(rail.scrollLeft / rail.clientWidth);
    const toon = () => {
      const i = nu();
      teller.textContent = (i + 1) + ' / ' + dias.length;
      vorige.disabled = i === 0;
      volgende.disabled = i === dias.length - 1;
    };
    const ga = (stap) => rail.scrollTo({left: (nu() + stap) * rail.clientWidth});
    vorige.addEventListener('click', () => ga(-1));
    volgende.addEventListener('click', () => ga(1));
    rail.addEventListener('scroll', () => requestAnimationFrame(toon), {passive: true});
    toon();
  });

  /* ---- melden en foto's insturen ---------------------------------------------
     Beide formulieren werken ook zonder javascript (gewone post naar /api/...).
     Hiermee versturen ze zonder de pagina te verlaten, klapt het meldformulier
     pas open na een keuze en zet de link bij Ligging meteen de juiste keuze aan. */
  document.querySelectorAll('.kkform').forEach(form => {
    const status = form.querySelector('.meldstatus');
    form.classList.add('js');
    form.elements.t.value = String(Date.now());
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      status.classList.remove('fout');
      const fotos = form.elements.foto ? [...form.elements.foto.files] : [];
      const fout = fotos.length > 3 ? 'Hoogstens 3 foto\'s per keer.'
        : fotos.some(f => f.size > 15 * 1024 * 1024) ? 'Een foto mag hoogstens 15 MB zijn.' : '';
      if (fout) { status.classList.add('fout'); status.textContent = fout; return; }
      const knop = form.querySelector('.meldknop');
      knop.disabled = true;
      status.textContent = fotos.length ? 'Even uploaden…' : 'Even versturen…';
      try {
        const r = await fetch(form.action, {method: 'POST', body: new FormData(form),
                                            headers: {Accept: 'application/json'}});
        const j = await r.json();
        status.textContent = j.tekst;
        if (j.ok) { form.classList.add('verstuurd'); return; }
        status.classList.add('fout');
      } catch (err) {
        status.classList.add('fout');
        status.textContent = 'Versturen lukte niet. Probeer later opnieuw of mail ons op info@kroegenkaraf.be.';
      }
      knop.disabled = false;
    });
  });

  const meld = document.querySelector('.meldform');
  if (meld) {
    const bericht = meld.querySelector('textarea');
    const kies = r => {
      meld.classList.add('gekozen');
      bericht.placeholder = r.dataset.vraag || '';
    };
    meld.querySelectorAll('input[name=soort]').forEach(r => r.addEventListener('change', () => kies(r)));
    document.querySelectorAll('a[data-meld]').forEach(a => a.addEventListener('click', () => {
      const r = meld.querySelector(`input[name=soort][value="${a.dataset.meld}"]`);
      if (r) { r.checked = true; kies(r); setTimeout(() => bericht.focus(), 50); }
    }));
  }

  /* Wie via #foto binnenkomt (de tegel Laatste ronde), krijgt het fotoformulier open. */
  const fotoform = document.getElementById('foto');
  const opener = () => { if (fotoform && location.hash === '#foto') fotoform.open = true; };
  opener();
  addEventListener('hashchange', opener);

  /* ---- het kaartje ---------------------------------------------------------
     Scrollen met het wieltje zoomt niet, anders blijft wie de pagina afschuift
     in de kaart hangen. Op de gsm schuift de kaart ook niet mee met een vinger,
     om dezelfde reden: inzoomen kan met de knoppen, en de grote kaart ligt een
     tik verder. */
  const el = document.getElementById('minikaart');
  const bron = document.getElementById('ligging');
  if (!el || !bron || !window.L) return;
  const z = JSON.parse(bron.textContent);
  const aanraak = matchMedia('(pointer: coarse)').matches;
  const kaart = L.map(el, {
    center: [z.lat, z.lon], zoom: 16, minZoom: 8, maxZoom: 19,
    scrollWheelZoom: false, dragging: !aanraak, tap: false
  });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(kaart);

  (z.buren || []).forEach(b => {
    L.circleMarker([b.lat, b.lon], {
      radius: 6, weight: 1.5, color: '#ffffff', opacity: .9,
      fillColor: '#132738', fillOpacity: .75
    }).bindTooltip(b.n, {direction: 'top', offset: [0, -6]})
      .on('click', () => { location.href = '/' + b.u + '/'; })
      .addTo(kaart);
  });
  L.circleMarker([z.lat, z.lon], {
    radius: 10, weight: 3, color: '#ffffff', opacity: 1,
    fillColor: z.dicht ? '#8a939c' : '#cf4521', fillOpacity: 1
  }).bindTooltip(z.n, {direction: 'top', offset: [0, -10], permanent: true}).addTo(kaart);

})();
