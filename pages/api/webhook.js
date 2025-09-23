import crypto from 'crypto';
import getRawBody from 'raw-body';
import { sendText } from '../../lib/whatsapp';
import { routeMessage } from '../../lib/router';

export const config = { api: { bodyParser: false } };

// Helpers de log (mascara telefone)
const maskPhone = (s='') => s.replace(/(\+?\d{0,4})\d{4}(\d{0,4})/, '$1****$2');
const logInfo = (msg, obj={}) => console.log('[AURORA]', msg, safe(obj));
const logWarn = (msg, obj={}) => console.warn('[AURORA:WARN]', msg, safe(obj));
const logErr  = (msg, obj={}) => console.error('[AURORA:ERR]', msg, safe(obj));
const safe = (o) => {
  try {
    const j = JSON.parse(JSON.stringify(o));
    if (j?.from) j.from = maskPhone(j.from);
    if (j?.to) j.to = maskPhone(j.to);
    if (j?.token) j.token = '***';
    return j;
  } catch { return {}; }
};

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];
      if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
        return res.status(200).send(challenge);
      }
      return res.status(403).send('Forbidden');
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).send('Method Not Allowed');
    }

    // Corpo bruto para assinatura
    const raw = await getRawBody(req);
    // Valida assinatura (se APP_SECRET presente)
    const appSecret = process.env.APP_SECRET;
    const headerSig = req.headers['x-hub-signature-256'];
    if (appSecret && headerSig) {
      const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(raw).digest('hex');
      if (headerSig !== expected) {
        logWarn('Invalid signature');
        return res.status(401).send('Invalid signature');
      }
    }

    const data = JSON.parse(raw.toString('utf8'));
    if (data?.object !== 'whatsapp_business_account') {
      return res.status(200).end();
    }

    for (const entry of data.entry || []) {
      const entryId = entry.id;
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const messages = value.messages || [];
        for (const msg of messages) {
          const from = msg.from;
          const type = msg.type;
          const text = type === 'text' ? (msg.text?.body || '').trim() : '';

          logInfo('INCOMING', { entryId, from, type });

          // Roteia: “ping”→“pong”, senão menus e fluxos
          const reply = routeMessage(text);
          if (reply) {
            await sendText(from, reply);
            logInfo('REPLIED', { from, len: reply.length });
          }
        }
      }
    }

    return res.status(200).end();
  } catch (err) {
    logErr('Webhook error', { message: err?.message });
    return res.status(500).send('Server error');
  }
}
