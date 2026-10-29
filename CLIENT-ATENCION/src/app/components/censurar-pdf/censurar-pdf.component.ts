import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import * as pdfjsLib from 'pdfjs-dist';
import {
  PdfCensuraService,
  SujetoCensura,
  ResultadoAnalisisPdf,
  CategoriaCensura,
  RecuadroManualCensura
} from '../../services/pdf-censura.service';
import { IaExpedienteService } from '../../services/ia-expediente.service';

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

  // Lista de datos detectados para censurar
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

  // Visor de documentos
  vistaVisor: 'manual' | 'original' | 'censurado' = 'manual';
  pdfOriginalUrl: SafeResourceUrl | null = null;
  pdfCensuradoUrl: SafeResourceUrl | null = null;
  private pdfOriginalBlob: Blob | null = null;
  private pdfCensuradoBlob: Blob | null = null;
  private rawPdfOriginalBytes: ArrayBuffer | null = null;
  private rawPdfCensuradoBytes: Uint8Array | null = null;

  // Objetos URL para limpiar en ngOnDestroy
  private objectUrlsToRevoke: string[] = [];

  constructor(
    private pdfCensuraService: PdfCensuraService,
    public iaService: IaExpedienteService,
    private sanitizer: DomSanitizer
  ) {}

  async ngOnInit(): Promise<void> {
    await this.verificarIaLocal();
  }

  ngAfterViewChecked(): void {
    if (this.canvasListoParaRender && this.pdfCanvasRef && this.vistaVisor === 'manual' && this.rawPdfOriginalBytes) {
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
    this.limpiarUrls();
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

      // Crear URL para el visor original
      this.pdfOriginalBlob = new Blob([buffer], { type: 'application/pdf' });
      const origUrl = URL.createObjectURL(this.pdfOriginalBlob);
      this.objectUrlsToRevoke.push(origUrl);
      this.pdfOriginalUrl = this.sanitizer.bypassSecurityTrustResourceUrl(origUrl);

      // Cargar instancia de PDF.js para renderizar páginas en modo manual
      const dataParaJs = new Uint8Array(buffer.slice(0));
      this.pdfDocJsInstance = await pdfjsLib.getDocument({ data: dataParaJs }).promise;
      this.totalPaginasManual = this.pdfDocJsInstance.numPages;
      this.paginaActualManual = 1;

      // Activar vista manual por defecto para permitir dibujar inmediatamente
      this.vistaVisor = 'manual';
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
              const yaExiste = this.sujetos.some(
                s => s.valor.toLowerCase() === sIa.valor.toLowerCase() ||
                     (s.campo && sIa.campo && s.campo === sIa.campo)
              );
              if (!yaExiste) {
                this.sujetos.push(sIa);
              }
            }
          }
        } catch (iaErr) {
          console.warn('No se pudo completar el análisis con IA (se conservan reglas):', iaErr);
        }
      }

      this.analisisCompletado = true;
    } catch (err: any) {
      console.error('Error al procesar el archivo PDF:', err);
      alert('Ocurrió un error al analizar el PDF: ' + (err?.message || err));
    } finally {
      this.analizando = false;
    }
  }

  // =========================================================================
  // NAVEGACIÓN Y RENDERIZADO DEL VISOR MANUAL (CANVAS)
  // =========================================================================
  cambiarVistaVisor(vista: 'manual' | 'original' | 'censurado'): void {
    this.vistaVisor = vista;
    if (vista === 'manual') {
      this.canvasListoParaRender = true;
    }
  }

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
    } catch (err) {
      console.error('Error renderizando página manual en canvas:', err);
    } finally {
      this.renderizandoPaginaManual = false;
    }
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
    }

    this.cajaTemporal = null;
  }

  get recuadrosPaginaActual(): RecuadroManualCensura[] {
    return this.recuadrosManuales.filter(r => r.pagina === this.paginaActualManual);
  }

  eliminarRecuadroManual(id: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    const idx = this.recuadrosManuales.findIndex(r => r.id === id);
    if (idx !== -1) {
      this.recuadrosManuales.splice(idx, 1);
    }
  }

  deshacerUltimoRecuadro(): void {
    if (this.recuadrosManuales.length > 0) {
      this.recuadrosManuales.pop();
    }
  }

  limpiarRecuadrosPaginaActual(): void {
    this.recuadrosManuales = this.recuadrosManuales.filter(r => r.pagina !== this.paginaActualManual);
  }

  limpiarTodosLosRecuadrosManuales(): void {
    this.recuadrosManuales = [];
  }

  // =========================================================================
  // GESTIÓN DE SUJETOS Y TÉRMINOS A CENSURAR
  // =========================================================================
  get sujetosPrincipales(): SujetoCensura[] {
    return this.sujetos.filter(s => !s.esDatoPersonal);
  }

  get datosPersonales(): SujetoCensura[] {
    return this.sujetos.filter(s => s.esDatoPersonal);
  }

  seleccionarTodos(valor: boolean): void {
    this.sujetos.forEach(s => (s.seleccionado = valor));
  }

  seleccionarPorGrupo(tipo: 'sujetos' | 'personales', valor: boolean): void {
    this.sujetos.forEach(s => {
      if (tipo === 'sujetos' && !s.esDatoPersonal) {
        s.seleccionado = valor;
      } else if (tipo === 'personales' && s.esDatoPersonal) {
        s.seleccionado = valor;
      }
    });
  }

  get cantidadSeleccionados(): number {
    return this.sujetos.filter(s => s.seleccionado).length;
  }

  get totalElementosACensurar(): number {
    return this.cantidadSeleccionados + this.recuadrosManuales.length;
  }

  eliminarSujeto(id: string): void {
    const idx = this.sujetos.findIndex(s => s.id === id);
    if (idx !== -1) {
      this.sujetos.splice(idx, 1);
    }
  }

  agregarSujetoManual(): void {
    const texto = this.nuevoTextoManual.trim();
    if (!texto) return;

    const variantes = this.pdfCensuraService.generarVariantesNombre(texto);
    const esPersonal = ['DOMICILIO', 'TELEFONO', 'DNI', 'DATO_PERSONAL'].includes(this.nuevaCategoriaManual);

    this.sujetos.push({
      id: 'manual_' + Math.random().toString(36).substring(2, 9),
      categoria: this.nuevaCategoriaManual,
      campo: this.nuevaCategoriaManual,
      etiqueta: this.nuevaCategoriaManual,
      valor: texto.toUpperCase(),
      variantes,
      seleccionado: true,
      censurarEtiqueta: false,
      esDatoPersonal: esPersonal
    });

    this.nuevoTextoManual = '';
  }

  // =========================================================================
  // APLICAR CENSURA AL DOCUMENTO
  // =========================================================================
  async aplicarCensura(): Promise<void> {
    if (!this.archivoCargado && !this.rawPdfOriginalBytes) return;

    const seleccionados = this.sujetos.filter(s => s.seleccionado);
    if (seleccionados.length === 0 && this.recuadrosManuales.length === 0) {
      alert('Por favor selecciona al menos un dato o dibuja un recuadro de censura manual.');
      return;
    }

    try {
      this.censurando = true;

      // Obtener siempre un buffer fresco o clonado para evitar "detached ArrayBuffer"
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

      // Crear URL para el visor censurado
      this.pdfCensuradoBlob = new Blob([res.pdfBytes], { type: 'application/pdf' });
      const censUrl = URL.createObjectURL(this.pdfCensuradoBlob);
      this.objectUrlsToRevoke.push(censUrl);
      this.pdfCensuradoUrl = this.sanitizer.bypassSecurityTrustResourceUrl(censUrl);

      // Cambiar automáticamente la vista del visor a "censurado"
      this.vistaVisor = 'censurado';
    } catch (err: any) {
      console.error('Error al censurar el PDF:', err);
      alert('Ocurrió un error al aplicar la censura en el documento: ' + (err?.message || err));
    } finally {
      this.censurando = false;
    }
  }

  descargarPdfCensurado(): void {
    if (!this.rawPdfCensuradoBytes) return;

    const blob = new Blob([this.rawPdfCensuradoBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = this.nombreArchivo.replace(/\.pdf$/i, '');
    a.download = `${baseName}_CENSURADO.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  abrirEnNuevaVentana(): void {
    const blob = this.vistaVisor === 'censurado' ? this.pdfCensuradoBlob : this.pdfOriginalBlob;
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  restablecer(): void {
    this.limpiarEstado();
  }

  private limpiarEstado(): void {
    this.limpiarUrls();
    this.archivoCargado = null;
    this.nombreArchivo = '';
    this.tamanoArchivo = '';
    this.numPaginas = 0;
    this.sujetos = [];
    this.recuadrosManuales = [];
    this.paginaActualManual = 1;
    this.totalPaginasManual = 1;
    this.pdfDocJsInstance = null;
    this.analizando = false;
    this.analisisCompletado = false;
    this.censurando = false;
    this.censuraAplicada = false;
    this.totalCensurados = 0;
    this.pdfOriginalUrl = null;
    this.pdfCensuradoUrl = null;
    this.pdfOriginalBlob = null;
    this.pdfCensuradoBlob = null;
    this.rawPdfOriginalBytes = null;
    this.rawPdfCensuradoBytes = null;
    this.vistaVisor = 'manual';
    this.cajaTemporal = null;
  }

  private limpiarUrls(): void {
    this.objectUrlsToRevoke.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {}
    });
    this.objectUrlsToRevoke = [];
  }
}
