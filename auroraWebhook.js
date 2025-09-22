/*
 * Simple webhook server for the WhatsApp Cloud API.
 *
 * This server verifies GET requests from Meta using the hub.mode,
 * hub.verify_token and hub.challenge query parameters and responds with
 * the challenge when the verification token matches the expected value.
 *
 * For POST requests, the server parses the incoming JSON payload for
 * messages and appends them to a local messages.json file.  This
 * provides a lightweight persistence mechanism for capturing and
 * inspecting inbound messages during development.  In production you
 * should consider storing messages in a proper database such as
 * PostgreSQL, MongoDB or DynamoDB.  Persisting to a file is only
 * suitable for small experiments and will not scale across multiple
 * instances of the server.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
// Import our database helper. When a DATABASE_URL is configured, this
// helper will persist messages to a PostgreSQL database. Otherwise
// messages are appended to a local JSON file.
const { persistMessages } = require('./db');

// Secret token used by Meta to verify your webhook.  You should set
// WA_VERIFY_TOKEN in your environment when deploying.  Never commit
// your real token to source control.
const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN || 'CHANGE_ME_VERIFY_TOKEN';

// Port to listen on.  Vercel and other PaaS providers often set
// PORT automatically; otherwise default to 3000.
const PORT = parseInt(process.env.PORT || '3000', 10);

// Path to the local file used to persist inbound messages.  The
// messages file lives alongside this script. This constant is kept
// for backward compatibility but may no longer be used when a
// database is configured via DATABASE_URL.
const messagesFile = path.join(__dirname, 'messages.json');

/**
 * Handle GET requests to the webhook endpoint.  Responds with the
 * hub.challenge value when the verification token and mode are
 * correct.  Otherwise returns HTTP 403 to indicate a verification
 * failure.
 *
 * @param {http.IncomingMessage} req The request object
 * @param {http.ServerResponse} res The response object
 * @param {URL} urlObj Parsed URL for the request
 */
function handleVerification(req, res, urlObj) {
  const params = urlObj.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  // Only respond to the subscribe mode with the correct token
  if (mode === 'subscribe' && token && challenge && token === VERIFY_TOKEN) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(challenge);
    return;
  }

  // Otherwise, respond with 403 Forbidden
  res.writeHead(403, { 'Content-Type': 'text/plain' });
  res.end('Verification failed');
}

/**
 * Append an array of message objects to the messages file.  This
 * legacy helper remains for backwards compatibility but is no
 * longer used when a database connection is configured. It reads
 * the existing file (if present), merges the new messages and
 * writes everything back out as pretty‑printed JSON.
 *
 * @param {Array} newMessages Array of message objects to persist
 */
function appendMessagesToFile(newMessages) {
  // Delegate to the new persistMessages helper which supports both
  // database and file storage. This ensures consistent behaviour
  // across environments.
  persistMessages(newMessages);
}

/**
 * Handle POST requests to the webhook endpoint.  Parses the JSON body
 * and extracts messages from the expected WhatsApp Cloud API
 * notification structure.  When messages are present they are
 * appended to the messages.json file.  Responds with HTTP 200 to
 * acknowledge receipt or HTTP 400 for malformed requests.
 *
 * @param {http.IncomingMessage} req The request object
 * @param {http.ServerResponse} res The response object
 */
function handleWebhook(req, res) {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    // Protect against overly large requests (simple guard)
    if (body.length > 1e6) {
      req.connection.destroy();
    }
  });
  req.on('end', () => {
    try {
      const payload = JSON.parse(body || '{}');
      // Extract messages from the payload.  The payload structure
      // follows the documented format: entry[0].changes[0].value.messages
      const messages = payload?.entry?.[0]?.changes?.[0]?.value?.messages;
      if (Array.isArray(messages) && messages.length > 0) {
        // Persist the messages using our helper. This will write to
        // the database when available, or fall back to a JSON file.
        persistMessages(messages);
      }
      // Always respond with 200 to acknowledge the notification
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('EVENT_RECEIVED');
    } catch (err) {
      // Malformed JSON or other error
      console.error('Error processing webhook:', err);
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
    }
  });
}

// Create an HTTP server and route requests based on method and path
const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'GET' && urlObj.pathname === '/webhook') {
    handleVerification(req, res, urlObj);
  } else if (req.method === 'POST' && urlObj.pathname === '/webhook') {
    handleWebhook(req, res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`WhatsApp webhook server listening on port ${PORT}`);
});
