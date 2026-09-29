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
