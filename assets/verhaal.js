/* Delen op de verhaalpagina's (herfstwandelingen, Decap-orgels). Zelfde gedrag
   als op een cafépagina: op de gsm de eigen deelknop van het toestel, op een
   computer klapt een rij open met WhatsApp, Facebook, e-mail en kopiëren.
   Zonder javascript blijven de links in de rij gewoon werken. */
(function () {
  const canon = document.querySelector('link[rel=canonical]');
  const url = canon ? canon.href : location.href;

  document.querySelectorAll('.deelknop').forEach((knop) => {
    const paneel = document.getElementById(knop.getAttribute('aria-controls'));
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
      if (!paneel) return;
      paneel.hidden = !paneel.hidden;
      knop.setAttribute('aria-expanded', paneel.hidden ? 'false' : 'true');
    });
  });

  document.querySelectorAll('.kopieer').forEach((b) => {
    const melding = b.parentElement.querySelector('.gekopieerd');
    b.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        if (melding) melding.textContent = 'Link gekopieerd';
      } catch (err) {
        window.prompt('Kopieer deze link:', url);
      }
      setTimeout(() => { if (melding) melding.textContent = ''; }, 3000);
    });
  });
})();
