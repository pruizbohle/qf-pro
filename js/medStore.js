// js/medStore.js
// Adaptado al nuevo medicamentos.json (array de objetos)

export async function loadAll() {
  try {
    const meds = await fetch("../data/medicamentos.json").then(r => r.json());

    if (!Array.isArray(meds)) {
      console.error("❌ medicamentos.json no es un array:", meds);
      return { skus: [], skuById: {}, byBase: {} };
    }

    const skus = [];
    const skuById = {};
    const byBase = {};

    meds.forEach(m => {
      const nombre = [m.BASE_NAME, m.FUERZA, m.FORMA]
        .filter(Boolean)
        .join(" ")
        .toUpperCase();

      const sku = {
        skuId: m.ID,
        base: (m.BASE_NAME || "").toLowerCase(),
        nombre,
        presentacion: `${m.FUERZA || ""} ${m.FORMA || ""}`.toUpperCase(),
        forma: normalizarForma(m.FORMA),

        // 👇 claves de nivel superior para filtros rápidos
        aps: m.APS === "SI",
        secundario: m.SECUNDARIO === "SI",

        // 👇 banderas completas para PRM/criterios
        flags: {
          aps: m.APS === "SI",
          beers: m.BEERS === "SI",
          stopp: m.STOPP === "SI",
          start: m.START === "SI",
          nefr: m.NEFR === "SI",
          embarazo: m.PREG && m.PREG !== "NO" ? m.PREG : null
        },
        raw: m
      };

      skus.push(sku);
      skuById[sku.skuId] = sku;

      if (!byBase[sku.base]) byBase[sku.base] = [];
      byBase[sku.base].push(sku);
    });

    const DB = { skus, skuById, byBase };

    // Debug en consola
    console.log("✅ Medicamentos cargados:", skus.length);
    window.DBmeds = DB;

    return DB;
  } catch (e) {
    console.error("❌ Error cargando medicamentos.json:", e);
    return { skus: [], skuById: {}, byBase: {} };
  }
}

function normalizarForma(txt = "") {
  txt = txt.toLowerCase();
  if (txt.includes("comprimido")) return "comprimido";
  if (txt.includes("capsula")) return "capsula";
  if (txt.includes("susp")) return "suspension";
  if (txt.includes("aerosol") || txt.includes("inhal")) return "inhalador";
  if (txt.includes("insulina")) return "insulina";
  return "otro";
}
