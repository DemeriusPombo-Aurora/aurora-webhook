export async function sendText(to, body) {
  const version = process.env.WHATSAPP_API_VERSION || 'v21.0';
  const phoneId = process.env.PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;

  const url = 'https://graph.facebook.com/' + version + '/' + phoneId + '/messages';
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body }
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error('WhatsApp error ' + resp.status + ': ' + detail);
  }
  return await resp.json();
}
