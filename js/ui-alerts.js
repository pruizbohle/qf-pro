export function renderAlertas(container, alertas){
  container.innerHTML = alertas.map(a=>`
    <div class="row">
      <span>
        <b>${a.titulo || a.id || 'Alerta'}</b>
        <small class="pill">${(a.severidad||'').toUpperCase()}</small><br/>
        <span class="muted">${a.justificacion || a.mecanismo || a.nota || ''}</span>
      </span>
      <button class="btn" data-add="${a.id}">Agregar al texto</button>
    </div>
  `).join("");
  container.querySelectorAll("[data-add]").forEach(btn=>{
    btn.onclick = ()=> alert("Demo: aquí se insertaría la sugerencia en el texto.");
  });
}