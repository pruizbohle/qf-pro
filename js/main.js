let medicamentos = [];

fetch("data/medicamentos.json")
  .then(r => r.json())
  .then(data => {
    medicamentos = data;
    console.log("✅ Medicamentos cargados:", medicamentos.length);
  })
  .catch(err => console.error("Error cargando medicamentos.json:", err));
