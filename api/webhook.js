/*
 * WhatsApp Cloud API webhook handler
 *
 * This module exports a single request handler function that can be
 * deployed as a Vercel serverless function or run locally within
 * a Node.js HTTP server. It performs two key tasks:
 *
 *  1. Verifies the webhook when Meta sends a GET request during the
 *     subscription handshake. The verification token used by Meta
 *     must match the VERIFY_TOKEN environment variable. When the
 *     token matches and the mode is `subscribe`, the handler returns
 *     the value of the `hub.challenge` parameter, fulfilling the
 *     verification requirement described in Meta's webhooks guide【642192791091700†L145-L153】.
 *
 *  2. Processes incoming POST notifications for the messages field.
 *     When a message event is received, the handler extracts the
 *     messages array from the payload, appends those messages to a
 *     local JSON file (messages.json) and acknowledges the event
 *     with a 200 status. In a production environment you should
 *     replace the file-based storage with a persistent database or
 *     message queue (e.g. DynamoDB as shown in Meta's webhook tutorial【642192791091700†L274-L323】).
 */

const fs = require('fs');
// Import our database helper. When DATABASE_URL is set and pg is
// installed, messages will be stored in PostgreSQL. Otherwise they
// fall back to messages.json.
const { persistMessages } = require('../db');

// Read the verification token from the environment. You should set
// VERIFY_TOKEN in your deployment environment to the same string you
// configured on the Meta Developers portal. Do not hard‑code sensitive
// values in the repository.
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'CHANGE_ME';

/**
 * Deprecated: previously defined local file persistence. Replaced by
 * the shared persistMessages helper imported above. Keeping this
 * function here to avoid breaking existing imports. When called it
 * will delegate to the shared helper.
 *
 * @param {Array<Object>} newMessages The messages to persist
 */
function persistMessagesLegacy(newMessages) {
  persistMessages(newMessages);
}

/**
 * Main request handler. Compatible with both Vercel (export default)
 * and Node.js http.createServer(req, res => handler(req, res)).
 *
 * @param {Object} req HTTP request
 * @param {Object} res HTTP response
 */
module.exports = async function handler(req, res) {
  // Vercel uses `req.method` and `req.query`; Node.js HTTP server does
  // not populate `req.query`, so we normalise query parsing here.
  const method = req.method || 'GET';

  if (method === 'GET') {
    // Parse query parameters from URL for both Vercel and Node
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    // Verify token and mode according to Meta's specification【642192791091700†L145-L153】.
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
    // Collect the request body
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const payload = typeof body === 'string' && body.length
          ? JSON.parse(body)
          : {};
        // Expect notifications in the `entry` array. Each entry may
        // contain multiple changes; we iterate over them. When the
        // change field is `messages`, it means we have received new
        // WhatsApp messages to process【642192791091700†L274-L323】.
        if (Array.isArray(payload.entry)) {
          payload.entry.forEach(entry => {
            if (Array.isArray(entry.changes)) {
              entry.changes.forEach(change => {
                if (change.field === 'messages') {
                  const messages = change.value && change.value.messages;
                  if (Array.isArray(messages) && messages.length) {
                    persistMessages(messages);
                  }
                }
              });
            }
          });
        }
      } catch (err) {
        console.error('Error parsing webhook payload:', err);
      }
      // Always return a 200 response to acknowledge the event
      res.statusCode = 200;
      res.end('EVENT_RECEIVED');
    });
    return;
  }

  // Fallback for unsupported methods
  res.statusCode = 404;
  res.end();
};
