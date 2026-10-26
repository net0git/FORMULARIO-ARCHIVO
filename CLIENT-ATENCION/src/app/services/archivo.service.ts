import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import * as XLSX from 'xlsx';
import {
  DocumentoAdjunto,
  EstadoSolicitud,
  EventoSeguimiento,
  SolicitudArchivo,
  UsuarioSistema
} from '../models/archivo.models';

const STORAGE_KEY_SHEET_URL = 'pj_archivo_google_sheet_url_v2';
const STORAGE_KEY_USER = 'pj_archivo_usuario_sesion_v2';

@Injectable({
  providedIn: 'root'
})
export class ArchivoService {
  private solicitudesSubject = new BehaviorSubject<SolicitudArchivo[]>([]);
  public solicitudes$ = this.solicitudesSubject.asObservable();

  private usuariosSubject = new BehaviorSubject<UsuarioSistema[]>([]);
  public usuarios$ = this.usuariosSubject.asObservable();

  private googleSheetUrlSubject = new BehaviorSubject<string>(this.obtenerGoogleSheetUrl());
  public googleSheetUrl$ = this.googleSheetUrlSubject.asObservable();

  private sincronizandoSubject = new BehaviorSubject<boolean>(false);
  public sincronizando$ = this.sincronizandoSubject.asObservable();

  constructor() {
    localStorage.removeItem('pj_archivo_solicitudes_v1');
    localStorage.removeItem('pj_archivo_usuarios_lista_v1');

    this.inicializarConfiguracion();
  }

  private async inicializarConfiguracion(): Promise<void> {
    if (!this.estaConectadoAGoogleSheet()) {
      try {
        const res = await fetch('/config.json', { cache: 'no-store' });
        if (res.ok) {
          const cfg = await res.json();
          const urlCfg = (cfg?.googleSheetUrl || '').trim();
          if (urlCfg) {
            localStorage.setItem(STORAGE_KEY_SHEET_URL, urlCfg);
            this.googleSheetUrlSubject.next(urlCfg);
          }
        }
      } catch {
        // Sin config.json predefinido
      }
    }

    if (this.estaConectadoAGoogleSheet()) {
      this.sincronizarDesdeGoogleSheet();
    }
  }

  obtenerGoogleSheetUrl(): string {
    return localStorage.getItem(STORAGE_KEY_SHEET_URL) || '';
  }

  guardarGoogleSheetUrl(url: string): void {
    const cleanUrl = (url || '').trim();
    localStorage.setItem(STORAGE_KEY_SHEET_URL, cleanUrl);
    this.googleSheetUrlSubject.next(cleanUrl);
    if (cleanUrl) {
      this.sincronizarDesdeGoogleSheet();
    } else {
      this.solicitudesSubject.next([]);
      this.usuariosSubject.next([]);
    }
  }

  estaConectadoAGoogleSheet(): boolean {
    return Boolean(this.obtenerGoogleSheetUrl());
  }

  obtenerSolicitudesActuales(): SolicitudArchivo[] {
    return this.solicitudesSubject.getValue();
  }

  obtenerUsuariosActuales(): UsuarioSistema[] {
    return this.usuariosSubject.getValue();
  }

  async sincronizarDesdeGoogleSheet(): Promise<{ ok: boolean; mensaje: string }> {
    const url = this.obtenerGoogleSheetUrl();
    if (!url) {
      return { ok: false, mensaje: 'No se ha configurado una URL de Google Apps Script.' };
    }

    this.sincronizandoSubject.next(true);
    try {
      const response = await fetch(url, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'listarSolicitudes' })
      });
      const res = await response.json();
      if (res && res.ok) {
        const solicitudesNormalizadas = (Array.isArray(res.data) ? res.data : []).map((s: SolicitudArchivo) => ({
          ...s,
          fechaInicio: this.formatearFechaSistema(s.fechaInicio),
          fechaFinal: this.formatearFechaSistema(s.fechaFinal),
          fechaEnvioArchivo: this.formatearFechaSistema(s.fechaEnvioArchivo || s.fechaInicio),
          eventos: Array.isArray(s.eventos)
            ? s.eventos.map((ev) => ({
                ...ev,
                fecha: this.formatearFechaSistema(ev.fecha)
              }))
            : []
        }));
        this.solicitudesSubject.next(solicitudesNormalizadas);
        if (Array.isArray(res.usuarios)) {
          const usuariosNormalizados = this.normalizarUsuariosDeSheet(res.usuarios);
          this.usuariosSubject.next(usuariosNormalizados);
        }
        this.sincronizandoSubject.next(false);
        return {
          ok: true,
          mensaje: `Conectado y sincronizado con Google Sheets (${(res.data || []).length} solicitudes, ${(res.usuarios || []).length} usuarios).`
        };
      }
      this.sincronizandoSubject.next(false);
      return { ok: false, mensaje: res?.error || 'Respuesta inválida desde Google Sheets.' };
    } catch (err: any) {
      this.sincronizandoSubject.next(false);
      return { ok: false, mensaje: 'No se pudo conectar con Google Sheets: ' + (err?.message || err) };
    }
  }

  async cambiarEstado(idSolicitud: number, nuevoEstado: EstadoSolicitud): Promise<void> {
    const lista = [...this.obtenerSolicitudesActuales()];
    const idx = lista.findIndex((s) => s.idSolicitud === idSolicitud);
    if (idx === -1) return;

    const sol = { ...lista[idx] };
    sol.estado = nuevoEstado;
    const ahora = this.formatearFechaHoraActual();

    if (nuevoEstado === 'FINALIZADO') {
      sol.fechaFinal = ahora;
      sol.tiempoTranscurrido = this.calcularTiempoTranscurrido(sol.fechaInicio, ahora);
    }

    const user = this.obtenerUsuarioSesion();
    const nuevoEvento: EventoSeguimiento = {
      idEvento: Date.now(),
      idSolicitud: sol.idSolicitud,
      accion: 'CAMBIO DE ESTADO',
      usuario: user?.usuario || 'admin1',
      trabajador: user?.nombreCompleto || 'ADMINISTRADOR',
      descripcion: `CAMBIO DE ESTADO A: ${nuevoEstado}`,
      fecha: ahora
    };
    sol.eventos = [...(sol.eventos || []), nuevoEvento];
    lista[idx] = sol;
    this.solicitudesSubject.next(lista);

    const url = this.obtenerGoogleSheetUrl();
    if (url) {
      try {
        await fetch(url, {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'cambiarEstado',
            idSolicitud: sol.idSolicitud,
            nuevoEstado: sol.estado,
            fechaFinal: sol.fechaFinal,
            tiempoTranscurrido: sol.tiempoTranscurrido,
            usuario: user?.usuario || 'admin1',
            trabajador: user?.nombreCompleto || 'ADMINISTRADOR'
          })
        });
      } catch (e) {
        console.error('Error sincronizando estado con Google Sheet:', e);
      }
    }
  }

  async agregarSeguimiento(
    idSolicitud: number,
    descripcion: string,
    documento?: DocumentoAdjunto | null
  ): Promise<void> {
    const lista = [...this.obtenerSolicitudesActuales()];
    const idx = lista.findIndex((s) => s.idSolicitud === idSolicitud);
    if (idx === -1) return;

    const sol = { ...lista[idx] };
    const ahora = this.formatearFechaHoraActual();
    const user = this.obtenerUsuarioSesion();

    const nuevoEvento: EventoSeguimiento = {
      idEvento: Date.now(),
      idSolicitud: sol.idSolicitud,
      accion: 'SEGUIMIENTO',
      usuario: user?.usuario || 'admin1',
      trabajador: user?.nombreCompleto || 'ADMINISTRADOR',
      descripcion: descripcion.toUpperCase(),
      fecha: ahora,
      documento: documento || null
    };

    sol.eventos = [...(sol.eventos || []), nuevoEvento];
    lista[idx] = sol;
    this.solicitudesSubject.next(lista);

    const url = this.obtenerGoogleSheetUrl();
    if (url) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'agregarSeguimiento',
            idSolicitud: sol.idSolicitud,
            nroSolicitud: sol.nroSolicitud,
            dni: sol.dni,
            accion: 'SEGUIMIENTO',
            usuario: nuevoEvento.usuario,
            trabajador: nuevoEvento.trabajador,
            descripcion: nuevoEvento.descripcion,
            fecha: ahora,
            documento: documento || null
          })
        });
        const data = await res.json();
        if (data && data.ok && data.documento) {
          nuevoEvento.documento = data.documento;
          this.solicitudesSubject.next([...this.obtenerSolicitudesActuales()]);
        }
      } catch (e) {
        console.error('Error sincronizando seguimiento con Google Sheet:', e);
      }
    }
  }

  async actualizarUbicacion(
    idSolicitud: number,
    datosUbicacion: { ubicacion: string; anaquel: string; fila: string; columna: string; paquete: string }
  ): Promise<void> {
    const lista = [...this.obtenerSolicitudesActuales()];
    const idx = lista.findIndex((s) => s.idSolicitud === idSolicitud);
    if (idx === -1) return;

    const sol = { ...lista[idx] };
    sol.ubicacion = (datosUbicacion.ubicacion || '').toUpperCase();
    sol.anaquel = (datosUbicacion.anaquel || '').toUpperCase();
    sol.fila = (datosUbicacion.fila || '').toUpperCase();
    sol.columna = (datosUbicacion.columna || '').toUpperCase();
    sol.paquete = (datosUbicacion.paquete || '').toUpperCase();

    const ahora = this.formatearFechaHoraActual();
    const user = this.obtenerUsuarioSesion();
    sol.eventos = [
      ...(sol.eventos || []),
      {
        idEvento: Date.now(),
        idSolicitud: sol.idSolicitud,
        accion: 'UBICACIÓN REGISTRADA',
        usuario: user?.usuario || 'admin1',
        trabajador: user?.nombreCompleto || 'ADMINISTRADOR',
        descripcion: `UBICACIÓN: ${sol.ubicacion || '-'} | ANAQUEL: ${sol.anaquel || '-'} | FILA: ${sol.fila || '-'} | COLUMNA: ${sol.columna || '-'} | PAQUETE: ${sol.paquete || '-'}`,
        fecha: ahora
      }
    ];

    lista[idx] = sol;
    this.solicitudesSubject.next(lista);

    const url = this.obtenerGoogleSheetUrl();
    if (url) {
      try {
        await fetch(url, {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'actualizarUbicacion',
            idSolicitud: sol.idSolicitud,
            ...datosUbicacion,
            usuario: user?.usuario || 'admin1',
            trabajador: user?.nombreCompleto || 'ADMINISTRADOR'
          })
        });
      } catch (e) {
        console.error('Error sincronizando ubicación con Google Sheet:', e);
      }
    }
  }

  async enviarCorreo(payload: {
    idSolicitud: number;
    nroSolicitud: number;
    destinatario: string;
    cc: string;
    correoRespaldo: string;
    mensaje: string;
    enviarOriginal: boolean;
    adjuntos: DocumentoAdjunto[];
  }): Promise<void> {
    const lista = [...this.obtenerSolicitudesActuales()];
    const idx = lista.findIndex((s) => s.idSolicitud === payload.idSolicitud);
    const ahora = this.formatearFechaHoraActual();
    const user = this.obtenerUsuarioSesion();

    if (idx !== -1) {
      const sol = { ...lista[idx] };
      sol.eventos = [
        ...(sol.eventos || []),
        {
          idEvento: Date.now(),
          idSolicitud: sol.idSolicitud,
          accion: 'ENVÍO DE CORREO',
          usuario: user?.usuario || 'admin1',
          trabajador: user?.nombreCompleto || 'ADMINISTRADOR',
          descripcion: `CORREO ENVIADO A ${payload.destinatario}: "${payload.mensaje}"`,
          fecha: ahora
        }
      ];
      lista[idx] = sol;
      this.solicitudesSubject.next(lista);
    }

    const url = this.obtenerGoogleSheetUrl();
    if (url) {
      try {
        await fetch(url, {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'enviarCorreo',
            ...payload,
            usuario: user?.usuario || 'admin1',
            trabajador: user?.nombreCompleto || 'ADMINISTRADOR'
          })
        });
      } catch (e) {
        console.error('Error enviando correo mediante Google Apps Script:', e);
      }
    }
  }

  /**
   * Obtiene el contenido en base64 de archivos guardados en Google Drive
   * (por su ID) a través del Apps Script, evitando restricciones CORS.
   */
  async obtenerArchivosBase64(
    fileIds: string[]
  ): Promise<{ id: string; mimeType?: string; base64Data?: string; error?: string }[]> {
    const url = this.obtenerGoogleSheetUrl();
    if (!url || fileIds.length === 0) return [];
    const res = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'obtenerArchivosBase64', fileIds })
    });
    const data = await res.json();
    if (!data || !data.ok) {
      throw new Error(data?.error || 'No se pudieron obtener los archivos.');
    }
    return data.archivos || [];
  }

  async enviarConstanciaPorCorreo(
    solicitud: SolicitudArchivo,
    pdfBase64: string
  ): Promise<{ ok: boolean; error?: string }> {
    const destinatario = (solicitud.email || '').trim();
    if (!destinatario) {
      return { ok: false, error: 'La solicitud no cuenta con un correo electrónico registrado.' };
    }
    const nombreSolicitante = `${solicitud.nombres || ''} ${solicitud.apellidos || ''}`.trim();
    const asunto = `Constancia de Solicitud de Archivo N° ${solicitud.nroSolicitud} - Poder Judicial del Perú`;
    const mensaje = [
      `Estimado(a) ${nombreSolicitante}:`,
      '',
      `Adjuntamos a este correo su Constancia de Solicitud N° ${solicitud.nroSolicitud} en formato PDF (${solicitud.tipoSolicitud} - Exp. ${solicitud.nroExpediente}).`,
      '',
      `Recuerde que el plazo de atención es de 5 a 7 días hábiles contabilizados a partir de verificada y admitida su solicitud.`
    ].join('\n');

    const url = this.obtenerGoogleSheetUrl();
    if (!url) {
      return { ok: false, error: 'No hay conexión con el servidor de Google Apps Script.' };
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'enviarCorreo',
          nroSolicitud: solicitud.nroSolicitud,
          registrarEvento: false,
          destinatario,
          asunto,
          mensaje,
          adjuntos: [
            {
              nombreArchivo: `CONSTANCIA_SOLICITUD_NRO_${solicitud.nroSolicitud}.pdf`,
              mimeType: 'application/pdf',
              base64Data: pdfBase64
            }
          ]
        })
      });
      const data = await res.json();
      if (data && data.ok) {
        return { ok: true };
      }
      return { ok: false, error: data?.error || 'No se pudo enviar el correo.' };
    } catch {
      return { ok: false, error: 'Error de red al intentar enviar el correo electrónico.' };
    }
  }

  exportarAExcel(solicitudes: SolicitudArchivo[]): void {
    const filasExcel = solicitudes.map((s) => ({
      estado: s.estado === 'PENDIENTE' ? 1 : s.estado === 'EN PROCESO' ? 2 : s.estado === 'CITADO' ? 3 : 4,
      estado_nombre: s.estado,
      id_solicitud_archivo: s.nroSolicitud,
      nombres: s.nombres,
      apellidos: s.apellidos,
      dni: s.dni,
      correo: s.email,
      domicilio_procesal: s.domicilioProcesal,
      celular: s.celular,
      nro_expediente: s.nroExpediente,
      numero_expediente_corto: s.numeroExpedienteCorto || '',
      anio_expediente: s.anioExpediente || '',
      codigo_completo_expediente: s.codigoCompletoExpediente || '',
      juzgado_instancia: s.juzgadoEmisor || '',
      corte: s.corte,
      tipo_usuario: s.tipoUsuario,
      tipo_solicitud: s.tipoSolicitud,
      razon_solicitud: s.razonSolicitud || s.motivoTramite || '',
      demandante: s.demandante,
      demandado: s.demandado,
      materia_delito: s.materiaDelito,
      fecha_inicio: s.fechaInicio,
      fecha_final: s.fechaFinal,
      tiempo_transcurrido: s.tiempoTranscurrido,
      ubicacion: s.ubicacion,
      anaquel: s.anaquel,
      paquete: s.paquete
    }));

    const worksheet = XLSX.utils.json_to_sheet(filasExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte');
    XLSX.writeFile(workbook, `Reporte_Solicitudes_Archivo_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  // =========================================================================
  // GESTIÓN DE PERSONAL / USUARIOS EN GOOGLE SHEETS Y AUTENTICACIÓN
  // =========================================================================
  async guardarUsuario(datos: UsuarioSistema): Promise<void> {
    const lista = [...this.obtenerUsuariosActuales()];
    let usuarioGuardado: UsuarioSistema;

    if (datos.idUsuario) {
      const idx = lista.findIndex((u) => u.idUsuario === datos.idUsuario);
      if (idx !== -1) {
        usuarioGuardado = {
          ...lista[idx],
          usuario: datos.usuario.trim(),
          password: datos.password ? datos.password : lista[idx].password,
          nombreCompleto: datos.nombreCompleto.trim().toUpperCase(),
          dni: (datos.dni || '').trim(),
          email: (datos.email || '').trim(),
          corte: datos.corte,
          rol: datos.rol,
          activo: datos.activo !== false
        };
        lista[idx] = usuarioGuardado;
      } else {
        usuarioGuardado = datos;
      }
    } else {
      const maxId = lista.reduce((acc, item) => Math.max(acc, item.idUsuario || 0), 0);
      usuarioGuardado = {
        idUsuario: maxId + 1,
        usuario: datos.usuario.trim(),
        password: datos.password || '123456',
        nombreCompleto: datos.nombreCompleto.trim().toUpperCase(),
        dni: (datos.dni || '').trim(),
        email: (datos.email || '').trim(),
        corte: datos.corte || 'LA LIBERTAD',
        rol: datos.rol || 'PERSONAL JURISDICCIONAL',
        activo: datos.activo !== false
      };
      lista.push(usuarioGuardado);
    }
    this.usuariosSubject.next(lista);

    const url = this.obtenerGoogleSheetUrl();
    if (url) {
      try {
        await fetch(url, {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'guardarUsuario',
            usuario: usuarioGuardado
          })
        });
        await this.sincronizarDesdeGoogleSheet();
      } catch (e) {
        console.error('Error sincronizando usuario con Google Sheet:', e);
      }
    }
  }

  async cambiarEstadoActivoUsuario(idUsuario: number): Promise<void> {
    const lista = [...this.obtenerUsuariosActuales()];
    const idx = lista.findIndex((u) => u.idUsuario === idUsuario);
    if (idx === -1) return;
    lista[idx] = { ...lista[idx], activo: !lista[idx].activo };
    this.usuariosSubject.next(lista);

    const url = this.obtenerGoogleSheetUrl();
    if (url) {
      try {
        await fetch(url, {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'cambiarEstadoUsuario',
            idUsuario
          })
        });
      } catch (e) {
        console.error('Error sincronizando estado de usuario con Google Sheet:', e);
      }
    }
  }

  async eliminarUsuario(idUsuario: number): Promise<void> {
    const lista = this.obtenerUsuariosActuales().filter((u) => u.idUsuario !== idUsuario);
    this.usuariosSubject.next(lista);

    const url = this.obtenerGoogleSheetUrl();
    if (url) {
      try {
        await fetch(url, {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'eliminarUsuario',
            idUsuario
          })
        });
      } catch (e) {
        console.error('Error eliminando usuario en Google Sheet:', e);
      }
    }
  }

  private normalizarUsuariosDeSheet(lista: any[]): UsuarioSistema[] {
    return lista.map((u, idx) => {
      // Si la fila en Usuarios tenía 6 columnas (admin1 en col A y 123456 en col B) pero la cabecera tenía 9 columnas
      if (u.usuario === '123456' && String(u.password || '').toUpperCase().includes('ADMINISTRADOR')) {
        return {
          idUsuario: u.idUsuario || idx + 1,
          usuario: 'admin1',
          password: '123456',
          nombreCompleto: u.password || 'ADMINISTRADOR LA LIBERTAD',
          dni: '72677832',
          email: 'dfa.diego.flores@gmail.com',
          corte: u.nombreCompleto || 'LA LIBERTAD',
          rol: u.dni || 'ADMINISTRADOR',
          activo: true
        };
      }
      return {
        idUsuario: u.idUsuario || idx + 1,
        usuario: String(u.usuario || '').trim(),
        password: String(u.password || '123456').replace(/^'/, '').trim(),
        nombreCompleto: String(u.nombreCompleto || '').trim(),
        dni: String(u.dni || '').replace(/^'/, '').trim(),
        email: String(u.email || '').trim(),
        corte: String(u.corte || 'LA LIBERTAD').trim(),
        rol: String(u.rol || 'PERSONAL JURISDICCIONAL').trim(),
        activo: u.activo !== false
      };
    });
  }

  async iniciarSesion(usuario: string, password: string): Promise<{ ok: boolean; error?: string; usuario?: UsuarioSistema }> {
    const uLimpio = (usuario || '').trim();
    const pLimpio = (password || '').trim();
    const url = this.obtenerGoogleSheetUrl();

    if (url) {
      try {
        // Primero sincronizamos la lista desde Google Sheets para validar con los usuarios reales de la hoja
        await this.sincronizarDesdeGoogleSheet();
        const usuariosHoja = this.obtenerUsuariosActuales();

        const encontradoEnHoja = usuariosHoja.find(
          (u) =>
            u.usuario.toLowerCase() === uLimpio.toLowerCase() &&
            String(u.password || '').replace(/^'/, '').trim() === pLimpio
        );

        if (encontradoEnHoja) {
          if (encontradoEnHoja.activo === false) {
            return { ok: false, error: 'El usuario se encuentra INACTIVO.' };
          }
          localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(encontradoEnHoja));
          return { ok: true, usuario: encontradoEnHoja };
        }

        // También consultar el endpoint login de Apps Script por respaldo
        const res = await fetch(url, {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'login',
            usuario: uLimpio,
            password: pLimpio
          })
        });
        const data = await res.json();
        if (data && data.ok && data.usuario) {
          localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(data.usuario));
          return { ok: true, usuario: data.usuario };
        }

        // Si en la hoja Usuarios aún no existe ningún usuario válido (o estaba desfasada la fila inicial), permitir admin1 / 123456 y repararla en la hoja
        if (uLimpio.toLowerCase() === 'admin1' && pLimpio === '123456' && usuariosHoja.length <= 1) {
          const adminReparado: UsuarioSistema = {
            idUsuario: 1,
            usuario: 'admin1',
            password: '123456',
            nombreCompleto: 'ADMINISTRADOR LA LIBERTAD',
            dni: '72677832',
            email: 'dfa.diego.flores@gmail.com',
            corte: 'LA LIBERTAD',
            rol: 'ADMINISTRADOR',
            activo: true
          };
          await this.guardarUsuario(adminReparado);
          localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(adminReparado));
          return { ok: true, usuario: adminReparado };
        }

        return { ok: false, error: data?.error || 'Usuario o contraseña incorrectos en Google Sheets.' };
      } catch (e: any) {
        return { ok: false, error: 'Error al validar credenciales con Google Sheets: ' + (e?.message || e) };
      }
    }

    if (uLimpio.toLowerCase() === 'admin1' && pLimpio === '123456') {
      const adminInicial: UsuarioSistema = {
        idUsuario: 1,
        usuario: 'admin1',
        nombreCompleto: 'ADMINISTRADOR INICIAL (SIN CONECTAR SHEET)',
        corte: 'GENERAL',
        rol: 'ADMINISTRADOR',
        activo: true
      };
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(adminInicial));
      return { ok: true, usuario: adminInicial };
    }

    return {
      ok: false,
      error: 'Credenciales inválidas. Use el administrador inicial (admin1 / 123456) para conectar su Google Sheet.'
    };
  }

  obtenerUsuarioSesion(): UsuarioSistema | null {
    const raw = localStorage.getItem(STORAGE_KEY_USER);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  cerrarSesion(): void {
    localStorage.removeItem(STORAGE_KEY_USER);
  }

  async cambiarClaveAdmin(nuevaClave: string): Promise<void> {
    const sesion = this.obtenerUsuarioSesion();
    const usuarioActual = sesion?.usuario || 'admin1';

    const url = this.obtenerGoogleSheetUrl();
    if (url) {
      try {
        await fetch(url, {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'cambiarClave',
            usuario: usuarioActual,
            nuevaClave
          })
        });
        await this.sincronizarDesdeGoogleSheet();
      } catch (e) {
        console.error('Error sincronizando clave con Google Sheet:', e);
      }
    }
  }

  public formatearFechaSistema(val: any): string {
    if (!val) return '';
    const str = String(val).trim();
    if (!str) return '';
    const m1 = str.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
    if (m1) {
      return `${m1[1]}/${m1[2]}/${m1[3]} ${m1[4] || '00'}:${m1[5] || '00'}`;
    }
    const m2 = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]+(\d{2}):(\d{2}))?/);
    if (m2) {
      return `${m2[3]}/${m2[2]}/${m2[1]} ${m2[4] || '00'}:${m2[5] || '00'}`;
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    return str;
  }

  private parsearFechaADate(str: string): Date | null {
    if (!str) return null;
    const s = String(str).trim();
    const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
    if (m1) {
      return new Date(
        Number(m1[3]),
        Number(m1[2]) - 1,
        Number(m1[1]),
        Number(m1[4] || 0),
        Number(m1[5] || 0)
      );
    }
    const d = new Date(s.replace(' ', 'T'));
    return !isNaN(d.getTime()) ? d : new Date(s);
  }

  private formatearFechaHoraActual(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  private calcularTiempoTranscurrido(inicioStr: string, finStr: string): string {
    try {
      const ini = this.parsearFechaADate(inicioStr);
      const fin = this.parsearFechaADate(finStr);
      if (!ini || !fin || isNaN(ini.getTime()) || isNaN(fin.getTime())) {
        return '0 dias y 0 horas y 1 minutos';
      }
      const diffMs = Math.max(0, fin.getTime() - ini.getTime());
      const totalMins = Math.floor(diffMs / 60000);
      const dias = Math.floor(totalMins / (60 * 24));
      const horas = Math.floor((totalMins % (60 * 24)) / 60);
      const minutos = totalMins % 60;
      return `${dias} dias y ${horas} horas y ${minutos} minutos`;
    } catch {
      return '0 dias y 0 horas y 1 minutos';
    }
  }
}
