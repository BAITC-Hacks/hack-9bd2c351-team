// Host on the SAME origin as /embed and /api/* (use a reverse proxy on ekt.kz).
(() => {
  if (document.getElementById('ekt-assistant-launcher')) return;
  const button = document.createElement('button');
  button.id = 'ekt-assistant-launcher';
  button.textContent = '✦ Помочь с выбором?';
  button.setAttribute('aria-expanded', 'false');
  button.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:9999;border:0;border-radius:24px;padding:16px 22px;background:#235747;color:white;font:14px Arial;cursor:pointer;box-shadow:0 4px 20px #0002';
  const frame = document.createElement('iframe');
  frame.title = 'Консультант Электрокомплект';
  frame.src = '/embed'; frame.hidden = true;
  frame.style.cssText = 'position:fixed;right:20px;bottom:80px;width:min(460px,calc(100vw - 32px));height:min(700px,calc(100dvh - 110px));z-index:9999;border:1px solid #dce3d5;border-radius:16px;background:white;box-shadow:0 12px 60px #0002';
  button.onclick = () => { frame.hidden = !frame.hidden; button.setAttribute('aria-expanded', String(!frame.hidden)); button.textContent = frame.hidden ? '✦ Помочь с выбором?' : 'Закрыть чат ×'; };
  document.body.append(frame, button);
})();
