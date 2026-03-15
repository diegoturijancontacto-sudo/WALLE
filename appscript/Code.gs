/**
 * Blog de Notas - Servidor (Google Apps Script)
 * Versión compatible con app.js
 */

const SHEET_NAME = 'BlogDeNotas';

/**
 * CONFIGURACIÓN INICIAL
 * Ejecuta esta función una vez para preparar la hoja.
 */
function configurarHoja() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    const headers = ['ID_Nota', 'Título', 'Contenido', 'Fecha de Creación', 'Responsable', 'Citas (IDs)'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f3f3f3');
    sheet.setFrozenRows(1);
  }
}

/**
 * MANEJADOR DE PETICIONES GET
 * Soporta: action=getAll y action=getById
 */
function doGet(e) {
  try {
    const action = e.parameter.action;
    const id = e.parameter.id;
    const notas = obtenerTodasLasNotas();

    if (action === 'getById') {
      const nota = notas.find(n => n.ID_Nota === id);
      return producirRespuesta(nota || { error: 'Nota no encontrada' });
    }

    // Por defecto devuelve todas (action=getAll)
    return producirRespuesta(notas);
  } catch (error) {
    return producirRespuesta({ error: error.toString() });
  }
}

/**
 * MANEJADOR DE PETICIONES POST
 * Soporta: action=crear, actualizar, eliminar
 */
function doPost(e) {
  try {
    const datos = JSON.parse(e.postData.contents);
    const action = datos.action;
    let resultado;

    switch (action) {
      case 'crear':
        const nuevoId = crearNota(datos.titulo, datos.contenido, datos.responsable, datos.citas);
        resultado = { success: true, id: nuevoId };
        break;

      case 'actualizar':
        resultado = actualizarNota(datos.id, datos.titulo, datos.contenido, datos.responsable, datos.citas);
        break;

      case 'eliminar':
        resultado = eliminarNota(datos.id);
        break;

      default:
        resultado = { error: 'Acción no válida' };
    }

    return producirRespuesta(resultado);
  } catch (error) {
    return producirRespuesta({ error: error.toString() });
  }
}

// --- FUNCIONES DE LÓGICA DE NEGOCIO ---

function obtenerTodasLasNotas() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  const headers = data[0];
  return data.slice(1).map(row => {
    let obj = {};
    headers.forEach((header, i) => {
      obj[header] = row[i];
    });
    // app(2).js necesita que las citas vengan como string y como array
    obj['citas'] = obj['Citas (IDs)'] ? String(obj['Citas (IDs)']).split(',').map(s => s.trim()).filter(Boolean) : [];
    return obj;
  });
}

function crearNota(titulo, contenido, responsable, citas = []) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const idNota = 'NOTA-' + Utilities.getUuid().substring(0, 8).toUpperCase();
  const fecha = new Date();
  const citasString = Array.isArray(citas) ? citas.join(', ') : citas;
  
  sheet.appendRow([idNota, titulo, contenido, fecha, responsable, citasString]);
  return idNota;
}

function actualizarNota(id, titulo, contenido, responsable, citas = []) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const citasString = Array.isArray(citas) ? citas.join(', ') : citas;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      // Columnas: 0:ID, 1:Título, 2:Contenido, 3:Fecha, 4:Responsable, 5:Citas
      sheet.getRange(i + 1, 2).setValue(titulo);
      sheet.getRange(i + 1, 3).setValue(contenido);
      sheet.getRange(i + 1, 5).setValue(responsable);
      sheet.getRange(i + 1, 6).setValue(citasString);
      return { success: true, id: id };
    }
  }
  return { error: 'Nota no encontrada para actualizar' };
}

function eliminarNota(id) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { success: true, id: id };
    }
  }
  return { error: 'Nota no encontrada para eliminar' };
}

/**
 * Formatea la respuesta JSON para la Web App
 */
function producirRespuesta(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}
