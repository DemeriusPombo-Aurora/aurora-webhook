/**
 * pages/api/webhook.js — Aurora WA (Meta Cloud)
 *
 * Handles GET requests for webhook verification and POST requests for incoming messages.
 * Disables the body parser to capture raw request bodies, and sends an automatic
 * reply for text messages using the WhatsApp Cloud API.
 */

export const config = { api: { bodyParser: false } };

const getRawBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

async function sendText(to, text) {
  const url = `https://graph.facebook.com/v20.0/${process.env.META_PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.META_WABA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Failed to send message: ${response.status} ${JSON.stringify(errorData)}`);
  }

  return await response.json();
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  if (req.method === 'POST') {
    let body;
    try {
      const raw = await getRawBody(req);
      body = JSON.parse(raw);
    } catch (e) {
      console.error('Error parsing webhook body', e);
      return res.status(400).send('Bad request');
    }

    console.log('[Webhook event]', JSON.stringify(body));

    const message =
      body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0] || null;
    const sender = message?.from;
    const messageType = message?.type;

    if (sender && messageType === 'text') {
      try {
        await sendText(sender, 'Olá, sou a Aurora.');
      } catch (sendError) {
        console.error('Error sending reply', sendError);
      }
    }

    return res.status(200).send('EVENT_RECEIVED');
  }

  return res.status(405).send('Method Not Allowed');
}
