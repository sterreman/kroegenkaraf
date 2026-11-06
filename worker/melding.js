/* Kroeg & Karaf: het eigen meldpunt.

   De site zelf blijft statisch (de map .publication/site). Alleen /api/* komt
   eerst hier langs (run_worker_first in wrangler.jsonc); al de rest serveert
   Cloudflare rechtstreeks uit de bestanden.

   POST /api/melding komt van het formulier onderaan elke cafepagina. De melding
   gaat als mail naar de redactie, via de send_email-binding van Cloudflare Email
   Routing. Er wordt niets bewaard: geen database, geen log van de inhoud.

   Instellen (eenmalig, in Cloudflare):
   - Email Routing staat aan op kroegenkaraf.be (dat is al zo voor info@).
   - Het ontvangstadres is een geverifieerd bestemmingsadres in Email Routing.
   - Het secret MELDING_AAN bevat dat ontvangstadres:
       npx wrangler secret put MELDING_AAN
     Zo staat het adres niet in de repo. Zonder secret weigert het meldpunt
     netjes en verwijst het naar info@kroegenkaraf.be.

   Tegen spam: een verborgen veld dat mensen niet invullen, een minimale
   invultijd, alleen meldingen vanaf de eigen site, en vaste lengtes. */
import { EmailMessage } from 'cloudflare:email';

const VAN = 'meldingen@kroegenkaraf.be';
const CONTACT = 'info@kroegenkaraf.be';
const SOORTEN = {
  open: 'Nog open',
  gesloten: 'Gesloten of verhuisd',
  heropend: 'Weer open',
  ligging: 'Ligging',
  anders: 'Correctie',
};
const MAX_BERICHT = 3000;
const MIN_SECONDEN = 3;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/melding') {
      if (request.method !== 'POST') return antwoord(request, 405, 'Alleen versturen via het formulier.');
      return melding(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};

async function melding(request, env) {
  const herkomst = request.headers.get('Origin');
  if (herkomst && new URL(herkomst).host !== new URL(request.url).host) {
    return antwoord(request, 403, 'Deze melding komt niet van Kroeg & Karaf.');
  }
  let f;
  try {
    f = await request.formData();
  } catch {
    return antwoord(request, 400, 'De melding kwam niet goed door.');
  }
  const veld = (k, max) => String(f.get(k) || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
  const slug = veld('slug', 200);

  // Het verborgen veld: een mens laat het leeg. We doen alsof alles goed ging.
  if (veld('website', 200)) return antwoord(request, 200, 'Bedankt!', slug);
  // t zet het javascript bij het laden; zonder javascript ontbreekt het en dat mag.
  const t = Number(veld('t', 20));
  if (t && Date.now() - t < MIN_SECONDEN * 1000) {
    return antwoord(request, 429, 'Dat ging wel heel snel. Probeer het over enkele seconden opnieuw.', slug);
  }

  const soort = SOORTEN[veld('soort', 20)];
  const zaak = veld('zaak', 200);
  const bericht = veld('bericht', MAX_BERICHT);
  const mail = veld('mail', 200);
  if (!soort || !zaak || !/^cafe\/[a-z0-9-]+\/[a-z0-9-]+$/.test(slug)) {
    return antwoord(request, 400, 'Kies wat je wil melden.', slug);
  }
  if (!bericht && (soort === 'Correctie' || soort === 'Ligging')) {
    return antwoord(request, 400, 'Schrijf in een paar woorden wat er niet klopt.', slug);
  }
  if (mail && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(mail)) {
    return antwoord(request, 400, 'Dat e-mailadres lijkt niet te kloppen. Laat het leeg als je geen antwoord nodig hebt.', slug);
  }
  if (!env.MELDING_AAN || !env.MELDER) {
    return antwoord(request, 503, `Het meldpunt is even niet bereikbaar. Mail ons op ${CONTACT}.`, slug);
  }

  const pagina = `${new URL(request.url).origin}/${slug}/`;
  const tekst = [
    `${soort}: ${zaak}`,
    pagina,
    '',
    bericht || '(geen toelichting)',
    '',
    mail ? `Antwoorden kan: ${mail}` : 'Geen e-mailadres opgegeven.',
  ].join('\n');
  const raw = mime({
    van: VAN, aan: env.MELDING_AAN, antwoordAan: mail,
    onderwerp: `${soort}: ${zaak}`, tekst,
  });
  try {
    await env.MELDER.send(new EmailMessage(VAN, env.MELDING_AAN, raw));
  } catch (err) {
    console.error('melding niet verstuurd', err);
    return antwoord(request, 502, `Versturen lukte niet. Probeer later opnieuw of mail ons op ${CONTACT}.`, slug);
  }
  return antwoord(request, 200, 'Bedankt! We kijken het na.', slug);
}

/* Een kale mail: platte tekst in UTF-8, onderwerp volgens RFC 2047. */
function mime({ van, aan, antwoordAan, onderwerp, tekst }) {
  const b64 = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  const regels = b64(tekst).match(/.{1,76}/g) || [];
  const kop = [
    `From: "Kroeg & Karaf" <${van}>`,
    `To: ${aan}`,
    antwoordAan ? `Reply-To: ${antwoordAan}` : '',
    `Subject: =?UTF-8?B?${b64(onderwerp)}?=`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomUUID()}@kroegenkaraf.be>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
  ].filter(Boolean);
  return kop.join('\r\n') + '\r\n\r\n' + regels.join('\r\n') + '\r\n';
}

/* Het formulier verstuurt met fetch en krijgt json terug. Zonder javascript
   post de browser het formulier gewoon; dan krijgt hij een kleine pagina met de
   uitkomst en een link terug naar de zaak. */
function antwoord(request, status, tekst, slug) {
  const wil = request.headers.get('Accept') || '';
  if (wil.includes('application/json')) {
    return new Response(JSON.stringify({ ok: status === 200, tekst }), {
      status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  const terug = slug && /^cafe\/[a-z0-9-]+\/[a-z0-9-]+$/.test(slug) ? `/${slug}/` : '/';
  const esc = x => x.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Melding | Kroeg &amp; Karaf</title><link rel="stylesheet" href="/assets/fonts/fonts.css">
<style>body{margin:0;background:#fbf7f0;color:#132738;font:18px/1.5 Georgia,serif}
main{max-width:560px;margin:12vh auto;padding:0 24px}h1{font-size:28px;line-height:1.15}
a{color:#b0391a;text-underline-offset:4px}</style></head><body><main>
<h1>${esc(tekst)}</h1><p><a href="${terug}">Terug naar de pagina</a></p></main></body></html>`;
  return new Response(html, {
    status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
