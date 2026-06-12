/* ============================================================
   SENSORIAL — form.js
   Envio do formulário de contato. POST pro proxy serverless
   (/api/lead), que fala com a Brevo guardando a chave no
   servidor. A chave NUNCA aparece no client.
   ============================================================ */
(function () {
  'use strict';
  var form = document.getElementById('form');
  if (!form) return;
  var statusEl = document.getElementById('form-status');
  var btn = form.querySelector('.form-submit');
  var btnText = btn ? btn.textContent : '';

  function setStatus(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = 'form-status' + (kind ? ' ' + kind : '');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = v; });

    // validação mínima
    if (!data.nome || !data.email || !data.whatsapp) {
      setStatus('Preencha nome, WhatsApp e email.', 'err');
      return;
    }
    var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email);
    if (!emailOk) { setStatus('Confira o email digitado.', 'err'); return; }

    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
    setStatus('', '');

    fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (res.ok) {
          form.reset();
          setStatus('Recebido. Nossa equipe comercial vai te chamar em breve.', 'ok');
        } else {
          setStatus((res.body && res.body.error) || 'Não foi possível enviar agora. Tente o WhatsApp.', 'err');
        }
      })
      .catch(function () {
        setStatus('Falha de conexão. Fale com a gente no WhatsApp.', 'err');
      })
      .finally(function () {
        if (btn) { btn.disabled = false; btn.textContent = btnText; }
      });
  });
})();
