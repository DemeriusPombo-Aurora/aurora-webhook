const WELCOME =
  'Olá! Você está falando com o AURORA do Demetrius Pombo.\n' +
  'Posso ajudar com: menu, agendar, horários, voucher, academy ou atendente.';

const MENU =
  'MENU\n' +
  '1) Agendar horário\n' +
  '2) Horários de funcionamento\n' +
  '3) Voucher (escova/manicure)\n' +
  '4) Academy (cursos & calendário)\n' +
  '5) Falar com um atendente';

const AGENDAR =
  'Perfeito. Envie: serviço + unidade (Centro/Jardim) + dia.\n' +
  'Ex.: "Escova — Centro — quinta à tarde". Nossa equipe confirma em seguida.';

const HORARIOS =
  'Funcionamos terça a sábado, 9h–19h. Segundas: espaço para cursos/workshops sob solicitação.';

const VOUCHER =
  'Você tem um voucher de cortesia (escova ou manicure).\n' +
  'Para usar: nome completo + unidade + dia. Sujeito à disponibilidade.';

const ACADEMY =
  'Demetrius Pombo Academy: workshops e formações.\n' +
  'Envie "calendar" para receber datas e inscrições.';

const ATENDENTE =
  'Encaminhei sua mensagem para nossa equipe. Responderemos em breve.\n' +
  'Se for urgente, escreva "prioridade".';

const FALLBACK =
  'Entendi parcialmente. Digite "menu" ou diga: agendar, voucher, academy ou atendente.';

export function routeMessage(text) {
  if (!text) return null;

  const t = text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

  if (t === 'ping') return 'pong';
  if (/(^| )ola|oi|bom dia|boa tarde|boa noite|inicio|start\b/.test(t)) return WELCOME;
  if (/\bmenu\b/.test(t)) return MENU;

  if (/\bagendar|marcar|reserva\b/.test(t)) return AGENDAR;
  if (/\bhora|horario|funciona|abre|fecha\b/.test(t)) return HORARIOS;
  if (/\bvoucher|cortesia|presente\b/.test(t)) return VOUCHER;
  if (/\bacademy|curso|workshop|calend(ar|ario)\b/.test(t)) return ACADEMY;
  if (/\batendente|humano|suporte\b/.test(t)) return ATENDENTE;

  return FALLBACK;
}
