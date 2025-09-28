// js/header.js
export function mountHeader(rootSelector="#header"){
  const host = document.querySelector(rootSelector);
  if(!host) return;
  host.innerHTML = `
    <header class="app-header">
      <div class="bar container">
        <div class="brand">
          <strong>QF PRO</strong><br><span class="muted">Atención farmacéutica</span>
        </div>
        <div class="search"><input id="global-search" placeholder="Buscar medicamento, herramienta o criterio…"></div>
        <div class="user" title="Usuario"></div>
      </div>
    </header>
  `;
  // (opcional) wire básico de búsqueda
  const input = host.querySelector('#global-search');
  input?.addEventListener('keydown', e=>{
    if(e.key==='Enter'){
      const q = (input.value||'').trim().toLowerCase();
      if(!q) return;
      // Router simple: si incluye palabras, deriva a material o vademécum
      if(q.includes('interacc') || q.includes('beers') || q.includes('stopp') || q.includes('start') || q.includes('ajuste') || q.includes('embarazo')){
        location.href = (location.pathname.includes('/sections/') ? '' : 'sections/') + 'material.html?q='+encodeURIComponent(q);
      }else{
        location.href = (location.pathname.includes('/sections/') ? '' : 'sections/') + 'vademecum.html?q='+encodeURIComponent(q);
      }
    }
  });
}
