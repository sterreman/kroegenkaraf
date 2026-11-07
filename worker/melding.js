/* Kroeg & Karaf: het eigen meldpunt en het fotoformulier.

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

   POST /api/foto komt van het fotoformulier. De foto's gaan naar de map
   Te beoordelen op Google Drive, met de zaak en de naamsvermelding in de
   eigenschappen van het bestand. Goedkeuren is het bestand naar de map
   Goedgekeurd slepen; de nachtelijke bouw (scripts/inzendingen.py) zet het dan
   op de site. Afkeuren is het bestand verwijderen. De redactie krijgt per
   inzending een mail. Instellen: zie scripts/foto_drive_instellen.py; nodig zijn
   de secrets GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN en
   FOTO_TE_BEOORDELEN (de map-ID).

   Tegen misbruik:
   - een limiet per bezoeker en een limiet voor iedereen samen, per minuut
     (de ratelimit-bindings PER_IP en SAMEN in wrangler.jsonc);
   - hoogstens FOTOS_PER_DAG foto's per dag in Te beoordelen;
   - een foto moet echt een jpg, png of webp zijn (de eerste bytes tellen,
     niet wat de browser zegt);
   - een verborgen veld dat mensen niet invullen, een minimale
   invultijd, alleen meldingen vanaf de eigen site, en vaste lengtes. */
import { EmailMessage } from 'cloudflare:email';

const VAN = 'meldingen@kroegenkaraf.be';
const CONTACT = 'info@kroegenkaraf.be';
const SOORTEN = {
  melding: 'Melding',   // het formulier met één knop; de andere blijven voor oude pagina's
  open: 'Nog open',
  gesloten: 'Gesloten of verhuisd',
  heropend: 'Weer open',
  ligging: 'Ligging',
  anders: 'Correctie',
};
const MAX_BERICHT = 3000;
const MAX_FOTOS = 3;
const MAX_FOTO_BYTES = 15 * 1024 * 1024;
const FOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const SLUG = /^cafe\/[a-z0-9-]+\/[a-z0-9-]+$/;
const MIN_SECONDEN = 3;
const FOTOS_PER_DAG = 30;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/melding' || url.pathname === '/api/foto') {
      if (request.method !== 'POST') return antwoord(request, 405, 'Alleen versturen via het formulier.');
      if (!(await binnenLimiet(request, env))) {
        return antwoord(request, 429, 'Even rustig: er kwamen net veel inzendingen binnen. Probeer het over een minuut opnieuw.');
      }
      return url.pathname === '/api/melding' ? melding(request, env) : foto(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};

/* Per bezoeker (IP-adres) en voor iedereen samen een vast aantal per minuut.
   Ontbreken de bindings (lokaal testen), dan geldt geen limiet. */
async function binnenLimiet(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'onbekend';
  try {
    if (env.PER_IP && !(await env.PER_IP.limit({ key: ip })).success) return false;
    if (env.SAMEN && !(await env.SAMEN.limit({ key: 'alles' })).success) return false;
  } catch (err) {
    console.error('limiet niet te controleren', err);
  }
  return true;
}

/* Is dit bestand echt een foto van het opgegeven type? */
async function echteFoto(b) {
  const k = new Uint8Array(await b.slice(0, 12).arrayBuffer());
  const tekst = (van, tot) => String.fromCharCode(...k.slice(van, tot));
  if (b.type === 'image/jpeg') return k[0] === 0xff && k[1] === 0xd8 && k[2] === 0xff;
  if (b.type === 'image/png') return k[0] === 0x89 && tekst(1, 4) === 'PNG';
  if (b.type === 'image/webp') return tekst(0, 4) === 'RIFF' && tekst(8, 12) === 'WEBP';
  return false;
}

/* Hoeveel foto's kwamen er vandaag (UTC) al binnen in Te beoordelen? */
async function vandaagBinnen(token, map) {
  const sinds = new Date().toISOString().slice(0, 10) + 'T00:00:00Z';
  const q = `'${map}' in parents and createdTime >= '${sinds}' and trashed = false`;
  const r = await fetch('https://www.googleapis.com/drive/v3/files?' + new URLSearchParams(
    { q, pageSize: '100', fields: 'files(id)' }), { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`telling ${r.status}: ${await r.text()}`);
  return ((await r.json()).files || []).length;
}

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
  if (!soort || !zaak || !SLUG.test(slug)) {
    return antwoord(request, 400, 'Kies wat je wil melden.', slug);
  }
  if (!bericht && (soort === 'Melding' || soort === 'Correctie' || soort === 'Ligging')) {
    return antwoord(request, 400, soort === 'Melding'
      ? 'Schrijf in een paar woorden wat je wil melden.'
      : 'Schrijf in een paar woorden wat er niet klopt.', slug);
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

async function foto(request, env) {
  const herkomst = request.headers.get('Origin');
  if (herkomst && new URL(herkomst).host !== new URL(request.url).host) {
    return antwoord(request, 403, 'Deze foto komt niet van Kroeg & Karaf.');
  }
  let f;
  try {
    f = await request.formData();
  } catch {
    return antwoord(request, 400, 'De foto kwam niet goed door. Probeer een kleinere foto.');
  }
  const veld = (k, max) => String(f.get(k) || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const slug = veld('slug', 200);
  if (veld('website', 200)) return antwoord(request, 200, 'Bedankt!', slug);
  const t = Number(veld('t', 20));
  if (t && Date.now() - t < MIN_SECONDEN * 1000) {
    return antwoord(request, 429, 'Dat ging wel heel snel. Probeer het over enkele seconden opnieuw.', slug);
  }
  const zaak = veld('zaak', 200);
  const naam = veld('naam', 80);
  const mail = veld('mail', 200);
  if (!zaak || !SLUG.test(slug)) return antwoord(request, 400, 'Bij welke zaak hoort deze foto?', slug);
  if (f.get('akkoord') !== 'ja') {
    return antwoord(request, 400, 'Vink aan dat je de foto zelf maakte en dat we hem mogen tonen.', slug);
  }
  if (mail && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(mail)) {
    return antwoord(request, 400, 'Dat e-mailadres lijkt niet te kloppen. Laat het leeg als je geen antwoord nodig hebt.', slug);
  }
  const bestanden = f.getAll('foto').filter(x => x && typeof x === 'object' && x.size);
  if (!bestanden.length) return antwoord(request, 400, 'Kies een foto.', slug);
  if (bestanden.length > MAX_FOTOS) return antwoord(request, 400, `Hoogstens ${MAX_FOTOS} foto's per keer.`, slug);
  for (const b of bestanden) {
    if (!FOTO_TYPES[b.type]) return antwoord(request, 400, 'Alleen foto\'s in jpg, png of webp.', slug);
    if (b.size > MAX_FOTO_BYTES) return antwoord(request, 400, 'Een foto mag hoogstens 15 MB zijn.', slug);
    if (!(await echteFoto(b))) return antwoord(request, 400, 'Dit bestand is geen foto in jpg, png of webp.', slug);
  }
  if (!env.GOOGLE_REFRESH_TOKEN || !env.FOTO_TE_BEOORDELEN) {
    return antwoord(request, 503, `Foto's insturen lukt even niet. Mail ze naar ${CONTACT}.`, slug);
  }

  const datum = new Date().toISOString().slice(0, 10);
  const links = [];
  try {
    const token = await googleToken(env);
    if ((await vandaagBinnen(token, env.FOTO_TE_BEOORDELEN)) + bestanden.length > FOTOS_PER_DAG) {
      return antwoord(request, 429, `Vandaag kwamen er al veel foto's binnen. Probeer het morgen opnieuw, of mail ze naar ${CONTACT}.`, slug);
    }
    for (const [i, b] of bestanden.entries()) {
      const meta = {
        name: `${zaak} - ${datum} - ${crypto.randomUUID().slice(0, 6)}${bestanden.length > 1 ? '-' + (i + 1) : ''}.${FOTO_TYPES[b.type]}`,
        parents: [env.FOTO_TE_BEOORDELEN],
        description: `Foto voor ${zaak}${naam ? ', door ' + naam : ''}. Pagina: /${slug}/`,
        appProperties: { slug, naam, zaak: zaak.slice(0, 80), datum },
      };
      links.push(await upload(token, meta, b));
    }
  } catch (err) {
    console.error('foto niet opgeslagen', err);
    return antwoord(request, 502, `Opslaan lukte niet. Probeer later opnieuw of mail ons op ${CONTACT}.`, slug);
  }

  // Een seintje voor de redactie; lukt dat niet, dan staat de foto toch al klaar.
  if (env.MELDING_AAN && env.MELDER) {
    const pagina = `${new URL(request.url).origin}/${slug}/`;
    const tekst = [
      `Nieuwe foto voor ${zaak}`, pagina, '',
      `Naamsvermelding: ${naam || '(geen, dan "een bezoeker")'}`,
      mail ? `Antwoorden kan: ${mail}` : 'Geen e-mailadres opgegeven.', '',
      'Bekijken:', ...links, '',
      'Goedkeuren: sleep de foto naar de map Goedgekeurd. Afkeuren: verwijder hem.',
    ].join('\n');
    try {
      await env.MELDER.send(new EmailMessage(VAN, env.MELDING_AAN,
        mime({ van: VAN, aan: env.MELDING_AAN, antwoordAan: mail, onderwerp: `Foto: ${zaak}`, tekst })));
    } catch (err) {
      console.error('fotomail niet verstuurd', err);
    }
  }
  return antwoord(request, 200,
    bestanden.length > 1 ? 'Bedankt! We bekijken je foto\'s en zetten ze daarna online.'
      : 'Bedankt! We bekijken je foto en zetten hem daarna online.', slug);
}

/* Een toegangssleutel voor Drive uit de vaste sleutel (refresh token) die
   scripts/foto_drive_instellen.py eenmalig aanmaakt. Alleen het recht
   drive.file: de Worker ziet enkel de mappen en bestanden die hij zelf maakte. */
async function googleToken(env) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error(`token ${r.status}: ${await r.text()}`);
  return (await r.json()).access_token;
}

async function upload(token, meta, bestand) {
  const grens = 'kk' + crypto.randomUUID().replace(/-/g, '');
  const kop = new TextEncoder().encode(
    `--${grens}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`
    + `--${grens}\r\nContent-Type: ${bestand.type}\r\n\r\n`);
  const staart = new TextEncoder().encode(`\r\n--${grens}--\r\n`);
  const body = new Blob([kop, await bestand.arrayBuffer(), staart]);
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${grens}` },
    body,
  });
  if (!r.ok) throw new Error(`upload ${r.status}: ${await r.text()}`);
  return (await r.json()).webViewLink;
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
  const terug = slug && SLUG.test(slug) ? `/${slug}/` : '/';
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
