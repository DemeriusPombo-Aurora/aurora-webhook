# Aurora Webhook - MVP

This repository contains the minimum viable implementation of the Aurora project, including a webhook for WhatsApp Cloud API, routing logic, and rate-limiting middleware.

## Files

- `/pages/api/webhook.js`: Handles GET verification and POST messages from WhatsApp. Validates signature using `APP_SECRET` and routes messages using logic in `lib/router.js`. Logs events with masked phone numbers.
- `/lib/router.js`: Defines reply messages and routes incoming text messages to responses.
- `/lib/whatsapp.js`: Sends text messages using the WhatsApp Cloud API.
- `/middleware.js`: Rate limits inbound requests in memory.
- `/middleware.upstash.js`: Alternative rate limit implementation using Upstash Redis. Requires `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
- `.env.example`: Example environment variables.
- `.github/workflows/ci.yml`: Basic CI workflow to install dependencies and run build.

## Setup

1. Copy `.env.example` to `.env.local` and fill in the required environment variables (`VERIFY_TOKEN`, `WHATSAPP_TOKEN`, `APP_SECRET`, `PHONE_NUMBER_ID`, etc.).
2. Deploy the project to Vercel and set the environment variables in the dashboard.
3. Configure your WhatsApp app's webhook URL to `https://your-domain.vercel.app/api/webhook` and use the same `VERIFY_TOKEN`.
4. Test the endpoint by sending messages to your business number.
