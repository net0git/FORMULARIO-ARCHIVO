import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SolicitudArchivo } from '../../models/archivo.models';
import { PdfConstanciaService } from '../../services/pdf-constancia.service';
import { ArchivoService } from '../../services/archivo.service';

@Component({
  selector: 'app-pdf-viewer-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="pdf-overlay" *ngIf="solicitud" (click)="cerrar.emit()">
      <div class="pdf-window fade-in" (click)="$event.stopPropagation()">
        <div class="pdf-toolbar">
          <div class="pdf-toolbar-left">
            <i class="fa-solid fa-table-columns"></i>
            <i class="fa-solid fa-magnifying-glass"></i>
            <span class="pdf-page-indicator">Página 1 de 1</span>
            <span class="pdf-divider">|</span>
            <span class="pdf-zoom">Zoom Automático</span>
          </div>

          <div class="pdf-toolbar-title">
            CONSTANCIA DE SOLICITUD N° {{ solicitud.nroSolicitud }}
          </div>

          <div class="pdf-toolbar-actions">
            <button
              type="button"
              class="pdf-action-btn email-btn"
              [class.sent]="correoEnviado"
              *ngIf="solicitud.email"
              [disabled]="enviandoCorreo"
              (click)="enviarAlCorreo()"
              [title]="'Enviar constancia en PDF a: ' + solicitud.email"
            >
              <i class="fa-solid fa-spinner fa-spin" *ngIf="enviandoCorreo"></i>
              <i class="fa-solid fa-circle-check" *ngIf="!enviandoCorreo && correoEnviado"></i>
              <i class="fa-solid fa-envelope" *ngIf="!enviandoCorreo && !correoEnviado"></i>
              <span>
                {{ enviandoCorreo ? 'Enviando...' : (correoEnviado ? 'Enviado al correo' : 'Enviar al correo') }}
              </span>
            </button>
            <button type="button" class="pdf-action-btn" (click)="imprimir()" title="Imprimir Constancia">
              <i class="fa-solid fa-print"></i> Imprimir
            </button>
            <button type="button" class="pdf-action-btn primary" (click)="descargar()" title="Descargar PDF">
              <i class="fa-solid fa-download"></i> Descargar PDF
            </button>
            <button type="button" class="pdf-close-btn" (click)="cerrar.emit()" title="Cerrar">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <div class="pdf-email-banner ok" *ngIf="mensajeExitoCorreo">
          <i class="fa-solid fa-circle-check"></i>
          <span>{{ mensajeExitoCorreo }}</span>
        </div>
        <div class="pdf-email-banner err" *ngIf="mensajeErrorCorreo">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>{{ mensajeErrorCorreo }}</span>
        </div>

        <div class="pdf-canvas-bg">
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
            </div>

            <div class="a4-section" *ngIf="solicitud.documentos && solicitud.documentos.length > 0">
              <h3>Documentos Adjuntos (Foto / PDF)</h3>
              <div class="a4-row" *ngFor="let doc of solicitud.documentos; let i = index">
                <span class="a4-label">Adjunto {{ i + 1 }} ({{ doc.tipo }}):</span>
                <span class="a4-val">{{ doc.descripcion }} ({{ doc.nombreArchivo }})</span>
              </div>
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
      padding: 28px 16px;
      display: flex;
      justify-content: center;
      background: #525659;
    }
    .pdf-a4-page {
      background: #ffffff;
      width: 100%;
      max-width: 680px;
      min-height: 840px;
      padding: 46px 52px;
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
      color: #333;
      height: fit-content;
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
  `]
})
export class PdfViewerModalComponent implements OnChanges {
  @Input() solicitud: SolicitudArchivo | null = null;
  @Output() cerrar = new EventEmitter<void>();

  pdfUrl: SafeResourceUrl | null = null;
  enviandoCorreo = false;
  correoEnviado = false;
  mensajeExitoCorreo = '';
  mensajeErrorCorreo = '';

  constructor(
    private pdfService: PdfConstanciaService,
    private archivoService: ArchivoService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['solicitud'] && this.solicitud) {
      const url = this.pdfService.obtenerBlobUrl(this.solicitud);
      this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
      this.enviandoCorreo = false;
      this.correoEnviado = false;
      this.mensajeExitoCorreo = '';
      this.mensajeErrorCorreo = '';
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
    if (this.solicitud) {
      this.pdfService.descargarConstanciaPdf(this.solicitud);
    }
  }

  imprimir(): void {
    if (!this.solicitud) return;
    const doc = this.pdfService.generarDocumentoPdf(this.solicitud);
    doc.autoPrint();
    const blobUrl = doc.output('bloburl');
    window.open(blobUrl, '_blank');
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
