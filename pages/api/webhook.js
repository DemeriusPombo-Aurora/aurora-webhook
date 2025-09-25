const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || "v21.0";
const WABA_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID;
const WABA_ACCESS_TOKEN = process.env.WHATSAPP_TOKEN || process.env.WABA_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || process.env.VERIFY_TOKEN;

export default async function handler(req, res) {
  if (req.method === "GET") {
    // Verificação do webhook (Meta)
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === VERIFY_TOKEN) return res.status(200).send(challenge);
    return res.status(403).send("Verification token mismatch");
  }

  if (req.method === "POST") {
    try {
      const body = req.body;
      console.log("[WEBHOOK] Entrada:", JSON.stringify(body));

      if (body?.object !== "whatsapp_business_account" || !Array.isArray(body.entry)) {
        console.warn("[WEBHOOK] Payload não esperado");
        return res.status(200).send("IGNORED");
      }

      for (const entry of body.entry) {
        const changes = entry?.changes || [];
        for (const change of changes) {
          const value = change?.value;
          const messages = value?.messages || [];
          const contacts = value?.contacts || [];

          for (const msg of messages) {
            try {
              await handleIncomingMessage({ msg, contacts });
            } catch (e) {
              console.error("[WEBHOOK] Erro handleIncomingMessage:", e);
            }
          }
        }
      }

      return res.status(200).send("EVENT_RECEIVED");
    } catch (e) {
      console.error("[WEBHOOK] Erro no POST:", e);
      // Ainda responde 200 para evitar retries infinitos do Meta
      return res.status(200).send("EVENT_RECEIVED");
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).send("Method Not Allowed");
}

async function handleIncomingMessage({ msg, contacts }) {
  const from = msg?.from;
  if (!from) return;

  const contactName = contacts?.[0]?.profile?.name || "cliente";

  // Detecta texto (incl. botões/listas)
  let userText = "";
  if (msg.type === "text") userText = (msg.text?.body || "").trim().toLowerCase();
  else if (msg.type === "button") userText = (msg.button?.text || "").trim().toLowerCase();
  else if (msg.type === "interactive") {
    const t = msg.interactive?.type;
    if (t === "button_reply") userText = (msg.interactive?.button_reply?.title || "").trim().toLowerCase();
    if (t === "list_reply")   userText = (msg.interactive?.list_reply?.title  || "").trim().toLowerCase();
  } else if (["image", "audio", "document"].includes(msg.type)) userText = msg.type;

  console.log("[WEBHOOK] Mensagem de", from, "→", userText || msg.type);

  // Saudações explícitas
  const greetings = ["oi","olá","ola","hey","hi","bom dia","boa tarde","boa noite"];
  if (greetings.includes(userText)) {
    await sendText(from, `Olá, ${contactName}! 👋 Posso te ajudar com *serviços*, *agendar* ou *menu*?`);
    return;
  }

  // Menu
  if (userText.includes("menu")) {
    await sendText(from,
      `Olá, ${contactName}! 💇‍♀️✨\n\n` +
      `Escolha uma opção:\n` +
      `1) Serviços e preços\n` +
      `2) Agendar horário\n` +
      `3) Localização e horário de funcionamento\n\n` +
      `Você pode digitar 1, 2 ou 3.`
    );
    return;
  }

  // Opções
  if (userText === "1" || userText.includes("servi")) {
    await sendText(from,
      "Serviços (resumo):\n" +
      "• Escova – a partir de R$ 90\n" +
      "• Manicure – a partir de R$ 45\n" +
      "• Corte feminino – a partir de R$ 180\n\n" +
      "Deseja ver o *menu completo* ou voltar ao *menu*?"
    );
    return;
  }

  if (userText === "2" || userText.includes("agend")) {
    await sendText(from,
      "Perfeito! Para agendar, me informe:\n" +
      "• Serviço desejado\n" +
      "• Dia (ex.: terça)\n" +
      "• Horário (ex.: 15:30)\n" +
      "Também posso sugerir horários disponíveis. 😉"
    );
    return;
  }

  if (userText === "3" || userText.includes("local") || userText.includes("horár")) {
    await sendText(from,
      "Atendimento de *terça a sábado, 9h às 19h*. Segunda sob consulta para cursos/workshops.\n\n" +
      "Endereço (Unidade 1): Av. Barão do Rio Branco – São José dos Campos.\n" +
      "Posso enviar o *pin do mapa* se desejar."
    );
    return;
  }

  // Mídia
  if (["image","audio","document"].includes(userText)) {
    await sendText(from, "Recebi seu arquivo, obrigado! Prefere falar sobre *serviços*, *agendar* ou *menu*?");
    return;
  }

  // Fallback
  const preview = (msg.text?.body || "").trim();
  await sendText(from,
    (preview ? `Você disse: “${preview}”. ` : `Olá, ${contactName}! `) +
    "Posso te ajudar com *serviços*, *agendar* ou *menu*?"
  );
}

async function sendText(to, text) {
  if (!WABA_PHONE_NUMBER_ID || !WABA_ACCESS_TOKEN) {
    console.error("[SEND] Variáveis ausentes (PHONE_NUMBER_ID / TOKEN).");
    return;
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WABA_PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to, // E.164 sem '+'
    type: "text",
    text: { body: text }
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${WABA_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const ok = resp.ok;
  let body = "";
  try { body = await resp.text(); } catch {}
  if (!ok) {
    console.error("[SEND] Erro Graph:", resp.status, body);
  } else {
    console.log("[SEND] Mensagem enviada OK:", body);
  }
}
