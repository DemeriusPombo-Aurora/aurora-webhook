import crypto from 'crypto';
import getRawBody from 'raw-body';
import { sendText } from '../../lib/whatsapp';
import { routeMessage } from '../../lib/router';

export const config = { api: { bodyParser: false } };

// Maintain a set of processed message IDs to avoid duplicate processing
const seenMessageIds = new Set();
function isDuplicate(id) {
  if (!id) return false;
  if (seenMessageIds.has(id)) return true;
  if (seenMessageIds.size > 10000) seenMessageIds.clear();
  seenMessageIds.add(id);
  return false;
}

// Threshold for old events (seconds)
const REPLAY_THRESHOLD_SECONDS = 5 * 60; // 5 minutes

// Check if an event is older than the threshold
function isOldEvent(timestamp) {
  if (!timestamp) return false;
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  return now - ts > REPLAY_THRESHOLD_SECONDS;
}

// Verify the X-Hub-Signature-256 header using the app secret
function verifySignature(appSecret, rawBody, signatureHeader) {
  if (!appSecret || !signatureHeader) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const APP_SECRET = process.env.APP_SECRET || '';

  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token && token === VERIFY_TOKEN) {
      res.status(200).send(challenge);
    } else {
      res.status(403).send('Forbidden');
    }
    return;
  }

  if (req.method === 'POST') {
    // Read raw body for signature verification
    const raw = await getRawBody(req);
    const sigHeader = req.headers['x-hub-signature-256'];
    if (APP_SECRET && sigHeader && !verifySignature(APP_SECRET, raw, sigHeader)) {
      console.warn('[Webhook] Invalid signature');
      res.status(401).json({ ok: false });
      return;
    }
    let body;
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch (err) {
      console.error('[Webhook] Invalid JSON', err);
      res.status(400).json({ ok: false });
      return;
    }
    // Acknowledge receipt immediately
    res.status(200).json({ ok: true });

    // Process events asynchronously
    processWebhookEvents(body).catch((err) => {
      console.error('[Webhook] Error processing events', err);
    });
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).send('Method Not Allowed');
}

async function processWebhookEvents(payload) {
  if (!payload || !Array.isArray(payload.entry)) return;
  for (const entry of payload.entry) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const value = change.value || {};
      // Handle messages
      if (Array.isArray(value.messages)) {
        for (const msg of value.messages) {
          const msgId = msg.id || (msg.key ? msg.key.id : undefined);
          const from = msg.from;
          const type = msg.type;
          const timestamp = msg.timestamp;
          // Skip duplicates
          if (isDuplicate(msgId)) {
            continue;
          }
          // Skip old events
          if (isOldEvent(timestamp)) {
            console.log('[Webhook] Ignoring old message', msgId);
            continue;
          }
          // Log message details
          console.log(JSON.stringify({
            event: 'message',
            messageId: msgId,
            from,
            type,
            body: (msg[type] ? msg[type].body : null) || null,
            timestamp,
          }));
          try {
            const text = type === 'text' ? ((msg.text && msg.text.body) ? msg.text.body.trim() : '') : '';
            let reply = null;
            const normalized = text.toLowerCase();
            const greetings = ['oi','olá','ola','hello','hi'];
            if (greetings.includes(normalized)) {
              reply = 'Olá! Como posso ajudar?';
            } else {
              reply = routeMessage(text);
            }
            if (reply) {
              await sendText(from, reply);
              console.log(`[Webhook] Sent reply to ${from}`);
            }
          } catch (err) {
            console.error('[Webhook] Error in routing or sending', err);
          }
        }
      }
      // Handle statuses
      if (Array.isArray(value.statuses)) {
        for (const st of value.statuses) {
          const id = st.id;
          const status = st.status;
          const ts = st.timestamp;
          if (isOldEvent(ts)) {
            console.log('[Webhook] Ignoring old status', id);
            continue;
          }
          console.log(JSON.stringify({
            event: 'status',
            messageId: id,
            status,
            timestamp: ts,
          }));
        }
      }
      // Handle errors
      if (Array.isArray(value.errors)) {
        for (const err of value.errors) {
          console.error(JSON.stringify({
            event: 'error',
            error: err,
          }));
        }
      }
    }
  }
}
