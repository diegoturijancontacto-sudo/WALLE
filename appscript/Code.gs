// ============================================================
//  Blog de Notas – Google Apps Script Backend
//  Despliega este archivo como "Web App" (Ejecutar como: yo,
//  Acceso: Cualquiera) y pega la URL en la configuración del
//  sitio para conectar el frontend a Google Sheets.
// ============================================================

const SHEET_NAME = 'BlogDeNotas';

// ------------------------------------------------------------
// Punto de entrada GET  →  ?action=getAll | getById&id=NOTA-XX
// ------------------------------------------------------------
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'getAll';
  let result;

  try {
    switch (action) {
      case 'getAll':
        result = obtenerTodasLasNotas();
        break;
      case 'getById':
        result = obtenerNotaPorId(e.parameter.id);
        break;
      default:
        result = { error: 'Acción GET no reconocida: ' + action };
    }
  } catch (err) {
    result = { error: err.toString() };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------
// Punto de entrada POST  →  { action, ...campos }
// ------------------------------------------------------------
function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return _jsonResponse({ error: 'JSON inválido: ' + err.toString() });
  }

  const action = data.action;
  let result;

  try {
    switch (action) {
      case 'crear':
        result = crearNota(data.titulo, data.contenido, data.responsable, data.citas);
        break;
      case 'actualizar':
        result = actualizarNota(data.id, data.titulo, data.contenido, data.responsable, data.citas);
        break;
      case 'eliminar':
        result = eliminarNota(data.id);
        break;
      default:
        result = { error: 'Acción POST no reconocida: ' + action };
    }
  } catch (err) {
    result = { error: err.toString() };
  }

  return _jsonResponse(result);
}

// ------------------------------------------------------------
// Helpers internos
// ------------------------------------------------------------
function _getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    configurarHoja();
    sheet = ss.getSheetByName(SHEET_NAME);
  }
  return sheet;
}

function _jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function _rowToNota(headers, row) {
  const nota = {};
  for (let j = 0; j < headers.length; j++) {
    nota[headers[j]] = row[j];
  }
  // Normalizar citas como array
  const citasRaw = nota['Citas (IDs)'];
  nota.citas = citasRaw
    ? String(citasRaw).split(',').map(s => s.trim()).filter(Boolean)
    : [];
  return nota;
}

// ------------------------------------------------------------
// Configuración inicial de la hoja
// ------------------------------------------------------------
function configurarHoja() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    const headers = ['ID_Nota', 'Título', 'Contenido', 'Fecha de Creación', 'Responsable', 'Citas (IDs)'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#f3f3f3');
    sheet.setFrozenRows(1);
    Logger.log('Hoja configurada con éxito.');
  } else {
    Logger.log('La hoja ya existe.');
  }
}

// ------------------------------------------------------------
// CRUD
// ------------------------------------------------------------

/**
 * Crea una nueva nota y devuelve { success: true, id, nota }.
 */
function crearNota(titulo, contenido, responsable, citas) {
  if (!citas) citas = [];
  const sheet = _getSheet();
  const idNota = 'NOTA-' + Utilities.getUuid().substring(0, 8).toUpperCase();
  const fechaCreacion = new Date();
  const citasString = Array.isArray(citas) ? citas.join(', ') : String(citas);

  sheet.appendRow([idNota, titulo, contenido, fechaCreacion, responsable, citasString]);
  Logger.log('Nota creada con ID: ' + idNota);

  return {
    success: true,
    id: idNota,
    nota: {
      ID_Nota: idNota,
      Título: titulo,
      Contenido: contenido,
      'Fecha de Creación': fechaCreacion.toISOString(),
      Responsable: responsable,
      'Citas (IDs)': citasString,
      citas: citas
    }
  };
}

/**
 * Actualiza una nota existente.
 */
function actualizarNota(id, titulo, contenido, responsable, citas) {
  if (!citas) citas = [];
  const sheet = _getSheet();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      const citasString = Array.isArray(citas) ? citas.join(', ') : String(citas);
      sheet.getRange(i + 1, 2).setValue(titulo);
      sheet.getRange(i + 1, 3).setValue(contenido);
      sheet.getRange(i + 1, 5).setValue(responsable);
      sheet.getRange(i + 1, 6).setValue(citasString);
      return { success: true, id };
    }
  }
  return { error: 'Nota no encontrada: ' + id };
}

/**
 * Elimina una nota por ID.
 */
function eliminarNota(id) {
  const sheet = _getSheet();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { success: true, id };
    }
  }
  return { error: 'Nota no encontrada: ' + id };
}

/**
 * Obtiene todas las notas como array de objetos JSON.
 */
function obtenerTodasLasNotas() {
  const sheet = _getSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0];
  const notas = [];
  for (let i = 1; i < data.length; i++) {
    const nota = _rowToNota(headers, data[i]);
    // Serializar fecha a ISO string
    if (nota['Fecha de Creación'] instanceof Date) {
      nota['Fecha de Creación'] = nota['Fecha de Creación'].toISOString();
    }
    notas.push(nota);
  }
  return notas;
}

/**
 * Obtiene una nota por su ID.
 */
function obtenerNotaPorId(id) {
  const sheet = _getSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null;

  const headers = data[0];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      const nota = _rowToNota(headers, data[i]);
      if (nota['Fecha de Creación'] instanceof Date) {
        nota['Fecha de Creación'] = nota['Fecha de Creación'].toISOString();
      }
      return nota;
    }
  }
  return null;
}

// ------------------------------------------------------------
// Función de prueba manual (ejecutar desde el editor de Apps Script)
// ------------------------------------------------------------
function probarSistema() {
  configurarHoja();

  const idNota1 = crearNota(
    'Reunión de Planificación',
    '<p>Definimos los <strong>objetivos del trimestre</strong>.</p>',
    'Ana López',
    []
  ).id;

  const idNota2 = crearNota(
    'Actualización de Objetivos',
    '<p>Revisamos lo acordado previamente y cambiamos las fechas.</p>',
    'Carlos Ruiz',
    [idNota1]
  ).id;

  crearNota(
    'Informe Final',
    '<p>Resumen de resultados basado en reuniones anteriores.</p>',
    'María García',
    [idNota1, idNota2]
  );

  Logger.log('Sistema probado con éxito.');
  Logger.log(JSON.stringify(obtenerTodasLasNotas(), null, 2));
}
