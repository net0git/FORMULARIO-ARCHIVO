/**
 * ============================================================================
 * SISTEMA DE GESTIÓN DEL ARCHIVO - PODER JUDICIAL
 * Backend Serverless en Google Apps Script (Google Sheets + Drive + Gmail)
 * ============================================================================
 *
 * ARQUITECTURA SEPARADA (INTERNET + RED LOCAL):
 * - CLIENT-FORMULARIO (Internet): Usa esta URL desde "public/config.json" únicamente
 *   para registrar nuevas solicitudes ("crearSolicitud").
 * - CLIENT-ATENCION (Red Local): Usa esta misma URL desde "Configuración -> Conectar Google Sheet"
 *   para autenticar usuarios ("login"), atender solicitudes y administrar Personal.
 *
 * INSTRUCCIONES RÁPIDAS DE INSTALACIÓN:
 * 1. Abre una Hoja de Cálculo de Google (Google Sheets) nueva o existente.
 * 2. Ve al menú: Extensiones -> Apps Script.
 * 3. Borra cualquier código en "Código.gs" y pega TODO este archivo.
 * 4. Haz clic en el ícono de Guardar (💾) y ejecuta una vez la función "inicializarHojas"
 *    para otorgar permisos de Google Sheets, Google Drive y Envío de Correo.
 * 5. Haz clic en "Implementar" -> "Nueva implementación":
 *    - Tipo: "Aplicación web"
 *    - Ejecutar como: "Yo"
 *    - Quién tiene acceso: "Cualquier persona"
 * 6. Copia la URL de la Aplicación Web generada (termina en /exec):
 *    - Pégala en "CLIENT-FORMULARIO/public/config.json" antes de subir el formulario a Internet.
 *    - Pégala en "CLIENT-ATENCION" entrando con admin1 / 123456 en "Configuración -> Conectar Google Sheet".
 */

const FOLDER_NAME_ROOT = 'SISTEMA_GESTION_ARCHIVO_PJ';

function inicializarHojas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Hoja Solicitudes (Incluye Razón y los 3 campos de Expediente: Número, Año, Código Completo + Juzgado/Instancia)
  const headersSol = [
    'id_solicitud',               // 0 (Col 1 - A)
    'nro_solicitud',              // 1 (Col 2 - B)
    'estado',                     // 2 (Col 3 - C)
    'corte',                      // 3 (Col 4 - D)
    'tipo_usuario',               // 4 (Col 5 - E)
    'tipo_solicitud',             // 5 (Col 6 - F)
    'razon_solicitud',            // 6 (Col 7 - G)
    'fecha_inicio',               // 7 (Col 8 - H)
    'fecha_final',                // 8 (Col 9 - I)
    'tiempo_transcurrido',        // 9 (Col 10 - J)
    'dni',                        // 10 (Col 11 - K)
    'apellidos',                  // 11 (Col 12 - L)
    'nombres',                    // 12 (Col 13 - M)
    'email',                      // 13 (Col 14 - N)
    'celular',                    // 14 (Col 15 - O)
    'domicilio_procesal',         // 15 (Col 16 - P)
    'nro_expediente',             // 16 (Col 17 - Q)
    'numero_expediente_corto',    // 17 (Col 18 - R)
    'anio_expediente',            // 18 (Col 19 - S)
    'codigo_completo_expediente', // 19 (Col 20 - T)
    'demandante',                 // 20 (Col 21 - U)
    'demandado',                  // 21 (Col 22 - V)
    'materia_delito',             // 22 (Col 23 - W)
    'juzgado_instancia',          // 23 (Col 24 - X)
    'secretario_remitente',       // 24 (Col 25 - Y)
    'fecha_envio_archivo',        // 25 (Col 26 - Z)
    'juzgado_remitir',            // 26 (Col 27 - AA)
    'motivo_tramite',             // 27 (Col 28 - AB)
    'ubicacion',                  // 28 (Col 29 - AC)
    'anaquel',                    // 29 (Col 30 - AD)
    'fila',                       // 30 (Col 31 - AE)
    'columna',                    // 31 (Col 32 - AF)
    'paquete',                    // 32 (Col 33 - AG)
    'documentos_json',            // 33 (Col 34 - AH)
    'carpeta_drive_url'           // 34 (Col 35 - AI)
  ];

  let sheetSol = ss.getSheetByName('Solicitudes');
  if (!sheetSol) {
    sheetSol = ss.insertSheet('Solicitudes');
    sheetSol.appendRow(headersSol);
    sheetSol.getRange(1, 1, 1, headersSol.length)
      .setBackground('#7b1e22')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    sheetSol.setFrozenRows(1);
  } else {
    // Si la hoja Solicitudes ya existía con las cabeceras antiguas, actualizar automáticamente la fila 1
    const primeraFila = sheetSol.getRange(1, 1, 1, headersSol.length).getValues()[0];
    if (String(primeraFila[6] || '') !== 'razon_solicitud' || String(primeraFila[17] || '') !== 'numero_expediente_corto') {
      sheetSol.getRange(1, 1, 1, headersSol.length)
        .setValues([headersSol])
        .setBackground('#7b1e22')
        .setFontColor('#ffffff')
        .setFontWeight('bold');
      sheetSol.setFrozenRows(1);
    }
  }

  // 2. Hoja Seguimiento
  const headersSeg = [
    'id_evento',
    'id_solicitud',
    'accion',
    'usuario',
    'trabajador',
    'descripcion',
    'fecha',
    'documento_json'
  ];
  let sheetSeg = ss.getSheetByName('Seguimiento');
  if (!sheetSeg) {
    sheetSeg = ss.insertSheet('Seguimiento');
    sheetSeg.appendRow(headersSeg);
    sheetSeg.getRange(1, 1, 1, headersSeg.length)
      .setBackground('#7b1e22')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    sheetSeg.setFrozenRows(1);
  } else {
    const primeraFilaSeg = sheetSeg.getRange(1, 1, 1, headersSeg.length).getValues()[0];
    if (String(primeraFilaSeg[7] || '') !== 'documento_json') {
      sheetSeg.getRange(1, 1, 1, headersSeg.length)
        .setValues([headersSeg])
        .setBackground('#7b1e22')
        .setFontColor('#ffffff')
        .setFontWeight('bold');
    }
  }

  // 3. Hoja Usuarios (Módulo Configuración -> Personal)
  const headersUsr = [
    'id_usuario',      // 0
    'usuario',         // 1
    'password',        // 2
    'nombre_completo', // 3
    'dni',             // 4
    'email',           // 5
    'corte',           // 6
    'rol',             // 7
    'activo'           // 8
  ];
  let sheetUsr = ss.getSheetByName('Usuarios');
  if (!sheetUsr) {
    sheetUsr = ss.insertSheet('Usuarios');
    sheetUsr.appendRow(headersUsr);
    sheetUsr.getRange(1, 1, 1, headersUsr.length)
      .setBackground('#7b1e22')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    sheetUsr.setFrozenRows(1);

    // Usuario administrador inicial por defecto
    sheetUsr.appendRow([
      1,
      'admin1',
      "'123456",
      'ADMINISTRADOR LA LIBERTAD',
      "'72677832",
      'dfa.diego.flores@gmail.com',
      'LA LIBERTAD',
      'ADMINISTRADOR',
      'SI'
    ]);
  } else {
    const primeraFilaUsr = sheetUsr.getRange(1, 1, 1, headersUsr.length).getValues()[0];
    if (String(primeraFilaUsr[0] || '') !== 'id_usuario') {
      sheetUsr.getRange(1, 1, 1, headersUsr.length)
        .setValues([headersUsr])
        .setBackground('#7b1e22')
        .setFontColor('#ffffff')
        .setFontWeight('bold');
    }
    // Si la fila 2 tenía el formato antiguo de 6 columnas (donde la columna A era 'admin1' en vez del ID numérico 1), migrarla a las 9 columnas
    if (sheetUsr.getLastRow() >= 2) {
      const fila2 = sheetUsr.getRange(2, 1, 1, 9).getValues()[0];
      if (isNaN(Number(fila2[0])) && String(fila2[0] || '').trim() !== '') {
        sheetUsr.getRange(2, 1, 1, 9).setValues([[
          1,
          String(fila2[0] || 'admin1'),
          "'" + String(fila2[1] || '123456'),
          String(fila2[2] || 'ADMINISTRADOR LA LIBERTAD'),
          "'72677832",
          'dfa.diego.flores@gmail.com',
          String(fila2[3] || 'LA LIBERTAD'),
          String(fila2[4] || 'ADMINISTRADOR'),
          String(fila2[5] || 'SI')
        ]]);
      }
    }
  }

  // 4. Hoja Servicios (Registro de Servicio y Precio que alimenta el Formulario Público)
  let sheetServ = ss.getSheetByName('Servicios');
  if (!sheetServ) {
    sheetServ = ss.insertSheet('Servicios');
    const headersServ = [
      'id_servicio', // 0 (Col 1)
      'servicio',    // 1 (Col 2)
      'precio',      // 2 (Col 3)
      'activo'       // 3 (Col 4: SI / NO)
    ];
    sheetServ.appendRow(headersServ);
    sheetServ.getRange(1, 1, 1, headersServ.length)
      .setBackground('#7b1e22')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    sheetServ.setFrozenRows(1);

    const serviciosIniciales = [
      [1, 'Desarchivamiento', '30.60', 'SI'],
      [2, 'Búsqueda y lectura', '17.30', 'SI'],
      [3, 'Copias certificadas (por cinco folios)', '8.60', 'SI'],
      [4, 'Copias simples (por cinco folios)', '4.00', 'SI'],
      [5, 'Devolución de anexos', '36.30', 'SI'],
      [6, 'Copias de exp. para estudios', '150.40', 'SI'],
      [7, 'Expedición de constancia de no ubicación', '38.50', 'SI']
    ];
    for (let i = 0; i < serviciosIniciales.length; i++) {
      sheetServ.appendRow(serviciosIniciales[i]);
    }
  }

  // Asegurar carpeta raíz en Google Drive
  obtenerOCrearCarpetaRaiz();
  return { ok: true, message: 'Hojas (Solicitudes, Seguimiento, Usuarios, Servicios) y carpeta de Google Drive inicializadas correctamente.' };
}

function obtenerOCrearCarpetaRaiz() {
  const folders = DriveApp.getFoldersByName(FOLDER_NAME_ROOT);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(FOLDER_NAME_ROOT);
}

function guardarArchivosEnDrive(nroSolicitud, dni, documentos) {
  if (!documentos || !documentos.length) {
    return { documentosGuardados: [], folderUrl: '' };
  }
  const rootFolder = obtenerOCrearCarpetaRaiz();
  const subFolderName = 'SOL_' + nroSolicitud + '_DNI_' + (dni || 'SINDNI');
  let subFolder;
  const existing = rootFolder.getFoldersByName(subFolderName);
  if (existing.hasNext()) {
    subFolder = existing.next();
  } else {
    subFolder = rootFolder.createFolder(subFolderName);
  }

  const guardados = [];
  for (let i = 0; i < documentos.length; i++) {
    const doc = documentos[i];
    if (doc.base64Data) {
      const parts = doc.base64Data.split(',');
      const rawBase64 = parts.length > 1 ? parts[1] : parts[0];
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mimeType = doc.mimeType || (mimeMatch ? mimeMatch[1] : 'application/pdf');
      const bytes = Utilities.base64Decode(rawBase64);
      const blob = Utilities.newBlob(bytes, mimeType, doc.nombreArchivo || ('documento_' + (i + 1)));
      const file = subFolder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      guardados.push({
        id: doc.id || (i + 1),
        nombreArchivo: doc.nombreArchivo,
        descripcion: doc.descripcion,
        tipo: doc.tipo || 'ANEXO',
        mimeType: mimeType,
        url: file.getUrl(),
        downloadUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId()
      });
    } else {
      guardados.push(doc);
    }
  }

  return {
    documentosGuardados: guardados,
    folderUrl: subFolder.getUrl()
  };
}

/**
 * Devuelve el contenido (base64) de archivos de Drive guardados por el sistema,
 * para poder unir los PDF de DOC de eventos en el visor sin problemas de CORS.
 * Solo se permiten archivos ubicados dentro de la carpeta raíz del sistema.
 */
function obtenerArchivosBase64(fileIds) {
  const resultado = [];
  const root = obtenerOCrearCarpetaRaiz();
  const rootId = root.getId();
  (fileIds || []).forEach(function (id) {
    try {
      const file = DriveApp.getFileById(id);
      let permitido = false;
      const padres = file.getParents();
      while (padres.hasNext() && !permitido) {
        const p = padres.next();
        if (p.getId() === rootId) {
          permitido = true;
        } else {
          const abuelos = p.getParents();
          while (abuelos.hasNext()) {
            if (abuelos.next().getId() === rootId) { permitido = true; break; }
          }
        }
      }
      if (!permitido) {
        resultado.push({ id: id, error: 'Archivo fuera de la carpeta del sistema' });
        return;
      }
      const blob = file.getBlob();
      resultado.push({
        id: id,
        mimeType: blob.getContentType(),
        base64Data: Utilities.base64Encode(blob.getBytes())
      });
    } catch (err) {
      resultado.push({ id: id, error: err.toString() });
    }
  });
  return { ok: true, archivos: resultado };
}

function doGet(e) {
  try {
    inicializarHojas();
    const servs = obtenerTodosLosServicios();
    // Por seguridad, las peticiones GET públicas solo devuelven el catálogo de Servicios (costos de trámites),
    // nunca la lista de Solicitudes ni Usuarios.
    return respuestaJson({
      ok: true,
      status: 'API Sistema de Gestión del Archivo Activa',
      servicios: servs,
      tramites: servs
    });
  } catch (err) {
    return respuestaJson({ ok: false, error: err.toString() });
  }
}

function doPost(e) {
  try {
    inicializarHojas();
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    switch (action) {
      case 'listarSolicitudes':
        return respuestaJson({
          ok: true,
          data: obtenerTodasLasSolicitudes(),
          usuarios: obtenerTodosLosUsuarios(),
          servicios: obtenerTodosLosServicios()
        });

      case 'listarServicios':
      case 'listarTramites':
        return respuestaJson({
          ok: true,
          servicios: obtenerTodosLosServicios()
        });

      case 'crearSolicitud':
        return respuestaJson(crearSolicitud(payload.solicitud));

      case 'cambiarEstado':
        return respuestaJson(cambiarEstadoSolicitud(payload));

      case 'agregarSeguimiento':
        return respuestaJson(agregarEventoSeguimiento(payload));

      case 'actualizarUbicacion':
        return respuestaJson(actualizarUbicacionSolicitud(payload));

      case 'enviarCorreo':
        return respuestaJson(enviarCorreoSolicitante(payload));

      case 'obtenerArchivosBase64':
        return respuestaJson(obtenerArchivosBase64(payload.fileIds));

      case 'listarUsuarios':
        return respuestaJson({ ok: true, usuarios: obtenerTodosLosUsuarios() });

      case 'guardarUsuario':
        return respuestaJson(guardarOActualizarUsuario(payload.usuario));

      case 'cambiarEstadoUsuario':
        return respuestaJson(cambiarEstadoActivoUsuarioEnSheet(payload.idUsuario));

      case 'eliminarUsuario':
        return respuestaJson(eliminarUsuarioEnSheet(payload.idUsuario));

      case 'login':
        return respuestaJson(validarLogin(payload.usuario, payload.password));

      case 'cambiarClave':
        return respuestaJson(cambiarClaveUsuario(payload.usuario, payload.nuevaClave));

      default:
        return respuestaJson({ ok: false, error: 'Acción no reconocida: ' + action });
    }
  } catch (err) {
    return respuestaJson({ ok: false, error: err.toString() });
  }
}

function obtenerTodasLasSolicitudes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetSol = ss.getSheetByName('Solicitudes');
  const sheetSeg = ss.getSheetByName('Seguimiento');

  const rowsSol = sheetSol.getDataRange().getValues();
  const rowsSeg = sheetSeg.getDataRange().getValues();

  const eventosPorSolicitud = {};
  for (let i = 1; i < rowsSeg.length; i++) {
    const r = rowsSeg[i];
    const idSol = String(r[1]);
    if (!eventosPorSolicitud[idSol]) {
      eventosPorSolicitud[idSol] = [];
    }
    let docEvento = null;
    try {
      if (r[7]) {
        docEvento = JSON.parse(String(r[7]));
      }
    } catch (e) {
      docEvento = null;
    }
    eventosPorSolicitud[idSol].push({
      idEvento: Number(r[0]),
      idSolicitud: Number(r[1]),
      accion: String(r[2] || ''),
      usuario: String(r[3] || ''),
      trabajador: String(r[4] || ''),
      descripcion: String(r[5] || ''),
      fecha: formatearValorFecha(r[6]),
      documento: docEvento
    });
  }

  const solicitudes = [];
  for (let i = 1; i < rowsSol.length; i++) {
    const r = rowsSol[i];
    if (!r[0]) continue;
    let docs = [];
    try {
      docs = r[33] ? JSON.parse(r[33]) : [];
    } catch (e) {
      docs = [];
    }
    const idSol = Number(r[0]);
    solicitudes.push({
      idSolicitud: idSol,
      nroSolicitud: Number(r[1]),
      estado: String(r[2] || 'PENDIENTE'),
      corte: String(r[3] || ''),
      tipoUsuario: String(r[4] || ''),
      tipoSolicitud: String(r[5] || ''),
      razonSolicitud: String(r[6] || ''),
      fechaInicio: formatearValorFecha(r[7]),
      fechaFinal: formatearValorFecha(r[8]),
      tiempoTranscurrido: String(r[9] || ''),
      dni: String(r[10] || ''),
      apellidos: String(r[11] || ''),
      nombres: String(r[12] || ''),
      email: String(r[13] || ''),
      celular: String(r[14] || ''),
      domicilioProcesal: String(r[15] || ''),
      nroExpediente: String(r[16] || ''),
      numeroExpedienteCorto: String(r[17] || ''),
      anioExpediente: String(r[18] || ''),
      codigoCompletoExpediente: String(r[19] || ''),
      demandante: String(r[20] || ''),
      demandado: String(r[21] || ''),
      materiaDelito: String(r[22] || ''),
      juzgadoEmisor: String(r[23] || ''),
      secretarioRemitente: String(r[24] || ''),
      fechaEnvioArchivo: formatearValorFecha(r[25]),
      juzgadoRemitir: String(r[26] || ''),
      motivoTramite: String(r[27] || ''),
      ubicacion: String(r[28] || ''),
      anaquel: String(r[29] || ''),
      fila: String(r[30] || ''),
      columna: String(r[31] || ''),
      paquete: String(r[32] || ''),
      documentos: docs,
      carpetaDriveUrl: String(r[34] || ''),
      eventos: eventosPorSolicitud[String(idSol)] || []
    });
  }

  return solicitudes.reverse();
}

function crearSolicitud(sol) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetSol = ss.getSheetByName('Solicitudes');
  const lastRow = sheetSol.getLastRow();
  const nextId = lastRow; // 1-based considerando fila de encabezado
  const nroSolicitud = nextId;

  const resultadoDrive = guardarArchivosEnDrive(nroSolicitud, sol.dni, sol.documentos || []);

  const fechaRegistro = formatearValorFecha(sol.fechaInicio) || formatearFechaActual();
  const nuevaFila = [
    nextId,
    nroSolicitud,
    sol.estado || 'PENDIENTE',
    sol.corte || '',
    sol.tipoUsuario || '',
    sol.tipoSolicitud || '',
    sol.razonSolicitud || sol.motivoTramite || '',
    "'" + fechaRegistro,
    '',
    '',
    "'" + (sol.dni || ''),
    sol.apellidos || '',
    sol.nombres || '',
    sol.email || '',
    "'" + (sol.celular || ''),
    sol.domicilioProcesal || '',
    sol.nroExpediente || '',
    sol.numeroExpedienteCorto || '',
    sol.anioExpediente || '',
    sol.codigoCompletoExpediente || '',
    sol.demandante || '',
    sol.demandado || '',
    sol.materiaDelito || '',
    sol.juzgadoEmisor || '',
    sol.secretarioRemitente || '',
    "'" + (formatearValorFecha(sol.fechaEnvioArchivo) || fechaRegistro),
    sol.juzgadoRemitir || '',
    sol.razonSolicitud || sol.motivoTramite || sol.tipoSolicitud || '',
    sol.ubicacion || '',
    sol.anaquel || '',
    sol.fila || '',
    sol.columna || '',
    sol.paquete || '',
    JSON.stringify(resultadoDrive.documentosGuardados),
    resultadoDrive.folderUrl
  ];

  sheetSol.appendRow(nuevaFila);

  agregarEventoSeguimiento({
    idSolicitud: nextId,
    nroSolicitud: nroSolicitud,
    dni: sol.dni || 'EXTERNO',
    accion: 'REGISTRO DE SOLICITUD',
    usuario: sol.dni || 'EXTERNO',
    trabajador: (sol.apellidos + ' ' + sol.nombres).trim(),
    descripcion: 'SOLICITUD REGISTRADA VÍA FORMULARIO WEB - TRÁMITE: ' + (sol.tipoSolicitud || ''),
    fecha: sol.fechaInicio || formatearFechaActual(),
    documento: sol.documentoSolicitud || null
  });

  return {
    ok: true,
    idSolicitud: nextId,
    nroSolicitud: nroSolicitud,
    documentos: resultadoDrive.documentosGuardados,
    carpetaDriveUrl: resultadoDrive.folderUrl
  };
}

function cambiarEstadoSolicitud(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetSol = ss.getSheetByName('Solicitudes');
  const rows = sheetSol.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (Number(rows[i][0]) === Number(payload.idSolicitud)) {
      const rowIndex = i + 1;
      sheetSol.getRange(rowIndex, 3).setValue(payload.nuevoEstado);
      if (payload.fechaFinal) {
        sheetSol.getRange(rowIndex, 9).setValue("'" + formatearValorFecha(payload.fechaFinal));
      }
      if (payload.tiempoTranscurrido) {
        sheetSol.getRange(rowIndex, 10).setValue(payload.tiempoTranscurrido);
      }
      agregarEventoSeguimiento({
        idSolicitud: payload.idSolicitud,
        accion: 'CAMBIO DE ESTADO',
        usuario: payload.usuario || 'admin1',
        trabajador: payload.trabajador || 'PERSONAL JURISDICCIONAL',
        descripcion: 'CAMBIO DE ESTADO A: ' + payload.nuevoEstado,
        fecha: formatearFechaActual()
      });
      return { ok: true };
    }
  }
  return { ok: false, error: 'Solicitud no encontrada' };
}

function agregarEventoSeguimiento(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetSeg = ss.getSheetByName('Seguimiento');
  const nextId = sheetSeg.getLastRow();
  const fecha = formatearValorFecha(payload.fecha) || formatearFechaActual();

  let docGuardado = null;
  if (payload.documento) {
    if (payload.documento.base64Data) {
      const resDrive = guardarArchivosEnDrive(
        payload.nroSolicitud || payload.idSolicitud,
        payload.dni || 'SEGUIMIENTO',
        [payload.documento]
      );
      if (resDrive.documentosGuardados && resDrive.documentosGuardados.length > 0) {
        docGuardado = resDrive.documentosGuardados[0];
      }
    } else {
      docGuardado = payload.documento;
    }
  }

  sheetSeg.appendRow([
    nextId,
    payload.idSolicitud,
    payload.accion || 'SEGUIMIENTO',
    payload.usuario || 'admin1',
    payload.trabajador || 'ADMINISTRADOR',
    payload.descripcion || '',
    "'" + fecha,
    docGuardado ? JSON.stringify(docGuardado) : ''
  ]);

  return { ok: true, idEvento: nextId, fecha: fecha, documento: docGuardado };
}

function actualizarUbicacionSolicitud(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetSol = ss.getSheetByName('Solicitudes');
  const rows = sheetSol.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (Number(rows[i][0]) === Number(payload.idSolicitud)) {
      const rowIndex = i + 1;
      sheetSol.getRange(rowIndex, 29).setValue(payload.ubicacion || '');
      sheetSol.getRange(rowIndex, 30).setValue(payload.anaquel || '');
      sheetSol.getRange(rowIndex, 31).setValue(payload.fila || '');
      sheetSol.getRange(rowIndex, 32).setValue(payload.columna || '');
      sheetSol.getRange(rowIndex, 33).setValue(payload.paquete || '');

      agregarEventoSeguimiento({
        idSolicitud: payload.idSolicitud,
        accion: 'REGISTRO DE UBICACIÓN',
        usuario: payload.usuario || 'admin1',
        trabajador: payload.trabajador || 'ADMINISTRADOR',
        descripcion: 'UBICACIÓN ACTUALIZADA - ANAQUEL: ' + (payload.anaquel || '-') + ', PAQUETE: ' + (payload.paquete || '-'),
        fecha: formatearFechaActual()
      });
      return { ok: true };
    }
  }
  return { ok: false, error: 'Solicitud no encontrada' };
}

function enviarCorreoSolicitante(payload) {
  const destinatario = payload.destinatario;
  if (!destinatario) {
    return { ok: false, error: 'Falta correo destinatario' };
  }

  const asunto = payload.asunto || ('Atención de Solicitud de Archivo N° ' + payload.nroSolicitud + ' - Poder Judicial');
  const cuerpo = payload.mensaje || '';
  const opciones = {
    name: 'Sistema de Gestión de Archivo - Poder Judicial',
    htmlBody: '<div style="font-family: Arial, sans-serif; color: #333;">' +
      '<div style="background:#7b1e22;color:#fff;padding:12px 18px;font-weight:bold;">PODER JUDICIAL DEL PERÚ - SISTEMA DE GESTIÓN DE ARCHIVO</div>' +
      '<div style="padding:18px;border:1px solid #ddd;">' +
      '<p>' + cuerpo.replace(/\n/g, '<br>') + '</p>' +
      '<hr style="border:none;border-top:1px solid #eee;margin:16px 0;">' +
      '<small style="color:#666;">Este correo fue generado por el Módulo de Atención de Solicitudes del Archivo.</small>' +
      '</div></div>'
  };

  if (payload.cc) {
    opciones.cc = payload.cc;
  }
  if (payload.correoRespaldo) {
    opciones.bcc = payload.correoRespaldo;
  }

  if (payload.adjuntos && payload.adjuntos.length > 0) {
    const blobs = [];
    for (let i = 0; i < payload.adjuntos.length; i++) {
      const adj = payload.adjuntos[i];
      if (adj.base64Data) {
        const parts = adj.base64Data.split(',');
        const raw = parts.length > 1 ? parts[1] : parts[0];
        const bytes = Utilities.base64Decode(raw);
        blobs.push(Utilities.newBlob(bytes, adj.mimeType || 'application/pdf', adj.nombreArchivo || 'adjunto.pdf'));
      }
    }
    if (blobs.length > 0) {
      opciones.attachments = blobs;
    }
  }

  MailApp.sendEmail(destinatario, asunto, cuerpo, opciones);

  if (payload.idSolicitud && payload.registrarEvento !== false) {
    agregarEventoSeguimiento({
      idSolicitud: payload.idSolicitud,
      accion: 'ENVÍO DE CORREO',
      usuario: payload.usuario || 'admin1',
      trabajador: payload.trabajador || 'ADMINISTRADOR',
      descripcion: 'CORREO ENVIADO A: ' + destinatario + ' | MENSAJE: ' + cuerpo,
      fecha: formatearFechaActual()
    });
  }

  return { ok: true };
}

// ============================================================================
// GESTIÓN DE PERSONAL / USUARIOS EN GOOGLE SHEETS
// ============================================================================
function obtenerTodosLosUsuarios() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetUsr = ss.getSheetByName('Usuarios');
  const rows = sheetUsr.getDataRange().getValues();
  const lista = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0] && !r[1]) continue;

    // Detectar si la fila tiene ID numérico en la columna 0 (esquema de 9 columnas)
    // o si tiene el nombre de usuario en la columna 0 (esquema antiguo de 6 columnas)
    const esEsquema9Columnas = !isNaN(Number(r[0])) && String(r[0]).trim() !== '';

    if (esEsquema9Columnas) {
      lista.push({
        idUsuario: Number(r[0]) || i,
        usuario: String(r[1] || '').trim(),
        password: String(r[2] || '123456').trim(),
        nombreCompleto: String(r[3] || ''),
        dni: String(r[4] || ''),
        email: String(r[5] || ''),
        corte: String(r[6] || 'LA LIBERTAD'),
        rol: String(r[7] || 'PERSONAL JURISDICCIONAL'),
        activo: String(r[8] || 'SI').toUpperCase() !== 'NO'
      });
    } else {
      lista.push({
        idUsuario: i,
        usuario: String(r[0] || '').trim(),
        password: String(r[1] || '123456').trim(),
        nombreCompleto: String(r[2] || ''),
        dni: '',
        email: '',
        corte: String(r[3] || 'LA LIBERTAD'),
        rol: String(r[4] || 'PERSONAL JURISDICCIONAL'),
        activo: String(r[5] || 'SI').toUpperCase() !== 'NO'
      });
    }
  }
  return lista;
}

function guardarOActualizarUsuario(u) {
  if (!u || !u.usuario) {
    return { ok: false, error: 'Datos de usuario incompletos' };
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetUsr = ss.getSheetByName('Usuarios');
  const rows = sheetUsr.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    const idFila = Number(rows[i][0]);
    const usrFila = String(rows[i][1] || rows[i][0]);
    if ((u.idUsuario && idFila === Number(u.idUsuario)) || usrFila.toLowerCase() === String(u.usuario).toLowerCase()) {
      const rowIndex = i + 1;
      sheetUsr.getRange(rowIndex, 1, 1, 9).setValues([[
        u.idUsuario || i,
        u.usuario,
        "'" + (u.password || '123456'),
        u.nombreCompleto || '',
        "'" + (u.dni || ''),
        u.email || '',
        u.corte || 'LA LIBERTAD',
        u.rol || 'PERSONAL JURISDICCIONAL',
        u.activo === false ? 'NO' : 'SI'
      ]]);
      return { ok: true, actualizado: true };
    }
  }

  const nextId = sheetUsr.getLastRow();
  sheetUsr.appendRow([
    u.idUsuario || nextId,
    u.usuario,
    "'" + (u.password || '123456'),
    u.nombreCompleto || '',
    "'" + (u.dni || ''),
    u.email || '',
    u.corte || 'LA LIBERTAD',
    u.rol || 'PERSONAL JURISDICCIONAL',
    u.activo === false ? 'NO' : 'SI'
  ]);
  return { ok: true, idUsuario: nextId };
}

function cambiarEstadoActivoUsuarioEnSheet(idUsuario) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetUsr = ss.getSheetByName('Usuarios');
  const rows = sheetUsr.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (Number(rows[i][0]) === Number(idUsuario)) {
      const actual = String(rows[i][8] || 'SI').toUpperCase();
      const nuevo = actual === 'NO' ? 'SI' : 'NO';
      sheetUsr.getRange(i + 1, 9).setValue(nuevo);
      return { ok: true, activo: nuevo === 'SI' };
    }
  }
  return { ok: false, error: 'Usuario no encontrado' };
}

function eliminarUsuarioEnSheet(idUsuario) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetUsr = ss.getSheetByName('Usuarios');
  const rows = sheetUsr.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (Number(rows[i][0]) === Number(idUsuario)) {
      sheetUsr.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Usuario no encontrado' };
}

function validarLogin(usuario, password) {
  const usuarios = obtenerTodosLosUsuarios();
  for (let i = 0; i < usuarios.length; i++) {
    const u = usuarios[i];
    if (u.usuario.toLowerCase() === String(usuario || '').trim().toLowerCase() && String(u.password) === String(password || '').trim()) {
      if (!u.activo) {
        return { ok: false, error: 'Usuario inactivo' };
      }
      return { ok: true, usuario: u };
    }
  }
  return { ok: false, error: 'Usuario o contraseña incorrectos' };
}

function cambiarClaveUsuario(usuario, nuevaClave) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetUsr = ss.getSheetByName('Usuarios');
  const rows = sheetUsr.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    const colUsuario = rows[i].length >= 9 ? String(rows[i][1]) : String(rows[i][0]);
    const colPassIdx = rows[i].length >= 9 ? 3 : 2;
    if (colUsuario.toLowerCase() === String(usuario || '').toLowerCase()) {
      sheetUsr.getRange(i + 1, colPassIdx).setValue("'" + nuevaClave);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Usuario no encontrado' };
}

function obtenerTodosLosServicios() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetServ = ss.getSheetByName('Servicios');
  if (!sheetServ) return [];
  const rows = sheetServ.getDataRange().getValues();
  const activos = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[1]) continue;
    const activo = String(r[3] || 'SI').toUpperCase() !== 'NO';
    if (!activo) continue;

    const nombreServicio = String(r[1] || '').trim();
    const rawPrecio = r[2];
    let precioFormateado = '';
    if (typeof rawPrecio === 'number') {
      precioFormateado = 'S/ ' + rawPrecio.toFixed(2);
    } else {
      const strPrecio = String(rawPrecio || '0.00').trim();
      const num = parseFloat(strPrecio.replace(/[^0-9.]/g, ''));
      precioFormateado = !isNaN(num) ? ('S/ ' + num.toFixed(2)) : ('S/ ' + strPrecio);
    }

    activos.push({
      idTramite: Number(r[0]) || i,
      codigo: nombreServicio.toUpperCase(),
      nombre: nombreServicio.toUpperCase(),
      nombreCorto: nombreServicio,
      costo: precioFormateado
    });
  }

  // Distribuir equitativamente entre columna 1 y columna 2 del cuadro de Costos
  const mitad = Math.ceil(activos.length / 2);
  return activos.map(function(item, idx) {
    item.columna = idx < mitad ? 1 : 2;
    return item;
  });
}

function formatearFechaActual() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Lima', 'dd/MM/yyyy HH:mm');
}

function formatearValorFecha(val) {
  if (!val) return '';
  const tz = Session.getScriptTimeZone() || 'America/Lima';
  if (val instanceof Date && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, tz, 'dd/MM/yyyy HH:mm');
  }
  const str = String(val).trim();
  if (!str) return '';
  const m1 = str.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (m1) {
    return m1[1] + '/' + m1[2] + '/' + m1[3] + ' ' + (m1[4] || '00') + ':' + (m1[5] || '00');
  }
  const m2 = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]+(\d{2}):(\d{2}))?/);
  if (m2) {
    return m2[3] + '/' + m2[2] + '/' + m2[1] + ' ' + (m2[4] || '00') + ':' + (m2[5] || '00');
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, tz, 'dd/MM/yyyy HH:mm');
  }
  return str;
}

function respuestaJson(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
