// ============================================================
// SENSORIAL — /api/lead  (Vercel Serverless Function)
// Proxy do formulário -> Brevo. A chave fica em
// process.env.BREVO_API_KEY (Vercel > Settings > Environment
// Variables). NUNCA versionar a chave no repositório.
// ============================================================

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const API_KEY = process.env.BREVO_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: 'Integração não configurada no servidor.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  body = body || {};

  const nome = (body.nome || '').toString().trim();
  const email = (body.email || '').toString().trim().toLowerCase();
  const whatsapp = (body.whatsapp || '').toString().trim();

  if (!nome || !email || !whatsapp) {
    return res.status(400).json({ error: 'Nome, WhatsApp e email são obrigatórios.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email inválido.' });
  }

  // telefone só dígitos, padrão BR (+55)
  let phone = whatsapp.replace(/\D/g, '');
  if (phone && !phone.startsWith('55')) phone = '55' + phone;

  const payload = {
    email,
    updateEnabled: true,
    attributes: {
      NOME: nome,
      SMS: phone ? '+' + phone : undefined,
      WHATSAPP: whatsapp,
      PROFISSAO: body.profissao || '',
      TIPO_CLINICA: body.tipo_clinica || '',
      PACIENTES_MES: body.pacientes_mes || '',
      JA_TRABALHA: body.ja_trabalha || '',
      COMO_REALIZA: body.como_realiza || '',
      INTERESSE: body.interesse || '',
      MENSAGEM: body.mensagem || '',
      ORIGEM: 'Landing Sensorial Moove'
    }
  };

  // remove attrs vazios
  Object.keys(payload.attributes).forEach(function (k) {
    const v = payload.attributes[k];
    if (v === undefined || v === '') delete payload.attributes[k];
  });

  try {
    const r = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    // 201 = criado, 204 = atualizado. 400 com code duplicate_parameter
    // também é aceitável (contato já existe e foi atualizado).
    if (r.status === 201 || r.status === 204) {
      return res.status(200).json({ ok: true });
    }

    const errBody = await r.json().catch(function () { return {}; });
    if (errBody && errBody.code === 'duplicate_parameter') {
      return res.status(200).json({ ok: true });
    }

    return res.status(502).json({ error: 'Não foi possível registrar o contato.', detail: errBody.message || null });
  } catch (e) {
    return res.status(502).json({ error: 'Falha ao falar com o serviço de email.' });
  }
}
