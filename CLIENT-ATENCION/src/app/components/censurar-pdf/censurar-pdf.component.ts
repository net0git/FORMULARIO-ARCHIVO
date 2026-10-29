import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as pdfjsLib from 'pdfjs-dist';
import {
  PdfCensuraService,
  SujetoCensura,
  ResultadoAnalisisPdf,
  CategoriaCensura,
  RecuadroManualCensura
} from '../../services/pdf-censura.service';
import { IaExpedienteService } from '../../services/ia-expediente.service';

export interface CajaCensuraVisual {
  id: string;
  tipo: 'sujeto' | 'dato_personal' | 'manual';
  sujetoId?: string;
  datoPersonalId?: string;
  recuadroManualId?: string;
  etiqueta?: string;
  valorTexto?: string;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

@Component({
  selector: 'app-censurar-pdf',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './censurar-pdf.component.html',
  styleUrls: ['./censurar-pdf.component.css']
})
export class CensurarPdfComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('pdfCanvasManual') pdfCanvasRef?: ElementRef<HTMLCanvasElement>;

  // Estado del archivo
  archivoCargado: File | null = null;
  nombreArchivo = '';
  tamanoArchivo = '';
  numPaginas = 0;
  isDragging = false;

  // Estado del análisis
  analizando = false;
  progresoMensaje = '';
  progresoPorcentaje = 0;
  analisisCompletado = false;
  fuePorOcr = false;

  // Estado de IA Local (Ollama)
  ollamaConectado = false;
  usarIaSiDisponible = true;
  estadoIaMensaje = 'Verificando IA local...';
  modelosIa: string[] = [];

  // Lista de sujetos procesales (cada uno contiene anidados sus datos personales)
  sujetos: SujetoCensura[] = [];
  nuevoTextoManual = '';
  nuevaCategoriaManual: CategoriaCensura = 'DEMANDANTE';
  censurarEtiquetas = false;

  // Recuadros de censura manual dibujados con el cursor
  recuadrosManuales: RecuadroManualCensura[] = [];
  paginaActualManual = 1;
  totalPaginasManual = 1;
  escalaManual = 1.25;
  renderizandoPaginaManual = false;
  private canvasListoParaRender = false;
  private pdfDocJsInstance: any = null;

  // Cajas rojas translúcidas que se van a censurar en la página activa
  cajasVisiblesPagina: CajaCensuraVisual[] = [];

  // Estado del trazado interactivo
  dibujando = false;
  private startX = 0;
  private startY = 0;
  cajaTemporal: { x: number; y: number; width: number; height: number } | null = null;

  // Dimensiones para mapeo de coordenadas
  anchoPaginaPdfPuntos = 595.28;
  altoPaginaPdfPuntos = 841.89;
  anchoCanvasActual = 0;
  altoCanvasActual = 0;

  // Estado de la censura aplicada
  censurando = false;
  censuraAplicada = false;
  totalCensurados = 0;

  private rawPdfOriginalBytes: ArrayBuffer | null = null;
  private rawPdfCensuradoBytes: Uint8Array | null = null;

  constructor(
    private pdfCensuraService: PdfCensuraService,
    public iaService: IaExpedienteService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.verificarIaLocal();
  }

  ngAfterViewChecked(): void {
    if (this.canvasListoParaRender && this.pdfCanvasRef && this.rawPdfOriginalBytes) {
      this.canvasListoParaRender = false;
      this.renderizarPaginaManual();
    }
  }

  async verificarIaLocal(): Promise<void> {
    const res = await this.iaService.verificarConexion();
    this.ollamaConectado = res.conectado;
    this.modelosIa = res.modelos;
    this.estadoIaMensaje = res.mensaje;
  }

  ngOnDestroy(): void {
    this.pdfDocJsInstance = null;
  }

  // =========================================================================
  // GESTIÓN DE DRAG & DROP Y SELECCIÓN DE ARCHIVOS
  // =========================================================================
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;

    if (event.dataTransfer && event.dataTransfer.files.length > 0) {
      const file = event.dataTransfer.files[0];
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        this.procesarArchivo(file);
      } else {
        alert('Por favor seleccione un archivo en formato PDF.');
      }
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.procesarArchivo(file);
    }
  }

  async procesarArchivo(file: File): Promise<void> {
    this.limpiarEstado();
    this.archivoCargado = file;
    this.nombreArchivo = file.name;
    this.tamanoArchivo = (file.size / 1024 / 1024).toFixed(2) + ' MB';

    try {
      this.analizando = true;
      this.progresoMensaje = 'Leyendo archivo PDF...';
      this.progresoPorcentaje = 10;

      const buffer = await file.arrayBuffer();
      this.rawPdfOriginalBytes = buffer;

      // Cargar instancia de PDF.js para renderizar páginas
      const dataParaJs = new Uint8Array(buffer.slice(0));
      this.pdfDocJsInstance = await pdfjsLib.getDocument({ data: dataParaJs }).promise;
      this.totalPaginasManual = this.pdfDocJsInstance.numPages;
      this.paginaActualManual = 1;

      this.canvasListoParaRender = true;

      // Analizar documento para extraer sujetos pasando una copia del buffer
      const resultado: ResultadoAnalisisPdf = await this.pdfCensuraService.analizarPdf(
        buffer.slice(0),
        file.name,
        (msg, pct) => {
          this.progresoMensaje = msg;
          this.progresoPorcentaje = pct;
        }
      );

      this.numPaginas = resultado.numPaginas;
      this.sujetos = resultado.sujetos;
      this.fuePorOcr = resultado.fuePorOcr;

      // Si la IA local (Ollama) está disponible y activada, enriquecer el análisis
      if (this.ollamaConectado && this.usarIaSiDisponible && resultado.textoCompleto) {
        try {
          this.progresoMensaje = 'Analizando con IA local (Llama 3.2)...';
          this.progresoPorcentaje = 85;

          const sujetosIa = await this.iaService.analizarExpedienteConIa(
            resultado.textoCompleto,
            msg => (this.progresoMensaje = msg)
          );

          if (sujetosIa && sujetosIa.length > 0) {
            for (const sIa of sujetosIa) {
              const existente = this.sujetos.find(
                s => s.categoria === sIa.categoria || this.pdfCensuraService.sonMismoNombre(s.valor, sIa.valor)
              );

              if (existente) {
                // Fusionar datos personales anidados sin duplicar
                if (sIa.datosPersonales && sIa.datosPersonales.length > 0) {
                  existente.datosPersonales = existente.datosPersonales || [];
                  for (const dpIa of sIa.datosPersonales) {
                    const yaTiene = existente.datosPersonales.some(
                      d => d.categoria === dpIa.categoria && d.valor.toLowerCase() === dpIa.valor.toLowerCase()
                    );
                    if (!yaTiene) {
                      dpIa.sujetoPadreId = existente.id;
                      existente.datosPersonales.push(dpIa);
                    }
                  }
                }
              } else {
                this.sujetos.push(sIa);
              }
            }
          }
        } catch (iaErr) {
          console.warn('No se pudo completar el análisis con IA (se conservan reglas):', iaErr);
        }
      }

      this.analisisCompletado = true;
      this.actualizarCajasVisiblesPagina();
    } catch (err: any) {
      console.error('Error al procesar el archivo PDF:', err);
      alert('Ocurrió un error al analizar el PDF: ' + (err?.message || err));
    } finally {
      this.analizando = false;
    }
  }

  // =========================================================================
  // NAVEGACIÓN Y RENDERIZADO DEL VISOR (CANVAS)
  // =========================================================================
  async renderizarPaginaManual(): Promise<void> {
    if (!this.rawPdfOriginalBytes || !this.pdfCanvasRef) return;
    this.renderizandoPaginaManual = true;

    try {
      const canvas = this.pdfCanvasRef.nativeElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (!this.pdfDocJsInstance) {
        const dataCopy = new Uint8Array(this.rawPdfOriginalBytes.slice(0));
        this.pdfDocJsInstance = await pdfjsLib.getDocument({ data: dataCopy }).promise;
        this.totalPaginasManual = this.pdfDocJsInstance.numPages;
      }

      const page = await this.pdfDocJsInstance.getPage(this.paginaActualManual);
      const viewport = page.getViewport({ scale: this.escalaManual });

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      this.anchoCanvasActual = viewport.width;
      this.altoCanvasActual = viewport.height;

      // Dimensiones originales en puntos PDF
      const originalViewport = page.getViewport({ scale: 1.0 });
      this.anchoPaginaPdfPuntos = originalViewport.width;
      this.altoPaginaPdfPuntos = originalViewport.height;

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };

      await page.render(renderContext).promise;

      // Calcular cajas rojas a censurar en esta página
      await this.actualizarCajasVisiblesPagina();
    } catch (err) {
      console.error('Error renderizando página manual en canvas:', err);
    } finally {
      this.renderizandoPaginaManual = false;
    }
  }

  /**
   * Identifica los recuadros rojos translúcidos en la página activa
   * Separando palabras de los nombres y buscando todas las combinaciones y cambios de orden
   */
  async actualizarCajasVisiblesPagina(): Promise<void> {
    const cajas: CajaCensuraVisual[] = [];

    // 1. Recuadros manuales dibujados para la página activa
    const manualesPagina = this.recuadrosManuales.filter(r => r.pagina === this.paginaActualManual);
    for (const m of manualesPagina) {
      if (m.pantalla) {
        cajas.push({
          id: m.id,
          tipo: 'manual',
          recuadroManualId: m.id,
          etiqueta: m.descripcion || 'Área Manual',
          xPct: m.pantalla.xPct,
          yPct: m.pantalla.yPct,
          wPct: m.pantalla.wPct,
          hPct: m.pantalla.hPct
        });
      }
    }

    // 2. Coincidencias en el texto de la página activa
    if (this.pdfDocJsInstance && this.anchoCanvasActual > 0) {
      try {
        const page = await this.pdfDocJsInstance.getPage(this.paginaActualManual);
        const viewport = page.getViewport({ scale: this.escalaManual });
        const textContent = await page.getTextContent();

        // Lista de items del texto con sus coordenadas
        const items: any[] = [];
        for (const it of textContent.items as any[]) {
          if (!it.str || !it.transform) continue;
          const strNorm = this.normalizarTexto(it.str);
          if (!strNorm) continue;
          items.push({
            str: it.str,
            strNorm,
            tx: it.transform[4],
            ty: it.transform[5],
            fontH: Math.hypot(it.transform[0], it.transform[1]) || it.height || 12,
            fontW: it.width || (it.str.length * 8)
          });
        }

        // A) Buscar nombres de sujetos procesales (separando palabras y combinaciones de orden)
        for (const s of this.sujetosPrincipales) {
          if (!s.seleccionado || !s.valor || s.valor.trim().length <= 1) continue;

          // Generar todas las combinaciones exactas de las palabras del nombre
          const combinaciones = this.pdfCensuraService.generarCombinacionesPalabras(s.valor);
          const combinacionesNorm = combinaciones.map(c => this.normalizarTexto(c)).filter(Boolean);
          const palabrasClave = this.normalizarTexto(s.valor).split(' ').filter(w => w.length > 2);

          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            let coincide = false;

            // Coincidencia con alguna permutación/combinación dentro del item
            for (const cNorm of combinacionesNorm) {
              if (this.pdfCensuraService.contieneTerminoExacto(item.strNorm, cNorm)) {
                coincide = true;
                break;
              }
            }

            // O si todas las palabras clave del nombre aparecen juntas en este item
            if (!coincide && palabrasClave.length >= 2) {
              if (palabrasClave.every(p => this.pdfCensuraService.contieneTerminoExacto(item.strNorm, p))) {
                coincide = true;
              }
            }

            if (coincide) {
              const [x1, y1] = viewport.convertToViewportPoint(item.tx, item.ty + item.fontH);
              const [x2, y2] = viewport.convertToViewportPoint(item.tx + item.fontW, item.ty);

              const left = Math.min(x1, x2) - 2;
              const top = Math.min(y1, y2) - 2;
              const width = Math.abs(x2 - x1) + 4;
              const height = Math.abs(y2 - y1) + 4;

              cajas.push({
                id: 'vis_suj_' + Math.random().toString(36).substring(2, 9),
                tipo: 'sujeto',
                sujetoId: s.id,
                etiqueta: s.etiqueta || s.categoria,
                valorTexto: item.str,
                xPct: Math.max(0, (left / viewport.width) * 100),
                yPct: Math.max(0, (top / viewport.height) * 100),
                wPct: Math.min(100, (width / viewport.width) * 100),
                hPct: Math.min(100, (height / viewport.height) * 100)
              });
            }
          }

          // B) Buscar también sus datos personales anidados
          if (s.datosPersonales && s.datosPersonales.length > 0) {
            for (const dp of s.datosPersonales) {
              if (!dp.seleccionado || !dp.valor || dp.valor.trim().length <= 1) continue;
              const dpNorm = this.normalizarTexto(dp.valor);
              if (dpNorm.length < 2) continue;

              for (const item of items) {
                if (this.pdfCensuraService.contieneTerminoExacto(item.strNorm, dp.valor)) {
                  const [x1, y1] = viewport.convertToViewportPoint(item.tx, item.ty + item.fontH);
                  const [x2, y2] = viewport.convertToViewportPoint(item.tx + item.fontW, item.ty);

                  const left = Math.min(x1, x2) - 2;
                  const top = Math.min(y1, y2) - 2;
                  const width = Math.abs(x2 - x1) + 4;
                  const height = Math.abs(y2 - y1) + 4;

                  cajas.push({
                    id: 'vis_dp_' + Math.random().toString(36).substring(2, 9),
                    tipo: 'dato_personal',
                    sujetoId: s.id,
                    datoPersonalId: dp.id,
                    etiqueta: dp.etiqueta || dp.categoria,
                    valorTexto: dp.valor,
                    xPct: Math.max(0, (left / viewport.width) * 100),
                    yPct: Math.max(0, (top / viewport.height) * 100),
                    wPct: Math.min(100, (width / viewport.width) * 100),
                    hPct: Math.min(100, (height / viewport.height) * 100)
                  });
                  break;
                }
              }
            }
          }
        }

        // C) Buscar datos personales huérfanos generales
        for (const g of this.datosPersonalesHuerfanos) {
          if (!g.seleccionado || !g.valor || g.valor.trim().length <= 1) continue;
          const gNorm = this.normalizarTexto(g.valor);
          if (gNorm.length < 2) continue;

          for (const item of items) {
            if (this.pdfCensuraService.contieneTerminoExacto(item.strNorm, g.valor)) {
              const [x1, y1] = viewport.convertToViewportPoint(item.tx, item.ty + item.fontH);
              const [x2, y2] = viewport.convertToViewportPoint(item.tx + item.fontW, item.ty);

              const left = Math.min(x1, x2) - 2;
              const top = Math.min(y1, y2) - 2;
              const width = Math.abs(x2 - x1) + 4;
              const height = Math.abs(y2 - y1) + 4;

              cajas.push({
                id: 'vis_gen_' + Math.random().toString(36).substring(2, 9),
                tipo: 'dato_personal',
                datoPersonalId: g.id,
                etiqueta: g.etiqueta || g.categoria,
                valorTexto: g.valor,
                xPct: Math.max(0, (left / viewport.width) * 100),
                yPct: Math.max(0, (top / viewport.height) * 100),
                wPct: Math.min(100, (width / viewport.width) * 100),
                hPct: Math.min(100, (height / viewport.height) * 100)
              });
              break;
            }
          }
        }
      } catch (err) {
        console.warn('Error calculando coincidencias en página:', err);
      }
    }

    this.cajasVisiblesPagina = cajas;
  }

  /**
   * Al hacer clic en el 'X' de un recuadro rojo en el visor
   */
  quitarCensuraDeCaja(caja: CajaCensuraVisual, event: Event): void {
    event.stopPropagation();
    event.preventDefault();

    if (caja.tipo === 'sujeto' && caja.sujetoId) {
      const sujeto = this.sujetos.find(s => s.id === caja.sujetoId);
      if (sujeto) {
        sujeto.seleccionado = false;
      }
    } else if (caja.tipo === 'dato_personal' && caja.datoPersonalId) {
      // Buscar en los datos anidados de cada sujeto
      for (const s of this.sujetos) {
        if (s.datosPersonales) {
          const dp = s.datosPersonales.find(d => d.id === caja.datoPersonalId);
          if (dp) {
            dp.seleccionado = false;
            break;
          }
        }
      }
      // O en huérfanos
      const h = this.sujetos.find(s => s.id === caja.datoPersonalId);
      if (h) h.seleccionado = false;
    } else if (caja.tipo === 'manual' && caja.recuadroManualId) {
      this.eliminarRecuadroManual(caja.recuadroManualId);
    }

    this.actualizarCajasVisiblesPagina();
  }

  irAPaginaManual(num: number): void {
    if (num < 1 || num > this.totalPaginasManual || num === this.paginaActualManual) return;
    this.paginaActualManual = num;
    this.renderizarPaginaManual();
  }

  paginaAnteriorManual(): void {
    if (this.paginaActualManual > 1) {
      this.irAPaginaManual(this.paginaActualManual - 1);
    }
  }

  paginaSiguienteManual(): void {
    if (this.paginaActualManual < this.totalPaginasManual) {
      this.irAPaginaManual(this.paginaActualManual + 1);
    }
  }

  cambiarZoomManual(delta: number): void {
    const nuevoZoom = Math.round((this.escalaManual + delta) * 100) / 100;
    if (nuevoZoom >= 0.5 && nuevoZoom <= 3.0) {
      this.escalaManual = nuevoZoom;
      this.renderizarPaginaManual();
    }
  }

  // =========================================================================
  // INTERACCIÓN DE DIBUJO CON EL MOUSE (DRAG TO REDACT)
  // =========================================================================
  iniciarDibujoManual(event: MouseEvent): void {
    event.preventDefault();
    const overlay = event.currentTarget as HTMLElement;
    const rect = overlay.getBoundingClientRect();

    this.startX = event.clientX - rect.left;
    this.startY = event.clientY - rect.top;
    this.dibujando = true;
    this.cajaTemporal = {
      x: this.startX,
      y: this.startY,
      width: 0,
      height: 0
    };
  }

  moverDibujoManual(event: MouseEvent): void {
    if (!this.dibujando) return;
    event.preventDefault();

    const overlay = event.currentTarget as HTMLElement;
    const rect = overlay.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const currentY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));

    this.cajaTemporal = {
      x: Math.min(this.startX, currentX),
      y: Math.min(this.startY, currentY),
      width: Math.abs(currentX - this.startX),
      height: Math.abs(currentY - this.startY)
    };
  }

  finalizarDibujoManual(event: MouseEvent): void {
    if (!this.dibujando) return;
    this.dibujando = false;

    if (this.cajaTemporal && this.cajaTemporal.width > 6 && this.cajaTemporal.height > 6 && this.anchoCanvasActual > 0) {
      const ratioX = this.anchoPaginaPdfPuntos / this.anchoCanvasActual;
      const ratioY = this.altoPaginaPdfPuntos / this.altoCanvasActual;

      const pdfX = this.cajaTemporal.x * ratioX;
      // En PDF-Lib el origen Y=0 es la parte inferior izquierda de la página
      const pdfY = this.altoPaginaPdfPuntos - ((this.cajaTemporal.y + this.cajaTemporal.height) * ratioY);
      const pdfW = this.cajaTemporal.width * ratioX;
      const pdfH = this.cajaTemporal.height * ratioY;

      // Coordenadas porcentuales para renderizado responsive sobre el overlay
      const xPct = (this.cajaTemporal.x / this.anchoCanvasActual) * 100;
      const yPct = (this.cajaTemporal.y / this.altoCanvasActual) * 100;
      const wPct = (this.cajaTemporal.width / this.anchoCanvasActual) * 100;
      const hPct = (this.cajaTemporal.height / this.altoCanvasActual) * 100;

      const nuevoRecuadro: RecuadroManualCensura = {
        id: 'rec_man_' + Math.random().toString(36).substring(2, 9),
        pagina: this.paginaActualManual,
        x: pdfX,
        y: pdfY,
        width: pdfW,
        height: pdfH,
        pantalla: {
          xPct,
          yPct,
          wPct,
          hPct
        },
        descripcion: `Pág. ${this.paginaActualManual} (#${this.recuadrosManuales.length + 1})`
      };

      this.recuadrosManuales.push(nuevoRecuadro);
      this.actualizarCajasVisiblesPagina();
    }

    this.cajaTemporal = null;
  }

  eliminarRecuadroManual(id: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    const idx = this.recuadrosManuales.findIndex(r => r.id === id);
    if (idx !== -1) {
      this.recuadrosManuales.splice(idx, 1);
      this.actualizarCajasVisiblesPagina();
    }
  }

  deshacerUltimoRecuadro(): void {
    if (this.recuadrosManuales.length > 0) {
      this.recuadrosManuales.pop();
      this.actualizarCajasVisiblesPagina();
    }
  }

  limpiarRecuadrosPaginaActual(): void {
    this.recuadrosManuales = this.recuadrosManuales.filter(r => r.pagina !== this.paginaActualManual);
    this.actualizarCajasVisiblesPagina();
  }

  limpiarTodosLosRecuadrosManuales(): void {
    this.recuadrosManuales = [];
    this.actualizarCajasVisiblesPagina();
  }

  // =========================================================================
  // GESTIÓN DE SUJETOS Y DATOS PERSONALES ANIDADOS
  // =========================================================================
  get sujetosPrincipales(): SujetoCensura[] {
    return this.sujetos.filter(s => !s.esDatoPersonal);
  }

  get datosPersonalesHuerfanos(): SujetoCensura[] {
    return this.sujetos.filter(s => s.esDatoPersonal && !s.sujetoPadreId);
  }

  toggleSujetoPadre(s: SujetoCensura): void {
    if (s.datosPersonales && s.datosPersonales.length > 0) {
      s.datosPersonales.forEach(d => (d.seleccionado = s.seleccionado));
    }
    this.actualizarCajasVisiblesPagina();
  }

  toggleDatoHijo(hijo: SujetoCensura, padre: SujetoCensura): void {
    this.actualizarCajasVisiblesPagina();
  }

  eliminarDatoHijo(padre: SujetoCensura, idHijo: string): void {
    if (padre.datosPersonales) {
      const idx = padre.datosPersonales.findIndex(d => d.id === idHijo);
      if (idx !== -1) {
        padre.datosPersonales.splice(idx, 1);
        this.actualizarCajasVisiblesPagina();
      }
    }
  }

  seleccionarTodos(valor: boolean): void {
    this.sujetos.forEach(s => {
      s.seleccionado = valor;
      if (s.datosPersonales) {
        s.datosPersonales.forEach(d => (d.seleccionado = valor));
      }
    });
    this.actualizarCajasVisiblesPagina();
  }

  onToggleSujeto(): void {
    this.actualizarCajasVisiblesPagina();
  }

  get cantidadSeleccionados(): number {
    let total = 0;
    for (const s of this.sujetos) {
      if (s.seleccionado) total++;
      if (s.datosPersonales) {
        total += s.datosPersonales.filter(d => d.seleccionado).length;
      }
    }
    return total;
  }

  get totalElementosACensurar(): number {
    return this.cantidadSeleccionados + this.recuadrosManuales.length;
  }

  eliminarSujeto(id: string): void {
    const idx = this.sujetos.findIndex(s => s.id === id);
    if (idx !== -1) {
      this.sujetos.splice(idx, 1);
      this.actualizarCajasVisiblesPagina();
    }
  }

  agregarSujetoManual(): void {
    const texto = this.nuevoTextoManual.trim();
    if (!texto) return;

    const esPersonal = ['DOMICILIO', 'TELEFONO', 'DNI', 'DATO_PERSONAL'].includes(this.nuevaCategoriaManual);

    if (esPersonal) {
      // Si hay al menos un sujeto procesal, sugerir agregarlo al primer sujeto o como huérfano
      this.sujetos.push({
        id: 'manual_' + Math.random().toString(36).substring(2, 9),
        categoria: this.nuevaCategoriaManual,
        campo: this.nuevaCategoriaManual,
        etiqueta: this.nuevaCategoriaManual,
        valor: texto,
        seleccionado: true,
        censurarEtiqueta: false,
        esDatoPersonal: true
      });
    } else {
      this.sujetos.push({
        id: 'manual_' + Math.random().toString(36).substring(2, 9),
        categoria: this.nuevaCategoriaManual,
        campo: this.nuevaCategoriaManual,
        etiqueta: this.nuevaCategoriaManual,
        valor: texto.toUpperCase(),
        seleccionado: true,
        censurarEtiqueta: false,
        esDatoPersonal: false,
        datosPersonales: []
      });
    }

    this.nuevoTextoManual = '';
    this.actualizarCajasVisiblesPagina();
  }

  // =========================================================================
  // BOTÓN FINAL: CENSURAR Y DESCARGAR
  // =========================================================================
  async censurarYDescargar(): Promise<void> {
    if (!this.archivoCargado && !this.rawPdfOriginalBytes) return;

    if (this.totalElementosACensurar === 0) {
      alert('Por favor selecciona al menos un dato o dibuja un área en el documento para censurar.');
      return;
    }

    try {
      this.censurando = true;

      // Buffer fresco o clonado
      const bytesOriginales = this.archivoCargado
        ? await this.archivoCargado.arrayBuffer()
        : this.rawPdfOriginalBytes!.slice(0);

      const res = await this.pdfCensuraService.censurarPdf(
        bytesOriginales,
        this.sujetos,
        {
          censurarEtiquetas: this.censurarEtiquetas,
          censurarTodasLasOcurrencias: true,
          recuadrosManuales: this.recuadrosManuales
        }
      );

      this.rawPdfCensuradoBytes = res.pdfBytes;
      this.totalCensurados = res.totalCoincidencias;
      this.censuraAplicada = true;

      // Descarga automática inmediata del PDF censurado
      const blob = new Blob([res.pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const baseName = this.nombreArchivo.replace(/\.pdf$/i, '');
      a.download = `${baseName}_CENSURADO.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err: any) {
      console.error('Error al censurar y descargar el PDF:', err);
      alert('Ocurrió un error al aplicar la censura en el documento: ' + (err?.message || err));
    } finally {
      this.censurando = false;
    }
  }

  restablecer(): void {
    this.limpiarEstado();
  }

  private limpiarEstado(): void {
    this.archivoCargado = null;
    this.nombreArchivo = '';
    this.tamanoArchivo = '';
    this.numPaginas = 0;
    this.sujetos = [];
    this.recuadrosManuales = [];
    this.cajasVisiblesPagina = [];
    this.paginaActualManual = 1;
    this.totalPaginasManual = 1;
    this.pdfDocJsInstance = null;
    this.analizando = false;
    this.analisisCompletado = false;
    this.censurando = false;
    this.censuraAplicada = false;
    this.totalCensurados = 0;
    this.rawPdfOriginalBytes = null;
    this.rawPdfCensuradoBytes = null;
    this.cajaTemporal = null;
  }

  private normalizarTexto(txt: string): string {
    return (txt || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
