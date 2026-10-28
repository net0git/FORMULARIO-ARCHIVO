import { Injectable } from '@angular/core';
import { PDFDocument, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

export interface SujetoCensura {
  id: string;
  categoria: 'DEMANDANTE' | 'DEMANDADO' | 'AGRAVIADO' | 'DOMICILIO' | 'OTRO';
  valor: string;
  etiqueta?: string;
  seleccionado: boolean;
  censurarEtiqueta?: boolean;
  coincidencias?: number;
}

export interface BoundingBoxCensura {
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  texto: string;
}

export interface ResultadoAnalisisPdf {
  numPaginas: number;
  nombreArchivo: string;
  sujetos: SujetoCensura[];
  textoCompleto: string;
  fuePorOcr: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class PdfCensuraService {
  constructor() {
    if (typeof window !== 'undefined' && !(pdfjsLib as any).GlobalWorkerOptions.workerSrc) {
      (pdfjsLib as any).GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${(pdfjsLib as any).version || '3.11.174'}/pdf.worker.min.js`;
    }
  }

  /**
   * Analiza el archivo PDF (sea con texto digital o por OCR en caso de escaneo)
   */
  async analizarPdf(
    pdfBytes: ArrayBuffer,
    nombreArchivo: string,
    onProgreso?: (mensaje: string, porcentaje: number) => void
  ): Promise<ResultadoAnalisisPdf> {
    onProgreso?.('Cargando documento PDF...', 15);
    const doc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
    const numPaginas = doc.numPages;

    let textoTotal = '';
    const paginasTexto: { pagina: number; texto: string; items: any[] }[] = [];

    // 1. Extraer texto digital con PDF.js
    for (let i = 1; i <= numPaginas; i++) {
      onProgreso?.(`Leyendo página ${i} de ${numPaginas}...`, 20 + Math.round((i / numPaginas) * 35));
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const items = content.items.map((it: any) => ({
        str: it.str || '',
        transform: it.transform,
        width: it.width,
        height: it.height
      }));
      const textoPagina = items.map(it => it.str).join(' ');
      paginasTexto.push({ pagina: i, texto: textoPagina, items });
      textoTotal += '\n' + textoPagina;
    }

    let fuePorOcr = false;
    let sujetos = this.extraerSujetosDesdeTexto(textoTotal);

    // 2. Si no se encontró ningún sujeto o el texto digital es casi nulo (documento escaneado como imagen)
    if (sujetos.length === 0 || textoTotal.trim().length < 80) {
      onProgreso?.('Detectando documento escaneado. Iniciando OCR...', 60);
      try {
        const ocrTexto = await this.ejecutarOcrPrimeraPagina(doc, onProgreso);
        if (ocrTexto && ocrTexto.trim().length > 0) {
          fuePorOcr = true;
          textoTotal = ocrTexto + '\n' + textoTotal;
          sujetos = this.extraerSujetosDesdeTexto(ocrTexto);
        }
      } catch (err) {
        console.warn('No se pudo ejecutar OCR secundario:', err);
      }
    }

    onProgreso?.('Análisis finalizado.', 100);

    return {
      numPaginas,
      nombreArchivo,
      sujetos,
      textoCompleto: textoTotal,
      fuePorOcr
    };
  }

  /**
   * Extrae los sujetos procesales (DEMANDANTE, DEMANDADO, AGRAVIADO, etc.) del texto plano
   */
  extraerSujetosDesdeTexto(texto: string): SujetoCensura[] {
    const lineas = texto
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

    const sujetos: SujetoCensura[] = [];

    const patrones = [
      {
        key: 'DEMANDANTE' as const,
        etiqueta: 'DEMANDANTE',
        regex: /^(?:SUJETOS\s+PROCESALES\s+)?DEMANDANTE(?:S)?(?:\s*[:\-]\s*|\s+|$)/i
      },
      {
        key: 'DEMANDADO' as const,
        etiqueta: 'DEMANDADO',
        regex: /^(?:SUJETOS\s+PROCESALES\s+)?(?:DEMANDADO|IMPUTADO)(?:S)?(?:\s*[:\-]\s*|\s+|$)/i
      },
      {
        key: 'AGRAVIADO' as const,
        etiqueta: 'AGRAVIADO',
        regex: /^(?:SUJETOS\s+PROCESALES\s+)?(?:AGRAVIADO|VICTIMA)(?:S)?(?:\s*[:\-]\s*|\s+|$)/i
      }
    ];

    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i];

      for (const pat of patrones) {
        if (pat.regex.test(linea)) {
          let valor = linea.replace(pat.regex, '').trim();

          // Si el nombre viene en la siguiente línea (común en OCR)
          if (!valor && i + 1 < lineas.length) {
            const sig = lineas[i + 1];
            if (!patrones.some(p => p.regex.test(sig)) && !/^domic/i.test(sig) && !/^exp/i.test(sig)) {
              valor = sig;
            }
          }

          // Extraer Domicilio Legal si está presente en la misma línea o siguiente
          let domicilio = '';
          const matchDomic = valor.match(/Domic(?:ilio)?\s*(?:Legal|\.)?\s*[:\-]?\s*([^\r\n]+)/i);
          if (matchDomic) {
            domicilio = matchDomic[1].trim();
            valor = valor.split(/Domic(?:ilio)?/i)[0].trim();
          }

          valor = valor.replace(/^[:\-\s]+|[:\-\s]+$/g, '').trim();

          // Filtrar valores no útiles
          if (valor && valor.length > 2 && !/^<no definido>/i.test(valor)) {
            const yaExiste = sujetos.some(
              s => s.categoria === pat.key && s.valor.toLowerCase() === valor.toLowerCase()
            );
            if (!yaExiste) {
              sujetos.push({
                id: 'suj_' + Math.random().toString(36).substring(2, 9),
                categoria: pat.key,
                etiqueta: pat.etiqueta,
                valor: valor.toUpperCase(),
                seleccionado: true,
                censurarEtiqueta: false
              });
            }
          }

          // Si se detectó domicilio válido (no "<No Definido>"), agregar como elemento opcional
          if (domicilio && !/^<no definido>/i.test(domicilio) && domicilio.length > 3) {
            const yaExisteDom = sujetos.some(
              s => s.categoria === 'DOMICILIO' && s.valor.toLowerCase() === domicilio.toLowerCase()
            );
            if (!yaExisteDom) {
              sujetos.push({
                id: 'dom_' + Math.random().toString(36).substring(2, 9),
                categoria: 'DOMICILIO',
                etiqueta: 'DOMICILIO',
                valor: domicilio.toUpperCase(),
                seleccionado: false,
                censurarEtiqueta: false
              });
            }
          }
        }
      }
    }

    return sujetos;
  }

  /**
   * Ejecuta OCR sobre la portada / primera página con Tesseract.js (para escaneados de imagen pura)
   */
  private async ejecutarOcrPrimeraPagina(
    doc: any,
    onProgreso?: (mensaje: string, porcentaje: number) => void
  ): Promise<string> {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 }); // Alta resolución para OCR preciso

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    await page.render({ canvasContext: ctx, viewport }).promise;

    onProgreso?.('Analizando imagen con motor OCR...', 75);

    const Tesseract = await import('tesseract.js');
    const resultado = await Tesseract.recognize(canvas, 'spa', {
      logger: m => {
        if (m.status === 'recognizing text' && m.progress) {
          onProgreso?.(`Procesando OCR: ${Math.round(m.progress * 100)}%`, 75 + Math.round(m.progress * 20));
        }
      }
    });

    return resultado.data.text || '';
  }

  /**
   * Aplica la censura con rectángulos negros sobre el PDF original
   */
  async censurarPdf(
    pdfOriginalBytes: ArrayBuffer,
    sujetosACensurar: SujetoCensura[],
    opciones: {
      censurarTodasLasOcurrencias?: boolean;
      censurarEtiquetas?: boolean;
      colorHex?: string;
    } = {}
  ): Promise<{ pdfBytes: Uint8Array; totalCoincidencias: number }> {
    const { censurarTodasLasOcurrencias = true, censurarEtiquetas = false } = opciones;

    const terminosValidos = sujetosACensurar
      .filter(s => s.seleccionado && s.valor && s.valor.trim().length > 1)
      .map(s => ({
        valor: s.valor.trim(),
        etiqueta: s.etiqueta,
        censurarEtiqueta: s.censurarEtiqueta || censurarEtiquetas
      }));

    if (terminosValidos.length === 0) {
      return { pdfBytes: new Uint8Array(pdfOriginalBytes), totalCoincidencias: 0 };
    }

    // 1. Cargar el documento tanto en PDF.js (para extraer coordenadas) como en pdf-lib (para modificarlo)
    const docPdfJs = await pdfjsLib.getDocument({ data: pdfOriginalBytes }).promise;
    const pdfLibDoc = await PDFDocument.load(pdfOriginalBytes);
    const numPaginas = docPdfJs.numPages;

    let totalCoincidencias = 0;

    for (let pageNum = 1; pageNum <= numPaginas; pageNum++) {
      const pagePdfJs = await docPdfJs.getPage(pageNum);
      const textContent = await pagePdfJs.getTextContent();
      const pagePdfLib = pdfLibDoc.getPage(pageNum - 1);
      const { width: pageWidth, height: pageHeight } = pagePdfLib.getSize();

      const items: { str: string; tx: number; ty: number; w: number; h: number }[] = [];

      for (const rawItem of textContent.items as any[]) {
        if (!rawItem.str || !rawItem.transform) continue;
        const tx = rawItem.transform[4];
        const ty = rawItem.transform[5];
        const w = rawItem.width || 0;
        const h = rawItem.height || Math.abs(rawItem.transform[0]) || 12;

        items.push({
          str: rawItem.str,
          tx,
          ty,
          w,
          h
        });
      }

      // Buscar coincidencias de cada término
      for (const t of terminosValidos) {
        // Palabras que componen el término
        const palabras = t.valor.split(/\s+/).filter(p => p.length > 1);

        // Coincidencia por línea o frase completa
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const textoItem = this.normalizarTexto(item.str);
          const terminoNorm = this.normalizarTexto(t.valor);

          let coincide = false;
          let boxX = item.tx;
          let boxY = item.ty;
          let boxW = item.w;
          let boxH = item.h;

          // Si el item contiene el término completo
          if (textoItem.includes(terminoNorm)) {
            coincide = true;
          } else {
            // O si coincide con las palabras clave principales del nombre
            const coincidePalabras = palabras.every(p => textoItem.includes(this.normalizarTexto(p)));
            if (coincidePalabras && palabras.length > 0) {
              coincide = true;
            }
          }

          // Si coincide, dibujar recuadro negro
          if (coincide) {
            totalCoincidencias++;
            const padding = 3;
            pagePdfLib.drawRectangle({
              x: Math.max(0, boxX - padding),
              y: Math.max(0, boxY - padding),
              width: Math.min(pageWidth - boxX, boxW + padding * 2),
              height: boxH + padding * 2,
              color: rgb(0, 0, 0),
              opacity: 1.0
            });
          }

          // Si también se debe censurar la etiqueta correspondiente (ej: DEMANDANTE:)
          if (t.censurarEtiqueta && t.etiqueta) {
            const etiqNorm = this.normalizarTexto(t.etiqueta);
            if (textoItem.includes(etiqNorm)) {
              totalCoincidencias++;
              const padding = 2;
              pagePdfLib.drawRectangle({
                x: Math.max(0, item.tx - padding),
                y: Math.max(0, item.ty - padding),
                width: Math.min(pageWidth - item.tx, item.w + padding * 2),
                height: item.h + padding * 2,
                color: rgb(0, 0, 0),
                opacity: 1.0
              });
            }
          }
        }
      }

      // Si no hubo coincidencia por items individuales (por ejemplo porque el texto viene fragmentado),
      // buscar por subsecuencias de items contiguos
      for (const t of terminosValidos) {
        const terminoNorm = this.normalizarTexto(t.valor);
        for (let i = 0; i < items.length; i++) {
          let accum = '';
          let minX = items[i].tx;
          let maxX = items[i].tx + items[i].w;
          let minY = items[i].ty;
          let maxH = items[i].h;

          for (let j = i; j < Math.min(items.length, i + 8); j++) {
            accum += ' ' + this.normalizarTexto(items[j].str);
            accum = accum.trim();
            minX = Math.min(minX, items[j].tx);
            maxX = Math.max(maxX, items[j].tx + items[j].w);
            minY = Math.min(minY, items[j].ty);
            maxH = Math.max(maxH, items[j].h);

            if (accum.includes(terminoNorm)) {
              totalCoincidencias++;
              const padding = 3;
              pagePdfLib.drawRectangle({
                x: Math.max(0, minX - padding),
                y: Math.max(0, minY - padding),
                width: Math.min(pageWidth - minX, (maxX - minX) + padding * 2),
                height: maxH + padding * 2,
                color: rgb(0, 0, 0),
                opacity: 1.0
              });
              break;
            }
          }
        }
      }
    }

    const pdfModificadoBytes = await pdfLibDoc.save();
    return {
      pdfBytes: pdfModificadoBytes,
      totalCoincidencias
    };
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
