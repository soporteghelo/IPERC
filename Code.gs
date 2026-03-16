const CONFIG = {
  SHEET_ID: '17cxHfwY_xz2Jf9zCgCYmNcGdNS0lvX-ZK1oeiOiCBEg',
  PROGRAM_TAB: 'DATA_PROGRAMA',
  REGISTROS_TAB: 'DATA_REGISTROS',
  USERS_TAB: 'USUARIOS',
  PERSONAL_TAB: 'PERSONAL',
  ROOT_FOLDER_ID: '10Pq6ZkFldvYscycP8F32_M-Sc3pkZu4c',
  ALLOWED_ORIGINS: ['*', 'capacitor://localhost', 'http://localhost', 'http://localhost:8100'],
};

function doGet(e) {
  try {
    const action = ((e && e.parameter && e.parameter.action) || '').toLowerCase();
    if (action === 'usuarios') return doGetUsuarios(e);
    if (action === 'personal') return doGetPersonal(e);
    if (action === 'programaciones') return doGetProgramaciones(e);
    if (action === 'registros') return doGetRegistros(e);
    if (action === 'config') return doGetConfig(e);

    return jsonOutput({ ok: true, service: 'IPERC webhook', ts: new Date().toISOString() });
  } catch (error) {
    return jsonOutput({ ok: false, error: error.message || String(error) });
  }
}

function doGetRegistros(e) {
  var param = (e && e.parameter) ? e.parameter : {};
  var sheetId = param.sheetId || CONFIG.SHEET_ID;
  var registrosTab = (param.registrosTab || CONFIG.REGISTROS_TAB).toUpperCase();
  var programacionId = String(param.programacionId || '').trim();

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(registrosTab);
  if (!sheet) throw new Error('No existe la pestaña: ' + registrosTab);

  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return jsonOutput({ ok: true, registros: [], total: 0 });

  var header = values[0].map(normalizeHeader);
  var rows = values.slice(1);

  var idx = {
    id:             findCol(header, ['registroid']),
    programaIdPadre: findCol(header, ['programaidpadre', 'programacionid']),
    fechaHoraLocal: findCol(header, ['fechahoralocal']),
    trabajador:     findCol(header, ['usuario', 'trabajador']),
    actividad:      findCol(header, ['actividad']),
    guardia:        findCol(header, ['guardia']),
    turno:          findCol(header, ['turno']),
    supervisor:     findCol(header, ['supervisor']),
  };

  var registros = rows
    .filter(function(row) {
      if (!cell(row, idx.id)) return false;
      if (programacionId) return cell(row, idx.programaIdPadre) === programacionId;
      return true;
    })
    .map(function(row) {
      return {
        id:             cell(row, idx.id),
        programacionId: cell(row, idx.programaIdPadre),
        fechaHoraLocal: cell(row, idx.fechaHoraLocal),
        trabajador:     cell(row, idx.trabajador),
        actividad:      cell(row, idx.actividad),
        guardia:        cell(row, idx.guardia),
        turno:          cell(row, idx.turno),
        supervisor:     cell(row, idx.supervisor),
        syncStatus:     'SYNCED',
      };
    });

  return jsonOutput({ ok: true, registros: registros, total: registros.length, fetchedAt: new Date().toISOString() });
}

function doGetConfig(e) {
  var param = (e && e.parameter) ? e.parameter : {};
  var sheetId = param.sheetId || CONFIG.SHEET_ID;
  var configTab = 'CONFIG';

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(configTab);
  if (!sheet) throw new Error('No existe la pestaña CONFIG en el Sheet.');

  var values = sheet.getDataRange().getValues();
  if (!values.length) return jsonOutput({ ok: true, config: {}, fetchedAt: new Date().toISOString() });

  var result = {};
  var numericFields = ['retentionDays', 'syncBatchSize', 'syncRetryMax'];
  var timeFields = ['amStart', 'amEnd', 'pmStart', 'pmEnd'];
  var tz = Session.getScriptTimeZone();

  function formatCellValue(key, raw) {
    if (raw == null || raw === '') return '';
    if (raw instanceof Date) {
      if (timeFields.indexOf(key) >= 0) return Utilities.formatDate(raw, tz, 'HH:mm');
      return Utilities.formatDate(raw, tz, 'yyyy-MM-dd HH:mm:ss');
    }
    if (numericFields.indexOf(key) >= 0) {
      var n = Number(raw);
      return isNaN(n) ? String(raw).trim() : n;
    }
    return String(raw).trim();
  }

  // Detect format:
  // HORIZONTAL → row 1 = field names, row 2 = values  (e.g. amStart | amEnd | ... in columns)
  // VERTICAL   → col A = key, col B = value            (e.g. amStart in A2, 10:00 in B2)
  var isHorizontal = values[0].length > 2;

  if (isHorizontal) {
    // Row 1: headers, Row 2: values
    var headers = values[0];
    var vals = values.length > 1 ? values[1] : [];
    for (var c = 0; c < headers.length; c++) {
      var key = String(headers[c] || '').trim();
      if (!key) continue;
      result[key] = formatCellValue(key, vals[c]);
    }
  } else {
    // Vertical: col A = key, col B = value. Skip header row if first cell is "clave/key/campo"
    var startRow = 0;
    var firstCell = String(values[0][0] || '').toLowerCase().replace(/[^a-z]/g, '');
    if (firstCell === 'clave' || firstCell === 'key' || firstCell === 'campo') startRow = 1;
    for (var i = startRow; i < values.length; i++) {
      var clave = String(values[i][0] || '').trim();
      if (!clave) continue;
      result[clave] = formatCellValue(clave, values[i][1]);
    }
  }

  return jsonOutput({ ok: true, config: result, fetchedAt: new Date().toISOString() });
}

function doGetProgramaciones(e) {
  var param = (e && e.parameter) ? e.parameter : {};
  var sheetId = param.sheetId || CONFIG.SHEET_ID;
  var programTab = (param.programTab || CONFIG.PROGRAM_TAB).toUpperCase();
  var registrosTab = (param.registrosTab || CONFIG.REGISTROS_TAB).toUpperCase();

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(programTab);
  if (!sheet) throw new Error('No existe la pestaña: ' + programTab);

  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return jsonOutput({ ok: true, programaciones: [], total: 0 });

  var header = values[0].map(normalizeHeader);
  var rows = values.slice(1);

  var idx = {
    id:                    findCol(header, ['programaid']),
    fechaHoraProgramacion: findCol(header, ['fechahoraprogramacion']),
    fechaHoraLocal:        findCol(header, ['fechahoralocal']),
    supervisor:            findCol(header, ['supervisor']),
    guardia:               findCol(header, ['guardia']),
    turno:                 findCol(header, ['turno']),
    cantidadProgramada:    findCol(header, ['cantidadprogramada']),
    actividadesTurno:      findCol(header, ['actividadesturno']),
    estado:                findCol(header, ['estado']),
  };

  // Build realizados count map from DATA_REGISTROS
  var realizadosMap = {};
  var regSheet = ss.getSheetByName(registrosTab);
  if (regSheet) {
    var regValues = regSheet.getDataRange().getValues();
    if (regValues.length > 1) {
      var regHeader = regValues[0].map(normalizeHeader);
      var idxPadre = findCol(regHeader, ['programaidpadre', 'programacionid']);
      if (idxPadre >= 0) {
        for (var r = 1; r < regValues.length; r++) {
          var padre = String(regValues[r][idxPadre] || '').trim();
          if (padre) realizadosMap[padre] = (realizadosMap[padre] || 0) + 1;
        }
      }
    }
  }

  var programaciones = rows
    .filter(function(row) { return cell(row, idx.id); })
    .map(function(row) {
      var progId = cell(row, idx.id);
      return {
        programaId:            progId,
        id:                    progId,
        fechaHoraProgramacion: cell(row, idx.fechaHoraProgramacion),
        fechaHoraLocal:        cell(row, idx.fechaHoraLocal),
        supervisor:            cell(row, idx.supervisor),
        guardia:               cell(row, idx.guardia),
        turno:                 cell(row, idx.turno),
        cantidadProgramada:    Number(cell(row, idx.cantidadProgramada)) || 0,
        actividadesTurno:      cell(row, idx.actividadesTurno),
        estado:                cell(row, idx.estado) || 'PROGRAMADO',
        realizadosRemoto:      realizadosMap[progId] || 0,
      };
    });

  return jsonOutput({ ok: true, programaciones: programaciones, total: programaciones.length, fetchedAt: new Date().toISOString() });
}

function doGetUsuarios(e) {
  const param = (e && e.parameter) ? e.parameter : {};
  const sheetId = param.sheetId || CONFIG.SHEET_ID;
  const usersTab = (param.usersTab || CONFIG.USERS_TAB).toUpperCase();

  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName(usersTab);
  if (!sheet) throw new Error('No existe la pestaña de usuarios: ' + usersTab);

  const values = sheet.getDataRange().getValues();
  if (!values.length) return jsonOutput({ ok: true, users: [], total: 0 });

  const header = values[0].map(normalizeHeader);
  const rows = values.slice(1);

  const idx = {
    dni: findCol(header, ['dni']),
    nombre: findCol(header, ['apellidosynombres', 'nombre', 'nombres']),
    contrasena: findCol(header, ['contrasena', 'password', 'clave']),
    estado: findCol(header, ['estado']),
    cargo: findCol(header, ['cargo']),
    area: findCol(header, ['area']),
    guardia: findCol(header, ['guardia']),
    correo: findCol(header, ['correo', 'email']),
    celular: findCol(header, ['celular', 'telefono']),
  };

  const users = rows
    .map((row) => ({
      dni: cell(row, idx.dni),
      nombre: cell(row, idx.nombre),
      contrasena: cell(row, idx.contrasena),
      estado: String(cell(row, idx.estado)).toUpperCase(),
      cargo: cell(row, idx.cargo),
      area: cell(row, idx.area),
      guardia: cell(row, idx.guardia),
      correo: cell(row, idx.correo),
      celular: cell(row, idx.celular),
    }))
    .filter((u) => u.dni && u.contrasena && u.estado === 'ACTIVO');

  return jsonOutput({ ok: true, users, total: users.length, usersTab, fetchedAt: new Date().toISOString() });
}

function doGetPersonal(e) {
  const param = (e && e.parameter) ? e.parameter : {};
  const sheetId = param.sheetId || CONFIG.SHEET_ID;
  const personalTab = (param.personalTab || CONFIG.PERSONAL_TAB).toUpperCase();

  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName(personalTab);
  if (!sheet) throw new Error('No existe la pestaña de personal: ' + personalTab);

  const values = sheet.getDataRange().getValues();
  if (!values.length) return jsonOutput({ ok: true, personal: [], total: 0 });

  const header = values[0].map(normalizeHeader);
  const rows = values.slice(1);

  const idxNombre = findCol(header, ['apellidosynombres', 'nombrecompleto', 'nombre', 'nombres']);
  const idxEstado = findCol(header, ['estado']);

  const personal = rows
    .map((row) => {
      const nombre = cell(row, idxNombre);
      const estado = String(cell(row, idxEstado)).toUpperCase();
      if (!nombre) return '';
      if (idxEstado >= 0 && estado && estado !== 'ACTIVO') return '';
      return nombre;
    })
    .filter(Boolean);

  return jsonOutput({ ok: true, personal: uniqueStrings(personal), total: personal.length, personalTab, fetchedAt: new Date().toISOString() });
}

function doPost(e) {
  try {
    const bodyText = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    const payload = JSON.parse(bodyText);
    const target = resolveTargetConfig(payload.metadata || {});
    const entity = String(payload.entity || 'registro').toLowerCase();

    if (entity === 'programacion') {
      return handleProgramacionPost(payload, target);
    }

    return handleRegistroPost(payload, target);
  } catch (error) {
    return jsonOutput({ ok: false, error: error.message || String(error) });
  }
}

function handleProgramacionPost(payload, target) {
  const programacion = payload.programacion || {};
  validateProgramacion(programacion);

  const sheet = getOrCreateSheet(target.sheetId, target.programTab, getProgramHeaders());
  const programaId = String(programacion.id || '').trim();

  const rowData = buildProgramRow(programacion, payload.metadata || {});
  const rowNumber = upsertById(sheet, 'programaId', programaId, rowData);

  return jsonOutput({
    ok: true,
    entity: 'programacion',
    programaId,
    rowNumber,
    tab: target.programTab,
  });
}

function handleRegistroPost(payload, target) {
  const record = payload.record || {};
  validateRegistro(record);

  const usedDate = record.createdAt ? new Date(record.createdAt) : new Date();
  const sheet = getOrCreateSheet(target.sheetId, target.registrosTab, getRegistrosHeaders());

  const existing = getExistingRegistroMeta(sheet, record.id);

  let imageResult;
  let folderTree = null;

  if (existing.exists && existing.driveFileId) {
    imageResult = {
      fileId: existing.driveFileId,
      fileUrl: existing.driveFileUrl,
      folderPath: existing.driveFolderPath,
    };
  } else {
    folderTree = getStructuredFolder(record.supervisor, usedDate, target.driveFolderId);
    imageResult = saveImage(record, folderTree.daySupervisorFolder, record.programacionId);
  }

  const rowData = buildRegistroRow(record, imageResult, payload.metadata || {});
  const rowNumber = upsertById(sheet, 'registroId', record.id, rowData);

  return jsonOutput({
    ok: true,
    entity: 'registro',
    recordId: record.id,
    rowNumber,
    fileId: imageResult.fileId,
    fileUrl: imageResult.fileUrl,
    folders: folderTree ? folderTree.pathInfo : null,
    idempotentReuse: !!(existing.exists && existing.driveFileId),
    tab: target.registrosTab,
  });
}

function resolveTargetConfig(metadata) {
  const local = metadata.localConfig || {};
  return {
    sheetId: local.sheetId || CONFIG.SHEET_ID,
    driveFolderId: local.driveFolderId || CONFIG.ROOT_FOLDER_ID,
    programTab: local.programTab || CONFIG.PROGRAM_TAB,
    registrosTab: local.registrosTab || CONFIG.REGISTROS_TAB,
    usersTab: local.usersTab || CONFIG.USERS_TAB,
    personalTab: local.personalTab || CONFIG.PERSONAL_TAB,
  };
}

function validateProgramacion(programacion) {
  const required = ['id', 'guardia', 'turno', 'cantidadProgramada'];
  required.forEach((field) => {
    if (programacion[field] === undefined || programacion[field] === null || programacion[field] === '') {
      throw new Error('Campo requerido faltante en programación: ' + field);
    }
  });
}

function validateRegistro(record) {
  const required = ['id', 'programacionId', 'supervisor', 'trabajador', 'bloqueoProgramadoId', 'imagenBase64'];
  required.forEach((field) => {
    if (!record[field]) throw new Error('Campo requerido faltante en registro: ' + field);
  });
}

function getProgramHeaders() {
  return [
    'programaId',
    'fechaHoraProgramacion',
    'fechaHoraLocal',
    'supervisor',
    'guardia',
    'turno',
    'cantidadProgramada',
    'actividadesTurno',
    'estado',
  ];
}

function getRegistrosHeaders() {
  return [
    'registroId',
    'programaIdPadre',
    'createdAt',
    'fechaHoraLocal',
    'guardia',
    'turno',
    'supervisor',
    'usuario',
    'nombreUsuario',
    'guardia',
    'turno',
    'imagenMimeType',
    'imagenKB',
    'cfgDriveFolderId',
    'cfgProgramTab',
    'cfgRegistrosTab',
    'source',
    'syncedAt',
  ];
}

function buildProgramRow(programacion, metadata) {
  return [
    programacion.id || '',
    programacion.fechaHoraProgramacion || '',
    programacion.fechaHoraLocal || '',
    programacion.supervisor || '',
    programacion.guardia || '',
    programacion.turno || '',
    programacion.cantidadProgramada || '',
    programacion.actividadesTurno || '',
    programacion.estado || 'PROGRAMADO',
  ];
}

function buildRegistroRow(record, imageResult, metadata) {
  return [
    record.id || '',
    record.programacionId || '',
    record.createdAt || '',
    record.fechaHoraLocal || '',
    record.guardia || '',
    record.turno || '',
    record.supervisor || '',
    record.trabajador || '',
    record.trabajadorOrigen || '',
    record.bloqueoProgramadoId || '',
    record.actividad || '',
    imageResult.fileId,
    imageResult.fileUrl,
  ];
}

function getOrCreateSheet(sheetId, sheetTab, headers) {
  const ss = SpreadsheetApp.openById(sheetId);
  let sheet = ss.getSheetByName(sheetTab);
  if (!sheet) sheet = ss.insertSheet(sheetTab);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }

  return sheet;
}

function upsertById(sheet, idHeaderName, idValue, rowData) {
  const values = sheet.getDataRange().getValues();
  if (!values.length) {
    sheet.appendRow(rowData);
    return sheet.getLastRow();
  }

  const headers = values[0].map(normalizeHeader);
  const idIdx = headers.indexOf(normalizeHeader(idHeaderName));
  if (idIdx < 0) throw new Error('No existe cabecera ID: ' + idHeaderName);

  for (var row = 1; row < values.length; row += 1) {
    if (String(values[row][idIdx]) === String(idValue)) {
      sheet.getRange(row + 1, 1, 1, rowData.length).setValues([rowData]);
      return row + 1;
    }
  }

  sheet.appendRow(rowData);
  return sheet.getLastRow();
}

function getExistingRegistroMeta(sheet, recordId) {
  const values = sheet.getDataRange().getValues();
  if (!values.length) return { exists: false };

  const headers = values[0].map(normalizeHeader);
  const idxRecordId = headers.indexOf('registroid');
  if (idxRecordId < 0) return { exists: false };

  const idxFileId = headers.indexOf('drivefileid');
  const idxFileUrl = headers.indexOf('drivefileurl');
  const idxFolderPath = headers.indexOf('drivefolderpath');

  for (var row = 1; row < values.length; row += 1) {
    if (String(values[row][idxRecordId]) === String(recordId)) {
      return {
        exists: true,
        rowNumber: row + 1,
        driveFileId: idxFileId >= 0 ? String(values[row][idxFileId] || '') : '',
        driveFileUrl: idxFileUrl >= 0 ? String(values[row][idxFileUrl] || '') : '',
        driveFolderPath: idxFolderPath >= 0 ? String(values[row][idxFolderPath] || '') : '',
      };
    }
  }

  return { exists: false };
}

function saveImage(record, parentFolder, programacionId) {
  const base64 = stripDataUrlPrefix(record.imagenBase64);
  const bytes = Utilities.base64Decode(base64);
  const safeProgramCode = getProgramCodePrefix(programacionId);
  const safeSupervisor = sanitizeForPath(record.supervisor || 'NO_SUPERVISOR');
  const safeBloqueo = sanitizeForPath(record.bloqueoProgramadoId || 'NO_BLOQUEO');
  const ts = formatDateToken(new Date(record.createdAt || new Date()));

  const fileName = [
    safeProgramCode,
    safeBloqueo,
    safeSupervisor,
    ts,
    record.id
  ].join('_') + '.jpg';

  const blob = Utilities.newBlob(bytes, 'image/jpeg', fileName);
  const file = parentFolder.createFile(blob);

  return {
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    folderPath: parentFolder.getName(),
  };
}

function getProgramCodePrefix(programacionId) {
  const raw = String(programacionId || '').trim();
  if (!raw) return 'PROG';
  const split = raw.split(/[-_]/);
  const first = split[0] || raw;
  const cleaned = sanitizeForPath(first);
  return (cleaned || 'PROG').substring(0, 12);
}

function getStructuredFolder(supervisor, dateObj, rootFolderId) {
  const root = DriveApp.getFolderById(rootFolderId);

  const year = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'yyyy');
  const month = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'MM');
  const dayCode = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'dd_MM_yyyy');
  const supCode = sanitizeForPath(supervisor || 'NO_SUPERVISOR');

  const yearFolder = getOrCreateFolder(root, year);
  const monthFolder = getOrCreateFolder(yearFolder, month);
  const dayFolder = getOrCreateFolder(monthFolder, dayCode);
  const daySupervisorFolder = getOrCreateFolder(dayFolder, supCode);

  return {
    daySupervisorFolder,
    pathInfo: {
      year,
      month,
      day: dayCode,
      supervisor: supCode,
    }
  };
}

function getOrCreateFolder(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function stripDataUrlPrefix(dataUrl) {
  return String(dataUrl || '').replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
}

function sanitizeForPath(text) {
  return String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase() || 'SIN_DATO';
}

function formatDateToken(dateObj) {
  return Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
}

function normalizeHeader(text) {
  return String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
}

function findCol(headerRow, aliases) {
  for (var i = 0; i < aliases.length; i += 1) {
    var pos = headerRow.indexOf(aliases[i]);
    if (pos >= 0) return pos;
  }
  return -1;
}

function cell(row, idx) {
  if (idx < 0) return '';
  return String(row[idx] == null ? '' : row[idx]).trim();
}

function uniqueStrings(list) {
  var map = {};
  var out = [];
  for (var i = 0; i < list.length; i += 1) {
    var value = String(list[i] || '').trim();
    if (!value) continue;
    if (!map[value]) {
      map[value] = true;
      out.push(value);
    }
  }
  return out;
}

function jsonOutput(obj) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);

  if (typeof output.setHeader === 'function') {
    output.setHeader('Access-Control-Allow-Origin', '*');
    output.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    output.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  return output;
}
