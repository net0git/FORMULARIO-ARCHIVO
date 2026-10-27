import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { DocumentoAdjunto, SolicitudArchivo } from '../../models/archivo.models';
import { PdfConstanciaService } from '../../services/pdf-constancia.service';
import { ArchivoService } from '../../services/archivo.service';
import { PDFDocument } from 'pdf-lib';

@Component({
  selector: 'app-pdf-viewer-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="pdf-overlay" *ngIf="solicitud || documento" (click)="cerrar.emit()">
      <div class="pdf-window fade-in" (click)="$event.stopPropagation()">
        <div class="pdf-toolbar">
          <div class="pdf-toolbar-left">
            <i class="fa-solid fa-table-columns"></i>
            <i class="fa-solid fa-magnifying-glass"></i>
            <span class="pdf-page-indicator">
              {{ documento ? 'Visor de Documento' : ('Páginas: ' + (1 + documentosDeEventos.length)) }}
            </span>
            <span class="pdf-divider">|</span>
            <span class="pdf-zoom">Zoom Automático</span>
          </div>

          <div class="pdf-toolbar-title">
            {{ documento ? (documento.nombreArchivo || documento.descripcion || 'DOCUMENTO ADJUNTO') : ('EXPEDIENTE Y DOCUMENTACIÓN DE EVENTOS - SOL. N° ' + solicitud?.nroSolicitud) }}
          </div>

          <div class="pdf-toolbar-actions">
            <button
              type="button"
              class="pdf-action-btn"
              *ngIf="documento && solicitud && !modoDocs"
              (click)="volverAVistaCompletaEventos()"
              title="Volver a la Solicitud y toda la Documentación de Eventos"
            >
              <i class="fa-solid fa-arrow-left"></i> Ver Todo ({{ 1 + documentosDeEventos.length }})
            </button>
            <button
              type="button"
              class="pdf-action-btn email-btn"
              [class.sent]="correoEnviado"
              *ngIf="false"
              [disabled]="enviandoCorreo"
              (click)="enviarAlCorreo()"
              [title]="'Enviar constancia en PDF a: ' + solicitud?.email"
            >
              <i class="fa-solid fa-spinner fa-spin" *ngIf="enviandoCorreo"></i>
              <i class="fa-solid fa-circle-check" *ngIf="!enviandoCorreo && correoEnviado"></i>
              <i class="fa-solid fa-envelope" *ngIf="!enviandoCorreo && !correoEnviado"></i>
              <span>
                {{ enviandoCorreo ? 'Enviando...' : (correoEnviado ? 'Enviado al correo' : 'Enviar al correo') }}
              </span>
            </button>
            <button type="button" class="pdf-action-btn" (click)="imprimir()" [title]="documento ? 'Abrir / Imprimir Documento' : 'Imprimir Constancia y Eventos'">
              <i class="fa-solid fa-print"></i> {{ documento ? 'Abrir / Imprimir' : 'Imprimir' }}
            </button>
            <button type="button" class="pdf-action-btn primary" (click)="descargar()" [title]="documento ? 'Descargar Documento' : 'Descargar PDF'">
              <i class="fa-solid fa-download"></i> {{ documento ? 'Descargar' : 'Descargar PDF' }}
            </button>
            <button type="button" class="pdf-close-btn" (click)="cerrar.emit()" title="Cerrar">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <!-- Barra rápida con únicamente los documentos del campo DOC de Eventos -->
        <div class="pdf-events-doc-bar" *ngIf="solicitud && !modoDocs && documentosDeEventos.length > 0">
          <span class="doc-bar-label"><i class="fa-solid fa-folder-open"></i> Documentos (DOC):</span>
          <button
            type="button"
            class="doc-tab-pill"
            [class.active]="!documento"
            (click)="volverAVistaCompletaEventos()"
          >
            <i class="fa-regular fa-file-pdf"></i> Solicitud ({{ 1 + documentosDeEventos.length }} docs)
          </button>
          <button
            type="button"
            class="doc-tab-pill"
            *ngFor="let item of documentosDeEventos"
            [class.active]="documento === item.documento"
            (click)="seleccionarDocumentoEvento(item.documento)"
            [title]="item.documento.nombreArchivo"
          >
            <i class="fa-regular fa-file-pdf"></i>
            {{ item.documento.nombreArchivo }}
          </button>
        </div>

        <div class="pdf-email-banner ok" *ngIf="modoDocs && cargandoUnion">
          <i class="fa-solid fa-spinner fa-spin"></i>
          <span>Uniendo documentos (DOC) de eventos en un solo PDF...</span>
        </div>
        <div class="pdf-email-banner err" *ngIf="modoDocs && errorUnion">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>{{ errorUnion }}</span>
        </div>

        <div class="pdf-email-banner ok" *ngIf="mensajeExitoCorreo">
          <i class="fa-solid fa-circle-check"></i>
          <span>{{ mensajeExitoCorreo }}</span>
        </div>
        <div class="pdf-email-banner err" *ngIf="mensajeErrorCorreo">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>{{ mensajeErrorCorreo }}</span>
        </div>

        <!-- MODO 1: VISUALIZACIÓN DE DOCUMENTO ADJUNTO (PDF O IMAGEN DE SEGUIMIENTO / SOLICITUD) -->
        <div class="pdf-canvas-bg" [class.embed-mode]="!esImagenAdjunta" *ngIf="documento">
          <div class="pdf-a4-page img-preview-page" *ngIf="esImagenAdjunta && recursoAdjuntoUrl">
            <img [src]="recursoAdjuntoUrl" [alt]="documento.nombreArchivo" class="adjunto-img-preview" />
          </div>
          <iframe
            *ngIf="!esImagenAdjunta && recursoAdjuntoUrl"
            [src]="recursoAdjuntoUrl"
            class="pdf-iframe-embed"
            allow="autoplay"
          ></iframe>
        </div>

        <!-- MODO 2: CONSTANCIA DE SOLICITUD A4 + TODA LA DOCUMENTACIÓN DE EVENTOS -->
        <div class="pdf-canvas-bg stacked-pages" *ngIf="!documento && solicitud && !modoDocs">
          <div class="pdf-a4-page" id="constancia-print-area">
            <div class="a4-header">
              <div class="pj-brand">
                <div class="pj-emblem-grid">
                  <span></span><span></span>
                  <span></span><span></span>
                </div>
                <div class="pj-brand-text">
                  <strong>PODER</strong>
                  <strong>JUDICIAL</strong>
                  <small>DEL PERÚ</small>
                </div>
              </div>

              <div class="a4-title">
                SOLICITUD DE ARCHIVO - NRO: {{ solicitud.nroSolicitud }}
              </div>
            </div>

            <p class="a4-quote">
              "Recuerde que el plazo de atención es de 5 a 7 días hábiles contabilizados a partir de verificada y admitida su solicitud.<br />
              El plazo puede tardar más días si se trata de una búsqueda crítica"
            </p>

            <div class="a4-section">
              <h3>Declaración Jurada</h3>
              <p class="a4-legal">
                Para dar inicio al tramite, deberá llenarse los datos del formulario y anexar de manera digital el DNI del solicitante y el
                documento de pago por derecho de trámite (mediante foto por ambos lados con teléfono celular).<br />
                La información proporcionada por el solicitante se presume veraz y tiene el valor de declaración jurada; quedando a
                fiscalización posterior por la institución judicial, bajo responsabilidad administrativa, civil y penal en caso de verificarse
                la falsedad de lo informado.
              </p>
            </div>

            <div class="a4-section">
              <h3>Datos del Tipo de solicitud</h3>
              <div class="a4-row">
                <span class="a4-label">Fecha Registro:</span>
                <span class="a4-val">{{ formatearFecha(solicitud.fechaInicio) }}</span>
              </div>
              <div class="a4-row">
                <span class="a4-label">Estado Actual:</span>
                <span class="a4-val">{{ solicitud.estado }}</span>
              </div>
              <div class="a4-row">
                <span class="a4-label">Corte Superior:</span>
                <span class="a4-val">{{ solicitud.corte }}</span>
              </div>
              <div class="a4-row">
                <span class="a4-label">Tipo de Usuario:</span>
                <span class="a4-val">{{ solicitud.tipoUsuario }}</span>
              </div>
              <div class="a4-row">
                <span class="a4-label">Solicito:</span>
                <span class="a4-val">{{ solicitud.tipoSolicitud }}</span>
              </div>
              <div class="a4-row" *ngIf="solicitud.razonSolicitud || solicitud.motivoTramite">
                <span class="a4-label">Razón:</span>
                <span class="a4-val">{{ solicitud.razonSolicitud || solicitud.motivoTramite }}</span>
              </div>
            </div>

            <div class="a4-section">
              <h3>Datos Básicos</h3>
              <div class="a4-row">
                <span class="a4-label">Nro Doc:</span>
                <span class="a4-val">{{ solicitud.dni }}</span>
              </div>
              <div class="a4-row">
                <span class="a4-label">Apellidos:</span>
                <span class="a4-val">{{ solicitud.apellidos }}</span>
              </div>
              <div class="a4-row" *ngIf="solicitud.nombres">
                <span class="a4-label">Nombres:</span>
                <span class="a4-val">{{ solicitud.nombres }}</span>
              </div>
              <div class="a4-row" *ngIf="solicitud.email">
                <span class="a4-label">Correo Electrónico:</span>
                <span class="a4-val">{{ solicitud.email }}</span>
              </div>
              <div class="a4-row" *ngIf="solicitud.celular">
                <span class="a4-label">Teléfono Celular:</span>
                <span class="a4-val">{{ solicitud.celular }}</span>
              </div>
              <div class="a4-row" *ngIf="solicitud.domicilioProcesal">
                <span class="a4-label">Domicilio Procesal:</span>
                <span class="a4-val">{{ solicitud.domicilioProcesal }}</span>
              </div>
            </div>

            <div class="a4-section">
              <h3>Datos del Expediente</h3>
              <div class="a4-row">
                <span class="a4-label">Número Expediente:</span>
                <span class="a4-val">{{ solicitud.nroExpediente }}</span>
              </div>
              <div class="a4-row">
                <span class="a4-label">Demandante/Agraviado:</span>
                <span class="a4-val">{{ solicitud.demandante }}</span>
              </div>
              <div class="a4-row">
                <span class="a4-label">Demandado/Inculpado:</span>
                <span class="a4-val">{{ solicitud.demandado }}</span>
              </div>
              <div class="a4-row">
                <span class="a4-label">Materia/Delito:</span>
                <span class="a4-val">{{ solicitud.materiaDelito }}</span>
              </div>
              <div class="a4-row" *ngIf="solicitud.juzgadoEmisor">
                <span class="a4-label">Juzgado/Instancia:</span>
                <span class="a4-val">{{ solicitud.juzgadoEmisor }}</span>
              </div>
              <div class="a4-row" *ngIf="solicitud.ubicacion || solicitud.anaquel || solicitud.paquete">
                <span class="a4-label">Ubicación Física:</span>
                <span class="a4-val">
                  Ubic: {{ solicitud.ubicacion || '-' }} | Anaquel: {{ solicitud.anaquel || '-' }} | Fila: {{ solicitud.fila || '-' }} | Col: {{ solicitud.columna || '-' }} | Paquete: {{ solicitud.paquete || '-' }}
                </span>
              </div>
            </div>

            <div class="a4-section" *ngIf="solicitud.documentos && solicitud.documentos.length > 0">
              <h3>Documentos Adjuntos (Foto / PDF)</h3>
              <div class="a4-row" *ngFor="let doc of solicitud.documentos; let i = index">
                <span class="a4-label">Adjunto {{ i + 1 }} ({{ doc.tipo }}):</span>
                <span class="a4-val">{{ doc.descripcion }} ({{ doc.nombreArchivo }})</span>
              </div>
            </div>
          </div>

          <!-- DOCUMENTOS REGISTRADOS EN EL CAMPO DOC DE EVENTOS -->
          <div class="pdf-event-doc-sheet" *ngFor="let item of documentosDeEventos">
            <div class="event-doc-sheet-header">
              <div>
                <span class="event-doc-badge">DOC EVENTO N° {{ item.nroEvento }}</span>
                <strong>{{ item.documento.nombreArchivo }}</strong>
              </div>
              <button type="button" class="pdf-action-btn primary" (click)="seleccionarDocumentoEvento(item.documento)">
                <i class="fa-solid fa-expand"></i> Ver individual
              </button>
            </div>
            <div class="event-doc-sheet-body">
              <img *ngIf="item.esImagen" [src]="item.safeUrl" [alt]="item.documento.nombreArchivo" class="adjunto-img-preview" />
              <iframe *ngIf="!item.esImagen" [src]="item.safeUrl" class="pdf-iframe-embed-sheet" allow="autoplay"></iframe>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .pdf-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.72);
      z-index: 9500;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
    }
    .pdf-window {
      width: 100%;
      max-width: 960px;
      height: 90vh;
      background: #474747;
      border-radius: 4px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
    }
    .pdf-toolbar {
      background: #323639;
      color: #d9d9d9;
      padding: 8px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #222;
      font-size: 13px;
    }
    .pdf-toolbar-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .pdf-page-indicator {
      background: #202224;
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 12px;
    }
    .pdf-divider {
      color: #666;
    }
    .pdf-zoom {
      background: #202224;
      padding: 2px 10px;
      border-radius: 3px;
      font-size: 12px;
    }
    .pdf-toolbar-title {
      font-weight: 600;
      color: #fff;
    }
    .pdf-toolbar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .pdf-action-btn {
      background: #4a4f54;
      color: #fff;
      border: 1px solid #666;
      padding: 5px 12px;
      border-radius: 3px;
      font-size: 12.5px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .pdf-action-btn.primary {
      background: #7b1e22;
      border-color: #9e2a2f;
    }
    .pdf-action-btn.email-btn {
      background: #2b579a;
      border-color: #3b6db5;
    }
    .pdf-action-btn.email-btn.sent {
      background: #28a745;
      border-color: #34ce57;
    }
    .pdf-action-btn:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
    .pdf-action-btn:hover:not(:disabled) {
      filter: brightness(1.12);
    }
    .pdf-email-banner {
      padding: 7px 16px;
      font-size: 12.5px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-weight: 500;
    }
    .pdf-email-banner.ok {
      background: #d4edda;
      color: #155724;
      border-bottom: 1px solid #c3e6cb;
    }
    .pdf-email-banner.err {
      background: #f8d7da;
      color: #721c24;
      border-bottom: 1px solid #f5c6cb;
    }
    .pdf-close-btn {
      background: transparent;
      color: #fff;
      border: none;
      font-size: 18px;
      margin-left: 6px;
      padding: 2px 6px;
    }
    .pdf-canvas-bg {
      flex: 1;
      overflow-y: auto;
      padding: 28px 16px 80px 16px;
      display: flex;
      justify-content: center;
      background: #525659;
    }
    .pdf-canvas-bg.embed-mode {
      padding: 0;
      overflow: hidden;
    }
    .pdf-iframe-embed {
      width: 100%;
      height: 100%;
      border: none;
      background: #525659;
    }
    .img-preview-page {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .adjunto-img-preview {
      max-width: 100%;
      height: auto;
      border-radius: 3px;
    }
    .pdf-a4-page {
      background: #ffffff;
      width: 100%;
      max-width: 740px;
      min-height: 1050px;
      padding: 40px 48px 100px 48px;
      margin-bottom: 60px;
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
      color: #333;
      height: auto;
      box-sizing: border-box;
      flex-shrink: 0;
    }
    .a4-header {
      display: flex;
      align-items: center;
      gap: 28px;
      margin-bottom: 18px;
    }
    .pj-brand {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .pj-emblem-grid {
      display: grid;
      grid-template-columns: repeat(2, 18px);
      grid-template-rows: repeat(2, 18px);
      gap: 3px;
    }
    .pj-emblem-grid span {
      border: 3px solid #7b1e22;
      position: relative;
    }
    .pj-emblem-grid span::after {
      content: '';
      position: absolute;
      inset: 2px;
      border: 1.5px solid #7b1e22;
    }
    .pj-brand-text {
      display: flex;
      flex-direction: column;
      font-family: Georgia, 'Times New Roman', serif;
      color: #666;
      line-height: 1.1;
      font-size: 11px;
    }
    .pj-brand-text small {
      font-size: 9.5px;
      margin-top: 1px;
    }
    .a4-title {
      font-size: 18px;
      font-weight: 700;
      color: #1f1f1f;
      letter-spacing: 0.3px;
    }
    .a4-quote {
      font-size: 11px;
      color: #666;
      margin-bottom: 20px;
      line-height: 1.5;
    }
    .a4-section {
      margin-bottom: 18px;
    }
    .a4-section h3 {
      color: #a63429;
      font-weight: 500;
      font-size: 15px;
      margin-bottom: 8px;
    }
    .a4-legal {
      padding-left: 16px;
      font-size: 11px;
      color: #666;
      line-height: 1.55;
      text-align: justify;
    }
    .a4-row {
      padding-left: 16px;
      margin-bottom: 5px;
      font-size: 11.5px;
      display: flex;
      gap: 8px;
    }
    .a4-label {
      color: #777;
      min-width: 135px;
    }
    .a4-val {
      color: #444;
      font-weight: 600;
    }
    .pdf-events-doc-bar {
      background: #25282a;
      border-bottom: 1px solid #1a1c1e;
      padding: 7px 16px;
      display: flex;
      align-items: center;
      gap: 8px;
      overflow-x: auto;
      white-space: nowrap;
    }
    .doc-bar-label {
      color: #bbb;
      font-size: 11.5px;
      font-weight: 600;
      margin-right: 4px;
    }
    .doc-tab-pill {
      background: #3a3f44;
      color: #e0e0e0;
      border: 1px solid #555;
      padding: 4px 10px;
      border-radius: 14px;
      font-size: 11.5px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
    }
    .doc-tab-pill.active {
      background: #7b1e22;
      border-color: #a63429;
      color: #fff;
      font-weight: 600;
    }
    .doc-tab-pill:hover {
      filter: brightness(1.12);
    }
    .pdf-canvas-bg.stacked-pages {
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      gap: 24px;
      padding-bottom: 120px;
    }
    .a4-events-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
      font-size: 10.5px;
    }
    .a4-events-table th {
      background: #8b1e22;
      color: #fff;
      padding: 5px 6px;
      text-align: left;
      font-weight: 700;
    }
    .a4-events-table td {
      border: 1px solid #e0e0e0;
      padding: 5px 6px;
      color: #333;
      vertical-align: middle;
    }
    .a4-inline-doc-btn {
      background: #5a6268;
      color: #fff;
      border: none;
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 10.5px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      margin-left: 4px;
    }
    .a4-inline-doc-btn:hover {
      background: #7b1e22;
    }
    .a4-doc-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: #7b1e22;
      font-weight: 600;
      font-size: 10px;
    }
    .pdf-event-doc-sheet {
      width: 100%;
      max-width: 680px;
      background: #ffffff;
      border-radius: 4px;
      overflow: hidden;
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
      display: flex;
      flex-direction: column;
    }
    .event-doc-sheet-header {
      background: #7b1e22;
      color: #fff;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .event-doc-sheet-header strong {
      display: block;
      font-size: 13px;
    }
    .event-doc-sheet-header small {
      display: block;
      color: #f5d7d8;
      font-size: 11px;
      margin-top: 2px;
    }
    .event-doc-badge {
      display: inline-block;
      background: rgba(0, 0, 0, 0.28);
      padding: 2px 7px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 700;
      margin-bottom: 3px;
    }
    .event-doc-sheet-body {
      width: 100%;
      min-height: 760px;
      background: #f5f5f5;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .pdf-iframe-embed-sheet {
      width: 100%;
      height: 760px;
      border: none;
    }
  `]
})
export class PdfViewerModalComponent implements OnChanges {
  @Input() solicitud: SolicitudArchivo | null = null;
  @Input() documento: DocumentoAdjunto | null = null;
  /** Si es true, une todos los documentos (DOC) de eventos en un solo PDF y lo muestra. */
  @Input() modoDocs = false;
  @Output() cerrar = new EventEmitter<void>();

  pdfUrl: SafeResourceUrl | null = null;
  recursoAdjuntoUrl: SafeResourceUrl | null = null;
  esImagenAdjunta = false;
  documentosDeEventos: {
    nroEvento: number;
    accion: string;
    trabajador: string;
    descripcionEvento: string;
    fecha: string;
    documento: DocumentoAdjunto;
    esImagen: boolean;
    safeUrl: SafeResourceUrl;
  }[] = [];
  enviandoCorreo = false;
  correoEnviado = false;
  mensajeExitoCorreo = '';
  mensajeErrorCorreo = '';
  cargandoUnion = false;
  errorUnion = '';

  constructor(
    private pdfService: PdfConstanciaService,
    private archivoService: ArchivoService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['solicitud'] || changes['documento'] || changes['modoDocs']) {
      this.enviandoCorreo = false;
      this.correoEnviado = false;
      this.mensajeExitoCorreo = '';
      this.mensajeErrorCorreo = '';
      this.recursoAdjuntoUrl = null;
      this.esImagenAdjunta = false;

      if (this.solicitud) {
        this.construirDocumentosDeEventos(this.solicitud);
      } else {
        this.documentosDeEventos = [];
      }

      if (this.modoDocs && this.solicitud && !this.documento) {
        void this.unirDocumentosDeEventos(this.solicitud);
        return;
      }

      if (this.documento) {
        this.prepararVistaDocumento(this.documento);
      } else if (this.solicitud) {
        const url = this.pdfService.obtenerBlobUrl(this.solicitud);
        this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
      }
    }
  }

  /**
   * Une en un solo PDF todos los documentos (campo DOC) de los eventos de la solicitud
   * y los muestra en el visor. Las imágenes se insertan como páginas.
   */
  private async unirDocumentosDeEventos(sol: SolicitudArchivo): Promise<void> {
    this.cargandoUnion = true;
    this.errorUnion = '';
    this.recursoAdjuntoUrl = null;

    try {
      // El DOC del evento REGISTRO DE SOLICITUD es la constancia (se genera); los demás son adjuntos.
      const docs: DocumentoAdjunto[] = (sol.eventos || [])
        .filter((ev) => ev.documento)
        .map((ev) => ev.documento as DocumentoAdjunto);
      const incluirConstancia = (sol.eventos || []).some((ev) => ev.accion === 'REGISTRO DE SOLICITUD') || docs.length === 0;


      // IDs de Drive de los documentos que no traen contenido local
      const idsDrive: string[] = [];
      docs.forEach((d) => {
        if (!d.base64Data) {
          const id = this.extraerIdDrive(d);
          if (id && !idsDrive.includes(id)) idsDrive.push(id);
        }
      });
      const descargados = idsDrive.length ? await this.archivoService.obtenerArchivosBase64(idsDrive) : [];
      const mapaDrive = new Map(descargados.map((a) => [a.id, a]));

      const pdfFinal = await PDFDocument.create();
      let paginasAgregadas = 0;

      if (incluirConstancia) {
        const bytesConstancia = new Uint8Array(this.pdfService.generarDocumentoPdf(sol).output('arraybuffer'));
        const srcC = await PDFDocument.load(bytesConstancia);
        const pagsC = await pdfFinal.copyPages(srcC, srcC.getPageIndices());
        pagsC.forEach((p) => pdfFinal.addPage(p));
        paginasAgregadas += pagsC.length;
      }

      for (const d of docs) {
        let raw = '';
        let mime = (d.mimeType || '').toLowerCase();
        if (d.base64Data) {
          const parts = d.base64Data.split(',');
          raw = parts.length > 1 ? parts[1] : parts[0];
          const m = parts[0].match(/:(.*?);/);
          if (m && !mime) mime = m[1].toLowerCase();
        } else {
          const id = this.extraerIdDrive(d);
          const arch = id ? mapaDrive.get(id) : undefined;
          if (!arch || !arch.base64Data) continue;
          raw = arch.base64Data;
          mime = (arch.mimeType || mime).toLowerCase();
        }

        const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
        const nombre = (d.nombreArchivo || '').toLowerCase();

        try {
          if (mime.includes('pdf') || nombre.endsWith('.pdf')) {
            const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
            const pages = await pdfFinal.copyPages(src, src.getPageIndices());
            pages.forEach((p) => pdfFinal.addPage(p));
            paginasAgregadas += pages.length;
          } else if (mime.includes('png') || nombre.endsWith('.png')) {
            this.agregarImagenComoPagina(pdfFinal, await pdfFinal.embedPng(bytes));
            paginasAgregadas++;
          } else if (mime.includes('jpeg') || mime.includes('jpg') || /\.(jpg|jpeg)$/.test(nombre)) {
            this.agregarImagenComoPagina(pdfFinal, await pdfFinal.embedJpg(bytes));
            paginasAgregadas++;
          }
        } catch {
          // documento inválido: se omite y se continúa con el resto
        }
      }

      if (paginasAgregadas === 0) {
        this.errorUnion = 'No se pudieron cargar los documentos de eventos para unirlos.';
        return;
      }

      const base64 = await pdfFinal.saveAsBase64({ dataUri: true });
      const pseudoDoc: DocumentoAdjunto = {
        id: 0,
        nombreArchivo: 'DOCUMENTOS_EVENTOS_SOL_' + sol.nroSolicitud + '.pdf',
        descripcion: 'Documentos de eventos unidos',
        tipo: 'OTRO',
        mimeType: 'application/pdf',
        base64Data: base64
      };
      this.documento = pseudoDoc;
      this.prepararVistaDocumento(pseudoDoc);
    } catch (e) {
      this.errorUnion = 'Error al unir los documentos: ' + ((e as Error)?.message || 'desconocido');
    } finally {
      this.cargandoUnion = false;
    }
  }

  private agregarImagenComoPagina(pdf: PDFDocument, img: { width: number; height: number }): void {
    const maxW = 595;
    const maxH = 842;
    const escala = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = img.width * escala;
    const h = img.height * escala;
    const page = pdf.addPage([maxW, maxH]);
    page.drawImage(img as never, { x: (maxW - w) / 2, y: (maxH - h) / 2, width: w, height: h });
  }

  private extraerIdDrive(d: DocumentoAdjunto): string {
    const fuente = d.url || d.downloadUrl || '';
    const m = fuente.match(/\/file\/d\/([^/?]+)/) || fuente.match(/[?&]id=([^&]+)/);
    return m ? m[1] : '';
  }

  seleccionarDocumentoEvento(doc: DocumentoAdjunto): void {
    this.documento = doc;
    this.prepararVistaDocumento(doc);
  }

  volverAVistaCompletaEventos(): void {
    this.documento = null;
    this.recursoAdjuntoUrl = null;
    this.esImagenAdjunta = false;
  }

  private construirDocumentosDeEventos(sol: SolicitudArchivo): void {
    const lista: {
      nroEvento: number;
      accion: string;
      trabajador: string;
      descripcionEvento: string;
      fecha: string;
      documento: DocumentoAdjunto;
      esImagen: boolean;
      safeUrl: SafeResourceUrl;
    }[] = [];

    if (sol.eventos && sol.eventos.length > 0) {
      sol.eventos.forEach((ev, idx) => {
        if (ev.accion !== 'REGISTRO DE SOLICITUD' && ev.documento) {
          const infoVista = this.obtenerSafeUrlParaDocumento(ev.documento);
          if (infoVista) {
            lista.push({
              nroEvento: idx + 1,
              accion: ev.accion,
              trabajador: ev.trabajador || ev.usuario,
              descripcionEvento: ev.descripcion,
              fecha: this.formatearFecha(ev.fecha),
              documento: ev.documento,
              esImagen: infoVista.esImagen,
              safeUrl: infoVista.safeUrl
            });
          }
        }
      });
    }
    this.documentosDeEventos = lista;
  }

  private obtenerSafeUrlParaDocumento(doc: DocumentoAdjunto): { esImagen: boolean; safeUrl: SafeResourceUrl } | null {
    const mime = (doc.mimeType || '').toLowerCase();
    const nombre = (doc.nombreArchivo || '').toLowerCase();

    if (doc.base64Data) {
      const esImg =
        mime.startsWith('image/') ||
        doc.base64Data.startsWith('data:image/') ||
        /\.(jpg|jpeg|png|gif|webp)$/.test(nombre);

      if (esImg) {
        return {
          esImagen: true,
          safeUrl: this.sanitizer.bypassSecurityTrustResourceUrl(doc.base64Data)
        };
      }

      try {
        const parts = doc.base64Data.split(',');
        const raw = parts.length > 1 ? parts[1] : parts[0];
        const byteCharacters = atob(raw);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: doc.mimeType || 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);
        return {
          esImagen: false,
          safeUrl: this.sanitizer.bypassSecurityTrustResourceUrl(blobUrl)
        };
      } catch {
        return {
          esImagen: false,
          safeUrl: this.sanitizer.bypassSecurityTrustResourceUrl(doc.base64Data)
        };
      }
    }

    if (doc.url) {
      let previewUrl = doc.url;
      const matchDrive = doc.url.match(/\/file\/d\/([^/]+)/);
      if (matchDrive && matchDrive[1]) {
        previewUrl = `https://drive.google.com/file/d/${matchDrive[1]}/preview`;
      }
      return {
        esImagen: false,
        safeUrl: this.sanitizer.bypassSecurityTrustResourceUrl(previewUrl)
      };
    }

    return null;
  }

  private prepararVistaDocumento(doc: DocumentoAdjunto): void {
    const mime = (doc.mimeType || '').toLowerCase();
    const nombre = (doc.nombreArchivo || '').toLowerCase();

    if (doc.base64Data) {
      const esImg =
        mime.startsWith('image/') ||
        doc.base64Data.startsWith('data:image/') ||
        /\.(jpg|jpeg|png|gif|webp)$/.test(nombre);

      if (esImg) {
        this.esImagenAdjunta = true;
        this.recursoAdjuntoUrl = this.sanitizer.bypassSecurityTrustResourceUrl(doc.base64Data);
        return;
      }

      try {
        const parts = doc.base64Data.split(',');
        const raw = parts.length > 1 ? parts[1] : parts[0];
        const byteCharacters = atob(raw);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: doc.mimeType || 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);
        this.recursoAdjuntoUrl = this.sanitizer.bypassSecurityTrustResourceUrl(blobUrl);
        return;
      } catch {
        this.recursoAdjuntoUrl = this.sanitizer.bypassSecurityTrustResourceUrl(doc.base64Data);
        return;
      }
    }

    if (doc.url) {
      let previewUrl = doc.url;
      // Convertir enlace de Google Drive (/view) al visor embebido (/preview)
      const matchDrive = doc.url.match(/\/file\/d\/([^/]+)/);
      if (matchDrive && matchDrive[1]) {
        previewUrl = `https://drive.google.com/file/d/${matchDrive[1]}/preview`;
      }
      this.recursoAdjuntoUrl = this.sanitizer.bypassSecurityTrustResourceUrl(previewUrl);
    }
  }

  async enviarAlCorreo(): Promise<void> {
    if (!this.solicitud || this.enviandoCorreo) return;
    this.enviandoCorreo = true;
    this.mensajeExitoCorreo = '';
    this.mensajeErrorCorreo = '';

    try {
      const pdfBase64 = this.pdfService.obtenerBase64Pdf(this.solicitud);
      const res = await this.archivoService.enviarConstanciaPorCorreo(this.solicitud, pdfBase64);
      if (res.ok) {
        this.correoEnviado = true;
        this.mensajeExitoCorreo = `Constancia en PDF enviada correctamente al correo: ${this.solicitud.email}`;
      } else {
        this.mensajeErrorCorreo = res.error || 'No se pudo enviar la constancia al correo.';
      }
    } catch {
      this.mensajeErrorCorreo = 'Ocurrió un error al enviar la constancia al correo.';
    } finally {
      this.enviandoCorreo = false;
    }
  }

  descargar(): void {
    if (this.documento) {
      if (this.documento.base64Data) {
        const link = document.createElement('a');
        link.href = this.documento.base64Data;
        link.download = this.documento.nombreArchivo || 'documento.pdf';
        link.click();
        return;
      }
      if (this.documento.downloadUrl) {
        window.open(this.documento.downloadUrl, '_blank');
        return;
      }
      if (this.documento.url) {
        window.open(this.documento.url, '_blank');
        return;
      }
    }
    if (this.solicitud) {
      this.pdfService.descargarConstanciaPdf(this.solicitud);
    }
  }

  imprimir(): void {
    if (this.documento) {
      if (this.documento.base64Data) {
        this.imprimirBase64(this.documento.base64Data, this.documento.mimeType);
        return;
      }
      if (this.documento.url) {
        this.imprimirUrlDirecta(this.documento.url);
        return;
      }
    }
    if (!this.solicitud) return;
    const doc = this.pdfService.generarDocumentoPdf(this.solicitud);
    const blob = doc.output('blob');
    this.imprimirBlobDirecto(blob);
  }

  /** Abre la impresora directamente mediante un iframe oculto para una URL */
  private imprimirUrlDirecta(url: string): void {
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.src = url;
      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch {
            // Si hay restricción cross-origin en el iframe
            window.print();
          }
        }, 500);
      };
      document.body.appendChild(iframe);
      setTimeout(() => iframe.remove(), 120000);
    } catch {
      window.print();
    }
  }

  /** Abre la impresora directamente mediante un iframe oculto a partir de un Blob */
  private imprimirBlobDirecto(blob: Blob): void {
    try {
      const blobUrl = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.src = blobUrl;
      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch {
            window.print();
          }
        }, 500);
      };
      document.body.appendChild(iframe);
      setTimeout(() => {
        iframe.remove();
        URL.revokeObjectURL(blobUrl);
      }, 120000);
    } catch {
      window.print();
    }
  }

  /** Abre el cuadro de impresión del sistema (impresoras instaladas) para un PDF/imagen en base64. */
  private imprimirBase64(base64Data: string, mimeType?: string): void {
    try {
      const parts = base64Data.split(',');
      const raw = parts.length > 1 ? parts[1] : parts[0];
      const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType || 'application/pdf' }));

      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.src = blobUrl;
      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch {
            window.open(blobUrl, '_blank');
          }
        }, 500);
      };
      document.body.appendChild(iframe);
      setTimeout(() => {
        iframe.remove();
        URL.revokeObjectURL(blobUrl);
      }, 120000);
    } catch {
      this.descargar();
    }
  }

  formatearFecha(fecha: string): string {
    if (!fecha) return '';
    const str = String(fecha).trim();
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
}
