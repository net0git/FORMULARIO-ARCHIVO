import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PdfCensuraService, SujetoCensura, ResultadoAnalisisPdf } from '../../services/pdf-censura.service';

@Component({
  selector: 'app-censurar-pdf',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './censurar-pdf.component.html',
  styleUrls: ['./censurar-pdf.component.css']
})
export class CensurarPdfComponent implements OnDestroy {
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

  // Lista de datos detectados para censurar
  sujetos: SujetoCensura[] = [];
  nuevoTextoManual = '';
  nuevaCategoriaManual: 'DEMANDANTE' | 'DEMANDADO' | 'AGRAVIADO' | 'OTRO' = 'DEMANDANTE';
  censurarEtiquetas = false;

  // Estado de la censura aplicada
  censurando = false;
  censuraAplicada = false;
  totalCensurados = 0;

  // Visor de documentos
  vistaVisor: 'censurado' | 'original' = 'original';
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
    private sanitizer: DomSanitizer
  ) {}

  ngOnDestroy(): void {
    this.limpiarUrls();
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
      this.vistaVisor = 'original';

      // Analizar documento para extraer sujetos
      const resultado: ResultadoAnalisisPdf = await this.pdfCensuraService.analizarPdf(
        buffer,
        file.name,
        (msg, pct) => {
          this.progresoMensaje = msg;
          this.progresoPorcentaje = pct;
        }
      );

      this.numPaginas = resultado.numPaginas;
      this.sujetos = resultado.sujetos;
      this.fuePorOcr = resultado.fuePorOcr;
      this.analisisCompletado = true;
    } catch (err: any) {
      console.error('Error al procesar el archivo PDF:', err);
      alert('Ocurrió un error al analizar el PDF: ' + (err?.message || err));
    } finally {
      this.analizando = false;
    }
  }

  // =========================================================================
  // GESTIÓN DE SUJETOS Y TÉRMINOS A CENSURAR
  // =========================================================================
  seleccionarTodos(valor: boolean): void {
    this.sujetos.forEach(s => (s.seleccionado = valor));
  }

  get cantidadSeleccionados(): number {
    return this.sujetos.filter(s => s.seleccionado).length;
  }

  eliminarSujeto(index: number): void {
    this.sujetos.splice(index, 1);
  }

  agregarSujetoManual(): void {
    const texto = this.nuevoTextoManual.trim();
    if (!texto) return;

    this.sujetos.push({
      id: 'manual_' + Math.random().toString(36).substring(2, 9),
      categoria: this.nuevaCategoriaManual,
      etiqueta: this.nuevaCategoriaManual,
      valor: texto.toUpperCase(),
      seleccionado: true,
      censurarEtiqueta: false
    });

    this.nuevoTextoManual = '';
  }

  // =========================================================================
  // APLICAR CENSURA AL DOCUMENTO
  // =========================================================================
  async aplicarCensura(): Promise<void> {
    if (!this.rawPdfOriginalBytes) return;

    const seleccionados = this.sujetos.filter(s => s.seleccionado);
    if (seleccionados.length === 0) {
      alert('Por favor selecciona al menos un dato para censurar.');
      return;
    }

    try {
      this.censurando = true;
      const res = await this.pdfCensuraService.censurarPdf(
        this.rawPdfOriginalBytes,
        this.sujetos,
        {
          censurarEtiquetas: this.censurarEtiquetas,
          censurarTodasLasOcurrencias: true
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
