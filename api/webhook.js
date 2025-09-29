/*
 * WhatsApp Cloud API webhook handler for Aurora.
 *
 * Supports verification handshake and processes incoming messages.
 * Stores messages using persistMessages helper and replies automatically.
 */

const { persistMessages } = require('../db');

// Verification token used for webhook handshake
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'CHANGE_ME';
// Meta WhatsApp Cloud API credentials
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

/**
 * Send a text message via WhatsApp Cloud API.
 * @param {string} to - the WhatsApp user ID to send to
 * @param {string} text - the text body
 */
async function sendText(to, text) {
  const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = {};
    }
    console.error('Failed to send message:', response.status, errorData);
    throw new Error(`Failed to send message: ${response.status}`);
  }
  return await response.json();
}

module.exports = async function handler(req, res) {
  const method = req.method || 'GET';

  if (method === 'GET') {
    // Parse query parameters for verification
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain');
      res.end(challenge);
    } else {
      res.statusCode = 403;
      res.end();
    }
    return;
  }

  if (method === 'POST') {
    // Collect request body
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', async () => {
      try {
        const payload = typeof body === 'string' && body.length ? JSON.parse(body) : {};
        if (Array.isArray(payload.entry)) {
          for (const entry of payload.entry) {
            if (Array.isArray(entry.changes)) {
              for (const change of entry.changes) {
                if (change.field === 'messages') {
                  const messages = change.value && change.value.messages;
                  if (Array.isArray(messages) && messages.length) {
                    // Persist received messages
                    try {
                      await persistMessages(messages);
                    } catch (err) {
                      console.error('Error persisting messages:', err);
                    }
                    // Send auto-reply to each text message
                    for (const message of messages) {
                      const sender = message.from;
                      const messageType = message.type;
                      if (sender && messageType === 'text') {
                        try {
                          await sendText(sender, 'Olá, sou a Aurora.');
                        } catch (sendErr) {
                          console.error('Error sending reply', sendErr);
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('Error parsing webhook payload:', err);
      }
      // Always acknowledge the event
      res.statusCode = 200;
      res.end('EVENT_RECEIVED');
    });
    return;
  }

  // Fallback for unsupported methods
  res.statusCode = 404;
  res.end();
};
