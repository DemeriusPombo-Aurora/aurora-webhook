/*
 * Database helper for persisting WhatsApp messages.
 *
 * This module attempts to connect to a PostgreSQL database via the
 * `DATABASE_URL` environment variable. When a connection string is
 * provided, a connection pool is established using the `pg` module
 * and a `whatsapp_messages` table is created if it does not already
 * exist. Messages are then inserted into this table as JSONB
 * documents. When `DATABASE_URL` is not set, the helper falls back
 * to persisting messages to a local JSON file in the same directory.
 *
 * You should install the `pg` package (npm install pg) and ensure
 * that your DATABASE_URL includes credentials and points to a
 * PostgreSQL instance. Render and many cloud providers expose a
 * connection string via environment variables. The SSL configuration
 * is set to not verify certificates to support self‑signed
 * certificates used by some providers; adjust as needed for your
 * environment.
 */

const fs = require('fs');
const path = require('path');
let Pool;
try {
  // Dynamically require pg only if available. If pg isn't installed
  // the module will not throw until we attempt to instantiate a Pool.
  Pool = require('pg').Pool;
} catch (err) {
  Pool = null;
}

// Location of the fallback messages file. Placed relative to this module.
const fallbackFile = path.join(__dirname, 'messages.json');

// Initialise a connection pool if a DATABASE_URL is provided and pg is
// installed. Some environments (e.g. Render) require SSL but do not
// verify certificates by default; set rejectUnauthorized=false to
// allow the connection. In more secure setups you should enable
// certificate verification.
const connectionString = process.env.DATABASE_URL;
const useDb = Boolean(connectionString && Pool);
let pool;
if (useDb) {
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  // Create the table on startup. This is run once when the module
  // loads. Any errors are logged but do not prevent startup.
  (async () => {
    const client = await pool.connect();
    try {
      await client.query(
        `CREATE TABLE IF NOT EXISTS whatsapp_messages (
          id SERIAL PRIMARY KEY,
          message JSONB NOT NULL,
          received_at TIMESTAMPTZ DEFAULT NOW()
        )`
      );
    } catch (err) {
      console.error('Failed to create messages table:', err);
    } finally {
      client.release();
    }
  })().catch((e) => console.error('DB init error:', e));
}

/**
 * Persist an array of message objects. When a database connection is
 * available, each message is inserted into the whatsapp_messages
 * table. Otherwise the messages are appended to a local JSON file
 * named messages.json. Errors are logged but do not propagate
 * back to callers.
 *
 * @param {Array<Object>} newMessages Array of messages to persist
 */
async function persistMessages(newMessages) {
  if (!Array.isArray(newMessages) || newMessages.length === 0) {
    return;
  }
  if (useDb) {
    // Insert each message into the database within a single client
    // connection. Using a loop rather than bulk insert to keep
    // implementation simple; adapt to your needs.
    const client = await pool.connect();
    try {
      for (const msg of newMessages) {
        await client.query(
          'INSERT INTO whatsapp_messages (message) VALUES ($1)',
          [msg]
        );
      }
    } catch (err) {
      console.error('Failed to insert messages into database:', err);
    } finally {
      client.release();
    }
  } else {
    // Fallback: append messages to a local JSON file. Read the
    // existing array (if present), concatenate and write it back.
    try {
      let existing = [];
      if (fs.existsSync(fallbackFile)) {
        try {
          const data = fs.readFileSync(fallbackFile, 'utf8');
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed)) {
            existing = parsed;
          }
        } catch (fileErr) {
          console.warn(
            'Persist messages: failed to read existing fallback file, starting fresh.',
            fileErr
          );
          existing = [];
        }
      }
      const updated = existing.concat(newMessages);
      fs.writeFileSync(
        fallbackFile,
        JSON.stringify(updated, null, 2),
        'utf8'
      );
      console.warn(
        'Persist messages: no database connection; messages saved to local file.'
      );
    } catch (err) {
      console.error('Failed to persist messages to file:', err);
    }
  }
}

module.exports = { persistMessages };
