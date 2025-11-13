// 1️⃣ URL base del backend
const BASE_URL = "https://evalumind.onrender.com";

// 2️⃣ Variables
let selectedFiles = [];

const dropArea = document.querySelector(".drop-area");
const dragText = dropArea.querySelector("h2");
const button = dropArea.querySelector("button");
const input = dropArea.querySelector("#input-file");
const preview = document.querySelector("#preview");

const iconMap = {
  'docx': 'https://cdn-icons-png.flaticon.com/512/281/281760.png',
  'pdf': 'https://cdn-icons-png.flaticon.com/512/337/337946.png',
  'txt': 'https://cdn-icons-png.flaticon.com/512/3022/3022256.png',
  'csv': 'https://cdn-icons-png.flaticon.com/512/888/888879.png'
};

// 3️⃣ Seleccionar archivos con el botón
button.addEventListener("click", () => input.click());

// 4️⃣ Cuando se seleccionan archivos
input.addEventListener("change", (e) => {
  const files = e.target.files;
  if (files && files.length > 0) {
    showFiles(files);

    // 🔹 Asegura que los archivos se guarden correctamente
    selectedFiles = [...selectedFiles, ...Array.from(files)];

    // 🔹 Limpia el mensaje de error si ya hay archivos
    const statusDiv = document.getElementById("status");
    statusDiv.innerText = "";
  }
});


// 5️⃣ Drag & Drop
dropArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropArea.classList.add("active");
  dragText.textContent = "Suelta para subir los archivos";
});

dropArea.addEventListener("dragleave", () => {
  dropArea.classList.remove("active");
  dragText.textContent = "Arrastra y suelta los archivos";
});

dropArea.addEventListener("drop", (e) => {
  e.preventDefault();
  dropArea.classList.remove("active");
  dragText.textContent = "Arrastra y suelta los archivos";
  
  const files = e.dataTransfer.files;
  showFiles(files);
});

// 6️⃣ Mostrar archivos seleccionados
function showFiles(files) {
  // Agregar los nuevos archivos sin borrar los anteriores
  selectedFiles = [...selectedFiles, ...Array.from(files)];

  preview.innerHTML = ""; // Limpiar preview anterior

  selectedFiles.forEach(file => {
    const ext = file.name.split('.').pop().toLowerCase();
    const icon = iconMap[ext] || 'https://cdn-icons-png.flaticon.com/512/1828/1828665.png';
    preview.innerHTML += `
      <div class="file-container">
        <img src="${icon}" width="40" alt="icono">
        <span>${file.name}</span>
      </div>`;
  });
}

// 7️⃣ Enviar archivos al backend
document.getElementById("upload-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const statusDiv = document.getElementById("status");
  const instructionsInput = document.getElementById("instructions");

  // ✅ Nueva verificación más robusta
  if (!selectedFiles || selectedFiles.length === 0) {
    statusDiv.innerText = "⚠️ No se ha seleccionado ningún archivo.";
    return;
  }

  statusDiv.innerText = "Subiendo y evaluando archivos...";


  const formData = new FormData();
  selectedFiles.forEach(f => formData.append("files", f));
  formData.append("instructions", instructionsInput.value);

  try {
    const response = await fetch(`${BASE_URL}/upload`, {
      method: "POST",
      body: formData
    });

    if (!response.ok) throw new Error("Error HTTP: " + response.status);

    const data = await response.json();
    displayResults(data.ensayos_procesados);
    displayGroupReview(data.group_review, data.group_audio_url);

    statusDiv.innerText = "Evaluación completada correctamente ✅";
  } catch (error) {
    console.error("Error al enviar archivos:", error);
    statusDiv.innerText = "❌ Error al enviar archivos.";
  }
});


function displayResults(essays) {
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = ""; // Limpiar contenido anterior

  const table = document.createElement("table");

  // Crear encabezado de la tabla
  const headerRow = document.createElement("tr");
  ["Autor", "Archivo", "Evaluación", "Audio"].forEach(header => {
    const th = document.createElement("th");
    th.innerText = header;
    headerRow.appendChild(th);
  });
  table.appendChild(headerRow);

  // Crear filas con datos de los ensayos
  essays.forEach(essay => {
    const row = document.createElement("tr");

    const tdAutor = document.createElement("td");
    tdAutor.innerText = essay.author;

    const tdArchivo = document.createElement("td");
    tdArchivo.innerText = essay.filename;

    const tdEvaluacion = document.createElement("td");
    tdEvaluacion.innerHTML = `
      <div class="evaluation-container">
        <p><strong>Calificación:</strong> ${extractScore(essay.review)}</p>
        <p><strong>Comentarios:</strong> ${extractComments(essay.review)}</p>
        <p><strong>Áreas de Fortaleza:</strong> ${extractStrengths(essay.review)}</p>
        <p><strong>Áreas de Mejora:</strong> ${extractImprovements(essay.review)}</p>
      </div>
    `;

    // Función para extraer solo la calificación
    function extractScore(review) {
      if (!review.includes("Calificación:")) return "Sin calificación";
      return review.split("Calificación:")[1].split("Comentarios:")[0].trim();
    }

    // Función para extraer solo los comentarios sin calificación ni título de "Comentarios"
    function extractComments(review) {
      if (!review.includes("Comentarios:")) return "Sin comentarios";
      
      let cleanReview = review.split("Comentarios:")[1];
      
      // Eliminar "Calificación: X" si aún aparece al inicio
      cleanReview = cleanReview.replace(/^Calificación:\s*\d+\s*/i, "").trim();
      
      return cleanReview.split("Áreas de fortaleza:")[0].trim();
    }

    // Función para extraer Áreas de Fortaleza
    function extractStrengths(review) {
      if (!review.includes("Áreas de fortaleza:")) return "No especificado";
      return review.split("Áreas de fortaleza:")[1].split("Áreas de mejora:")[0].trim();
    }

    // Función para extraer Áreas de Mejora
    function extractImprovements(review) {
      if (!review.includes("Áreas de mejora:")) return "No especificado";
      return review.split("Áreas de mejora:")[1].trim();
    }

    const tdAudio = document.createElement("td");
    if (essay.audio_url) {
      const audio = document.createElement("audio");
      audio.setAttribute("controls", "");

      const source = document.createElement("source");
      // Se usa BASE_URL para construir la ruta completa del audio
      source.src = `${BASE_URL}${essay.audio_url}`;
      source.type = "audio/mpeg";

      audio.appendChild(source);
      audio.load(); // 🔥 Forzar recarga del audio

      tdAudio.appendChild(audio);
    }

    row.appendChild(tdAutor);
    row.appendChild(tdArchivo);
    row.appendChild(tdEvaluacion);
    row.appendChild(tdAudio);

    table.appendChild(row);
  });

  resultsDiv.appendChild(table);
  // **📜 Hacer scroll automático hacia la tabla de resultados 📜**
  resultsDiv.scrollIntoView({ behavior: "smooth", block: "start" });
}

function displayGroupReview(review, audio_url) {
  const container = document.getElementById("group-review-container");
  container.innerHTML = ""; // Limpiar el contenido previo

  if (!review && !audio_url) return; // No generar la tabla si no hay datos

  const table = document.createElement("table");
  table.classList.add("evaluation-table");

  if (review) {
    // Extraer partes de la evaluación
    const match = review.match(/Comentarios:\s*(.*?)\s*Áreas de fortaleza:\s*(.*?)\s*Áreas de mejora:\s*(.*)/s);
    
    if (match) {
      const [, comentarios, fortalezas, mejoras] = match;

      // Comentarios generales
      table.appendChild(createTableRow("Comentarios:", comentarios));

      // Áreas de fortaleza
      table.appendChild(createTableSubtitle("🌟 Áreas de Fortaleza"));
      table.appendChild(createTableRow("", fortalezas));

      // Áreas de mejora
      table.appendChild(createTableSubtitle("📉 Áreas de Mejora"));
      table.appendChild(createTableRow("", mejoras));
    } else {
      table.appendChild(createTableRow("Comentarios:", review)); // Si no hay formato esperado, mostrar todo como comentario
    }
  }

  // Audio si existe
  if (audio_url) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.setAttribute("colspan", "2");

    const audio = document.createElement("audio");
    audio.setAttribute("controls", "");
    const source = document.createElement("source");
    // Se usa BASE_URL para el audio de la revisión grupal
    source.src = `${BASE_URL}${audio_url}`;
    source.type = "audio/mpeg";

    audio.appendChild(source);
    cell.appendChild(audio);
    row.appendChild(cell);
    table.appendChild(row);
  }

  container.appendChild(table);
}

// 🔹 Función auxiliar para crear filas de la tabla
function createTableRow(title, content) {
  const row = document.createElement("tr");
  const titleCell = document.createElement("td");
  titleCell.innerHTML = `<b>${title}</b>`;
  const contentCell = document.createElement("td");
  contentCell.textContent = content;
  row.appendChild(titleCell);
  row.appendChild(contentCell);
  return row;
}

// 🔹 Función auxiliar para crear subtítulos dentro de la tabla
function createTableSubtitle(title) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.setAttribute("colspan", "2");
  cell.style.fontWeight = "bold";
  cell.style.padding = "10px";
  cell.textContent = title;
  row.appendChild(cell);
  return row;
}
