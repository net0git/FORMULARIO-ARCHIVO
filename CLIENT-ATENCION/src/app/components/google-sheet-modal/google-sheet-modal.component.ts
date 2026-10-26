import { Component, EventEmitter, Output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ArchivoService } from '../../services/archivo.service';

@Component({
  selector: 'app-google-sheet-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="gs-overlay" (click)="cerrar.emit()">
      <div class="gs-modal fade-in" (click)="$event.stopPropagation()">
        <div class="gs-header">
          <div class="gs-title">
            <i class="fa-solid fa-table"></i>
            <span>Conexión con Hoja de Google Sheets y Google Drive</span>
          </div>
          <button class="gs-close" (click)="cerrar.emit()" title="Cerrar">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="gs-body">
          <div class="gs-status-banner" [class.connected]="estaConectado">
            <i class="fa-solid" [ngClass]="estaConectado ? 'fa-circle-check' : 'fa-circle-info'"></i>
            <div>
              <strong>Estado actual: {{ estaConectado ? 'CONECTADO A GOOGLE SHEETS' : 'PENDIENTE DE CONEXIÓN A GOOGLE SHEETS' }}</strong>
              <p>
                {{
                  estaConectado
                    ? 'Todas las solicitudes, usuarios y documentos adjuntos se gestionan en tiempo real desde tu Google Sheet y Google Drive.'
                    : 'Pega abajo la URL de tu aplicación web de Google Apps Script para conectar el sistema con tu hoja de cálculo y habilitar los usuarios de Google Sheets.'
                }}
              </p>
            </div>
          </div>

          <div class="gs-field">
            <label>URL de tu Aplicación Web de Google Apps Script (termina en <code>/exec</code>):</label>
            <input
              type="url"
              [(ngModel)]="sheetUrl"
              placeholder="https://script.google.com/macros/s/AKfycb.../exec"
              class="gs-input"
            />
          </div>

          <div *ngIf="mensajeEstado" class="gs-feedback" [class.ok]="exitoEstado">
            {{ mensajeEstado }}
          </div>

          <div class="gs-instructions">
            <h4><i class="fa-solid fa-list-check"></i> ¿Cómo conectar ambos proyectos (Internet y Red Local) a la misma hoja?</h4>
            <ol>
              <li>Crea una hoja en blanco en <a href="https://sheets.google.com" target="_blank" rel="noopener">Google Sheets</a> y entra a <strong>Extensiones &rarr; Apps Script</strong>.</li>
              <li>Pega el código del archivo <code>PLAN/google-apps-script/Code.gs</code> y ejecuta una vez <code>inicializarHojas</code>.</li>
              <li>Haz clic en <strong>Implementar &rarr; Nueva implementación &rarr; Aplicación web</strong> (Acceso: <em>Cualquier persona</em>) y pega aquí la URL generada.</li>
              <li>Para el formulario público en Internet, coloca esta misma URL en <code>CLIENT-FORMULARIO/public/config.json</code> (o usa el botón <strong>Descargar config.json</strong> abajo).</li>
            </ol>
          </div>
        </div>

        <div class="gs-footer">
          <button type="button" class="btn-secondary" (click)="limpiarConexion()" *ngIf="estaConectado">
            <i class="fa-solid fa-plug-circle-xmark"></i> Desconectar Hoja
          </button>
          <button type="button" class="btn-config-dl" (click)="descargarConfigJson()" *ngIf="sheetUrl.trim()">
            <i class="fa-solid fa-download"></i> Descargar config.json (Para Formulario Web)
          </button>
          <div class="gs-footer-right">
            <button type="button" class="btn-secondary" (click)="cerrar.emit()">Cerrar</button>
            <button type="button" class="btn-primary" (click)="guardarYProbar()" [disabled]="probando">
              <i class="fa-solid" [ngClass]="probando ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'"></i>
              {{ probando ? 'Conectando...' : 'Guardar y Sincronizar' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .gs-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      padding: 16px;
    }
    .gs-modal {
      background: #fff;
      width: 100%;
      max-width: 680px;
      border-radius: 6px;
      overflow: hidden;
      box-shadow: 0 15px 40px rgba(0, 0, 0, 0.35);
      border-top: 4px solid #0f9d58;
    }
    .gs-header {
      background: #7b1e22;
      color: #fff;
      padding: 14px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .gs-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 16px;
    }
    .gs-close {
      background: transparent;
      border: none;
      color: #fff;
      font-size: 18px;
    }
    .gs-body {
      padding: 20px;
    }
    .gs-status-banner {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      background: #fff8e5;
      border: 1px solid #f5d372;
      color: #6b5200;
      padding: 12px 15px;
      border-radius: 5px;
      margin-bottom: 16px;
      font-size: 13px;
    }
    .gs-status-banner.connected {
      background: #e6f7ed;
      border-color: #68c991;
      color: #0d5c2f;
    }
    .gs-status-banner i {
      font-size: 20px;
      margin-top: 2px;
    }
    .gs-status-banner p {
      margin-top: 4px;
      line-height: 1.4;
    }
    .gs-field label {
      display: block;
      font-weight: 600;
      margin-bottom: 6px;
      color: #333;
      font-size: 13px;
    }
    .gs-input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 13.5px;
    }
    .gs-input:focus {
      outline: none;
      border-color: #7b1e22;
      box-shadow: 0 0 0 2px rgba(123, 30, 34, 0.15);
    }
    .gs-feedback {
      margin-top: 12px;
      padding: 10px 12px;
      border-radius: 4px;
      background: #fdecea;
      color: #a91e1e;
      font-size: 13px;
      font-weight: 500;
    }
    .gs-feedback.ok {
      background: #e7f7ed;
      color: #156d3b;
    }
    .gs-instructions {
      margin-top: 18px;
      background: #f8f9fa;
      border: 1px solid #e3e6ea;
      border-radius: 5px;
      padding: 14px 16px;
      font-size: 12.5px;
    }
    .gs-instructions h4 {
      color: #7b1e22;
      margin-bottom: 8px;
      font-size: 13.5px;
    }
    .gs-instructions ol {
      padding-left: 18px;
    }
    .gs-instructions li {
      margin-bottom: 5px;
      line-height: 1.45;
    }
    .gs-footer {
      padding: 12px 20px;
      background: #f1f2f6;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid #ddd;
      flex-wrap: wrap;
      gap: 8px;
    }
    .gs-footer-right {
      display: flex;
      gap: 10px;
      margin-left: auto;
    }
    .btn-primary {
      background: #0f9d58;
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .btn-primary:hover {
      background: #0b8043;
    }
    .btn-secondary {
      background: #6c757d;
      color: #fff;
      border: none;
      padding: 8px 14px;
      border-radius: 4px;
      font-weight: 500;
    }
    .btn-secondary:hover {
      background: #5a6268;
    }
    .btn-config-dl {
      background: #1a73e8;
      color: #fff;
      border: none;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn-config-dl:hover {
      background: #1557b0;
    }
  `]
})
export class GoogleSheetModalComponent implements OnInit {
  @Output() cerrar = new EventEmitter<void>();

  sheetUrl = '';
  probando = false;
  mensajeEstado = '';
  exitoEstado = false;

  constructor(private archivoService: ArchivoService) {}

  ngOnInit(): void {
    this.sheetUrl = this.archivoService.obtenerGoogleSheetUrl();
  }

  get estaConectado(): boolean {
    return this.archivoService.estaConectadoAGoogleSheet();
  }

  async guardarYProbar(): Promise<void> {
    const limpia = (this.sheetUrl || '').trim();
    if (!limpia) {
      this.exitoEstado = false;
      this.mensajeEstado = 'Por favor ingresa una URL válida de Google Apps Script.';
      return;
    }
    this.probando = true;
    this.mensajeEstado = '';
    this.archivoService.guardarGoogleSheetUrl(limpia);
    const res = await this.archivoService.sincronizarDesdeGoogleSheet();
    this.probando = false;
    this.exitoEstado = res.ok;
    this.mensajeEstado = res.mensaje;
  }

  descargarConfigJson(): void {
    const contenido = JSON.stringify({ googleSheetUrl: (this.sheetUrl || '').trim() }, null, 2);
    const blob = new Blob([contenido], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'config.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  limpiarConexion(): void {
    this.sheetUrl = '';
    this.archivoService.guardarGoogleSheetUrl('');
    this.exitoEstado = true;
    this.mensajeEstado = 'Se desconectó la hoja de Google Sheets.';
  }
}
