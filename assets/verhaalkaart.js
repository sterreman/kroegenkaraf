/* Kaartje bij een verhaal: genummerde haltes uit het JSON-blok #haltes.
   Zelfde gedrag als het kaartje op een cafépagina: het muiswieltje zoomt niet
   en op de gsm schuift de kaart niet mee met een vinger, zodat wie de pagina
   afschuift niet in de kaart blijft hangen. Een tik op een halte opent een
   kaartje met een link naar de passage in het artikel. */
(function () {
  const el = document.getElementById('verhaalkaart');
  const bron = document.getElementById('haltes');
  if (!el || !bron || !window.L) return;
  const haltes = JSON.parse(bron.textContent);
  const aanraak = matchMedia('(pointer: coarse)').matches;
  const kaart = L.map(el, {scrollWheelZoom: false, dragging: !aanraak, tap: false, zoomSnap: .25});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(kaart);

  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const punten = [];
  haltes.forEach(h => {
    const icoon = L.divIcon({
      className: 'haltepin' + (h.dicht ? ' dicht' : ''),
      html: '<span>' + h.nr + '</span>',
      iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -13]
    });
    const pop = '<strong>' + h.nr + '. ' + esc(h.n) + '</strong><br>' + esc(h.g) +
      (h.dicht ? '<br><em>Gesloten</em>' : '') +
      '<br><a href="#' + h.a + '">Lees de halte</a>' +
      (h.u ? ' · <a href="/' + h.u + '/">Cafépagina</a>' : '');
    L.marker([h.lat, h.lon], {icon: icoon, title: h.nr + '. ' + h.n, keyboard: true})
      .bindPopup(pop).addTo(kaart);
    punten.push([h.lat, h.lon]);
  });
  kaart.fitBounds(punten, {padding: [24, 24]});
})();
