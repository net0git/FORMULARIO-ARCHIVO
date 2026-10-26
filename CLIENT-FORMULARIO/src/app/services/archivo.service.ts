import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { CostoTramite, SolicitudArchivo } from '../models/archivo.models';
import { PdfConstanciaService } from './pdf-constancia.service';

const STORAGE_KEY_SHEET_URL = 'pj_archivo_google_sheet_url_v2';

@Injectable({
  providedIn: 'root'
})
export class ArchivoService {
  private googleSheetUrl = '';

  // Los servicios y precios provienen exclusivamente de la hoja "Servicios" de Google Sheets
  private tramitesSubject = new BehaviorSubject<CostoTramite[]>([]);
  public tramites$ = this.tramitesSubject.asObservable();

  private conectadoSubject = new BehaviorSubject<boolean>(false);
  public conectado$ = this.conectadoSubject.asObservable();

  private verificandoConexionSubject = new BehaviorSubject<boolean>(true);
  public verificandoConexion$ = this.verificandoConexionSubject.asObservable();

  private mensajeErrorConexionSubject = new BehaviorSubject<string>('');
  public mensajeErrorConexion$ = this.mensajeErrorConexionSubject.asObservable();

  private sincronizandoSubject = new BehaviorSubject<boolean>(false);
  public sincronizando$ = this.sincronizandoSubject.asObservable();

  constructor(private pdfService: PdfConstanciaService) {
    this.inicializarYVerificarHoja();
  }

  // Lee la URL desde /config.json y carga la pestaña "Servicios" (servicio y precio) desde Google Sheets.
  // No existen precios en duro en Angular: si no los recibe de la hoja "Servicios", el formulario queda bloqueado.
  async inicializarYVerificarHoja(): Promise<void> {
    this.verificandoConexionSubject.next(true);
    this.mensajeErrorConexionSubject.next('');
    try {
      const resCfg = await fetch('/config.json', { cache: 'no-store' });
      if (resCfg.ok) {
        const cfg = await resCfg.json();
        const urlCfg = (cfg?.googleSheetUrl || '').trim();
        if (urlCfg && !urlCfg.includes('PEGAR_AQUI_TU_URL')) {
          this.googleSheetUrl = urlCfg;
        }
      }
    } catch {
      // Ignorar si no se pudo leer config.json
    }

    if (!this.googleSheetUrl) {
      this.googleSheetUrl = localStorage.getItem(STORAGE_KEY_SHEET_URL) || '';
    }

    const url = this.obtenerGoogleSheetUrl();
    if (!url || url.includes('PEGAR_AQUI_TU_URL')) {
      this.tramitesSubject.next([]);
      this.conectadoSubject.next(false);
      this.mensajeErrorConexionSubject.next('No se ha configurado la URL en public/config.json.');
      this.verificandoConexionSubject.next(false);
      return;
    }

    try {
      const response = await fetch(`${url}?action=listarServicios`, {
        method: 'GET',
        redirect: 'follow',
        headers: { Accept: 'application/json' }
      });
      const data = await response.json();
      const listaServicios = data?.servicios || data?.tramites;

      if (data && data.ok && Array.isArray(listaServicios) && listaServicios.length > 0) {
        this.tramitesSubject.next(listaServicios);
        this.conectadoSubject.next(true);
        this.mensajeErrorConexionSubject.next('');
      } else if (data && data.ok) {
        this.tramitesSubject.next([]);
        this.conectadoSubject.next(false);
        this.mensajeErrorConexionSubject.next(
          'Tu hoja respondió, pero aún no tiene publicada la pestaña "Servicios". Pega el nuevo Code.gs en Apps Script y publica una "Nueva versión" en Implementar -> Gestionar implementaciones.'
        );
      } else {
        this.tramitesSubject.next([]);
        this.conectadoSubject.next(false);
        this.mensajeErrorConexionSubject.next('La hoja de Google Sheets devolvió un error: ' + (data?.error || 'Desconocido'));
      }
    } catch {
      this.tramitesSubject.next([]);
      this.conectadoSubject.next(false);
      this.mensajeErrorConexionSubject.next('No se pudo conectar con la URL de Google Apps Script.');
    } finally {
      this.verificandoConexionSubject.next(false);
    }
  }

  obtenerGoogleSheetUrl(): string {
    return this.googleSheetUrl || localStorage.getItem(STORAGE_KEY_SHEET_URL) || '';
  }

  estaConectado(): boolean {
    return this.conectadoSubject.getValue();
  }

  async registrarNuevaSolicitud(parcial: Partial<SolicitudArchivo>): Promise<SolicitudArchivo> {
    if (!this.estaConectado()) {
      throw new Error('El formulario no está conectado a la hoja de Google Sheets.');
    }

    const fechaActual = this.formatearFechaHoraActual();
    const nueva: SolicitudArchivo = {
      idSolicitud: 1,
      nroSolicitud: 1,
      estado: 'PENDIENTE',
      corte: (parcial.corte || '').toUpperCase(),
      tipoUsuario: (parcial.tipoUsuario || '').toUpperCase(),
      tipoSolicitud: (parcial.tipoSolicitud || '').toUpperCase(),
      razonSolicitud: (parcial.razonSolicitud || '').toUpperCase(),
      fechaInicio: fechaActual,
      fechaFinal: '',
      tiempoTranscurrido: '',
      dni: parcial.dni || '',
      apellidos: (parcial.apellidos || '').toUpperCase(),
      nombres: (parcial.nombres || '').toUpperCase(),
      email: parcial.email || '',
      celular: parcial.celular || '',
      domicilioProcesal: (parcial.domicilioProcesal || '').toUpperCase(),
      nroExpediente: (parcial.nroExpediente || '').toUpperCase(),
      numeroExpedienteCorto: (parcial.numeroExpedienteCorto || '').toUpperCase(),
      anioExpediente: parcial.anioExpediente || '',
      codigoCompletoExpediente: (parcial.codigoCompletoExpediente || '').toUpperCase(),
      demandante: (parcial.demandante || '').toUpperCase(),
      demandado: (parcial.demandado || '').toUpperCase(),
      materiaDelito: (parcial.materiaDelito || '').toUpperCase(),
      juzgadoEmisor: (parcial.juzgadoEmisor || '').toUpperCase(),
      secretarioRemitente: '',
      fechaEnvioArchivo: fechaActual,
      juzgadoRemitir: '',
      motivoTramite: (parcial.razonSolicitud || parcial.motivoTramite || parcial.tipoSolicitud || '').toUpperCase(),
      ubicacion: '',
      anaquel: '',
      fila: '',
      columna: '',
      paquete: '',
      documentos: parcial.documentos || [],
      eventos: [
        {
          idEvento: 1,
          idSolicitud: 1,
          accion: 'REGISTRO DE SOLICITUD',
          usuario: parcial.dni || 'EXTERNO',
          trabajador: `${parcial.apellidos || ''} ${parcial.nombres || ''}`.trim().toUpperCase(),
          descripcion: `SOLICITUD REGISTRADA EN EL SISTEMA - TRÁMITE: ${parcial.tipoSolicitud || ''}`,
          fecha: fechaActual
        }
      ]
    };

    const docSolicitudBase64 = this.pdfService.obtenerBase64Pdf(nueva);
    const documentoSolicitud = {
      id: Date.now(),
      nombreArchivo: `CONSTANCIA_SOLICITUD_DNI_${nueva.dni || 'EXT'}.pdf`,
      descripcion: 'CONSTANCIA DE SOLICITUD REGISTRADA',
      tipo: 'OTRO' as const,
      mimeType: 'application/pdf',
      base64Data: docSolicitudBase64
    };
    nueva.eventos[0].documento = documentoSolicitud;

    const url = this.obtenerGoogleSheetUrl();
    this.sincronizandoSubject.next(true);
    try {
      const res = await fetch(url, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'crearSolicitud',
          solicitud: {
            ...nueva,
            documentoSolicitud
          }
        })
      });
      const data = await res.json();
      if (data && data.ok) {
        nueva.idSolicitud = data.idSolicitud || nueva.idSolicitud;
        nueva.nroSolicitud = data.nroSolicitud || nueva.nroSolicitud;
        if (data.documentos) {
          nueva.documentos = data.documentos;
        }
        if (data.carpetaDriveUrl) {
          nueva.carpetaDriveUrl = data.carpetaDriveUrl;
        }
      }
    } finally {
      this.sincronizandoSubject.next(false);
    }

    return nueva;
  }

  async enviarConstanciaPorCorreo(
    solicitud: SolicitudArchivo,
    pdfBase64: string
  ): Promise<{ ok: boolean; error?: string }> {
    const url = this.obtenerGoogleSheetUrl();
    const destinatario = (solicitud.email || '').trim();
    if (!url) {
      return { ok: false, error: 'No hay conexión con el servidor de Google Apps Script.' };
    }
    if (!destinatario) {
      return { ok: false, error: 'La solicitud no cuenta con un correo electrónico registrado.' };
    }

    const nombreSolicitante = `${solicitud.nombres || ''} ${solicitud.apellidos || ''}`.trim();
    const asunto = `Constancia de Solicitud de Archivo N° ${solicitud.nroSolicitud} - Poder Judicial del Perú`;
    const mensaje = [
      `Estimado(a) ${nombreSolicitante}:`,
      '',
      `Su solicitud ha sido registrada satisfactoriamente en el Sistema de Gestión de Archivo Central (${solicitud.corte}).`,
      '',
      `RESUMEN DE LA SOLICITUD:`,
      `• N° de Solicitud: ${solicitud.nroSolicitud}`,
      `• Fecha de Registro: ${solicitud.fechaInicio}`,
      `• Trámite Solicitado: ${solicitud.tipoSolicitud}`,
      `• N° de Expediente: ${solicitud.nroExpediente}`,
      `• Juzgado / Instancia: ${solicitud.juzgadoEmisor || '-'}`,
      `• DNI Solicitante: ${solicitud.dni}`,
      '',
      `Adjuntamos a este correo su Constancia de Solicitud en formato PDF (CONSTANCIA_SOLICITUD_NRO_${solicitud.nroSolicitud}.pdf).`,
      '',
      `Recuerde que el plazo de atención es de 5 a 7 días hábiles contabilizados a partir de verificada y admitida su solicitud.`
    ].join('\n');

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

  private formatearFechaHoraActual(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}
