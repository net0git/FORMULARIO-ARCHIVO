import { Injectable } from '@angular/core';
import { PDFDocument, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

export type CategoriaCensura =
  | 'DEMANDANTE'
  | 'DEMANDADO'
  | 'AGRAVIADO'
  | 'DOMICILIO'
  | 'TELEFONO'
  | 'DNI'
  | 'DATO_PERSONAL'
  | 'OTRO';

export interface SujetoCensura {
  id: string;
  categoria: CategoriaCensura;
  campo?: string; // Ej: "AGRAVIADA: Teléfono", "DEMANDADO: Domicilio"
  valor: string;
  etiqueta?: string;
  seleccionado: boolean;
  censurarEtiqueta?: boolean;
  variantes?: string[]; // Ej: ["VICTORIA HINOJOSA PACCO", "HINOJOSA PACCO VICTORIA"]
  esDatoPersonal?: boolean;
}


export interface RecuadroManualCensura {
  id: string;
  pagina: number; // 1-indexado (número de página del PDF)
  x: number;      // Puntos PDF (origen inferior izquierdo)
  y: number;      // Puntos PDF
  width: number;  // Ancho en puntos PDF
  height: number; // Alto en puntos PDF
  pantalla?: {
    xPct: number; // Posición porcentual sobre el ancho de la página (0 a 100)
    yPct: number; // Posición porcentual sobre el alto de la página (0 a 100)
    wPct: number;
    hPct: number;
  };
  descripcion?: string;
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
    // Clonar el buffer para evitar que PDF.js lo desmonte (detached ArrayBuffer)
    const dataParaPdfJs = new Uint8Array(pdfBytes.slice(0));
    const doc = await pdfjsLib.getDocument({ data: dataParaPdfJs }).promise;
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
          sujetos = this.extraerSujetosDesdeTexto(textoTotal);
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
   * Extrae los sujetos procesales de la carátula y todos los DATOS PERSONALES DE LAS PARTES
   */
  extraerSujetosDesdeTexto(texto: string): SujetoCensura[] {
    const lineas = texto
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

    const sujetos: SujetoCensura[] = [];

    // =======================================================================
    // 1. EXTRAER SUJETOS PROCESALES DE CARÁTULA
    // =======================================================================
    const patronesSujetos = [
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

      for (const pat of patronesSujetos) {
        if (pat.regex.test(linea)) {
          let valor = linea.replace(pat.regex, '').trim();

          // Si el nombre viene en la siguiente línea
          if (!valor && i + 1 < lineas.length) {
            const sig = lineas[i + 1];
            if (!patronesSujetos.some(p => p.regex.test(sig)) && !/^domic/i.test(sig) && !/^exp/i.test(sig)) {
              valor = sig;
            }
          }

          // Extraer Domicilio Legal si está presente
          let domicilio = '';
          const matchDomic = valor.match(/Domic(?:ilio)?\s*(?:Legal|\.)?\s*[:\-]?\s*([^\r\n]+)/i);
          if (matchDomic) {
            domicilio = matchDomic[1].trim();
            valor = valor.split(/Domic(?:ilio)?/i)[0].trim();
          }

          valor = valor.replace(/^[:\-\s]+|[:\-\s]+$/g, '').trim();

          if (valor && valor.length > 2 && !/^<no definido>/i.test(valor)) {
            const yaExiste = sujetos.some(
              s => s.categoria === pat.key && this.sonMismoNombre(s.valor, valor)
            );
            if (!yaExiste) {
              const variantes = this.generarVariantesNombre(valor);
              sujetos.push({
                id: 'suj_' + Math.random().toString(36).substring(2, 9),
                categoria: pat.key,
                campo: 'Nombre de ' + pat.etiqueta,
                etiqueta: pat.etiqueta,
                valor: valor.toUpperCase(),
                variantes,
                seleccionado: true,
                censurarEtiqueta: false,
                esDatoPersonal: false
              });
            }
          }

          if (domicilio && !/^<no definido>/i.test(domicilio) && domicilio.length > 3) {
            const yaExisteDom = sujetos.some(
              s => s.categoria === 'DOMICILIO' && s.valor.toLowerCase() === domicilio.toLowerCase()
            );
            if (!yaExisteDom) {
              sujetos.push({
                id: 'dom_' + Math.random().toString(36).substring(2, 9),
                categoria: 'DOMICILIO',
                campo: `${pat.etiqueta}: Domicilio Legal`,
                etiqueta: 'Domic Legal',
                valor: domicilio.toUpperCase(),
                seleccionado: true,
                censurarEtiqueta: false,
                esDatoPersonal: true
              });
            }
          }
        }
      }
    }

    // =======================================================================
    // 2. EXTRAER SECCIÓN "DATOS PERSONALES DE LAS PARTES"
    // =======================================================================
    let parteActual = '';

    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];

      // Detectar encabezado de la parte (ej. DATOS DE LA AGRAVIADA, DATOS DEL DEMANDADO)
      const matchParte = l.match(/DATOS\s+DE\s+(?:LA|EL)\s+(AGRAVIAD[AO]|DEMANDAD[AO]|IMPUTAD[AO]|DENUNCIANTE|SENTENCIAD[AO])/i);
      if (matchParte) {
        parteActual = matchParte[1].toUpperCase();
      }

      // Reglas para cada campo personal sensible
      const camposPersonales = [
        {
          campo: 'Nombres',
          regex: /^Nombres?\s*[:\-]\s*(.+)/i,
          categoria: (parteActual.includes('DEMAND') ? 'DEMANDADO' : (parteActual.includes('AGRAV') ? 'AGRAVIADO' : 'DATO_PERSONAL')) as CategoriaCensura,
          esNombre: true
        },
        {
          campo: 'Edad',
          regex: /^Edad\s*[:\-]\s*(.+)/i,
          categoria: 'DATO_PERSONAL' as CategoriaCensura,
          esNombre: false
        },
        {
          campo: 'Natural de',
          regex: /^Natural\s+de\s*[:\-]\s*(.+)/i,
          categoria: 'DATO_PERSONAL' as CategoriaCensura,
          esNombre: false
        },
        {
          campo: 'Estado Civil',
          regex: /^Estado\s+Civil\s*[:\-]\s*(.+)/i,
          categoria: 'DATO_PERSONAL' as CategoriaCensura,
          esNombre: false
        },
        {
          campo: 'Ocupación',
          regex: /^Ocupaci[oó]n\s*[:\-]\s*(.+)/i,
          categoria: 'DATO_PERSONAL' as CategoriaCensura,
          esNombre: false
        },
        {
          campo: 'Identificado',
          regex: /^(?:Identificad[oa]|DNI)\s*[:\-]\s*(.+)/i,
          categoria: 'DNI' as CategoriaCensura,
          esNombre: false
        },
        {
          campo: 'Domicilio',
          regex: /^Domicilio\s*[:\-]\s*(.+)/i,
          categoria: 'DOMICILIO' as CategoriaCensura,
          esNombre: false
        },
        {
          campo: 'Teléfono',
          regex: /^Tel[eé]fono\s*[:\-]\s*(.+)/i,
          categoria: 'TELEFONO' as CategoriaCensura,
          esNombre: false
        }
      ];

      for (const cp of camposPersonales) {
        const m = l.match(cp.regex);
        if (m && m[1]) {
          let valorExtraido = m[1].trim().replace(/^[:\-\s]+|[:\-\s]+$/g, '');
          if (valorExtraido && valorExtraido !== '<No Definido>' && valorExtraido !== 'S/D/P/V') {
            const prefijoParte = parteActual ? `${parteActual}: ` : '';
            const nombreCampo = `${prefijoParte}${cp.campo}`;

            if (cp.esNombre) {
              // Si es un nombre, verificar si coincide con alguno existente en carátula
              const existente = sujetos.find(s => this.sonMismoNombre(s.valor, valorExtraido));
              if (existente) {
                // Agregar esta variante específica si no está
                if (!existente.variantes) existente.variantes = [existente.valor];
                const upperVal = valorExtraido.toUpperCase();
                if (!existente.variantes.includes(upperVal)) {
                  existente.variantes.push(upperVal);
                }
                const masVariantes = this.generarVariantesNombre(valorExtraido);
                for (const v of masVariantes) {
                  if (!existente.variantes.includes(v)) existente.variantes.push(v);
                }
              } else {
                const variantes = this.generarVariantesNombre(valorExtraido);
                sujetos.push({
                  id: 'pers_' + Math.random().toString(36).substring(2, 9),
                  categoria: cp.categoria,
                  campo: nombreCampo,
                  etiqueta: cp.campo,
                  valor: valorExtraido.toUpperCase(),
                  variantes,
                  seleccionado: true,
                  censurarEtiqueta: false,
                  esDatoPersonal: true
                });
              }
            } else {
              // Es dato personal (Edad, Natural de, Estado Civil, Ocupación, DNI, Domicilio, Teléfono)
              const yaExiste = sujetos.some(
                s => s.campo === nombreCampo && s.valor.toLowerCase() === valorExtraido.toLowerCase()
              );
              if (!yaExiste) {
                sujetos.push({
                  id: 'pers_' + Math.random().toString(36).substring(2, 9),
                  categoria: cp.categoria,
                  campo: nombreCampo,
                  etiqueta: cp.campo,
                  valor: valorExtraido,
                  seleccionado: true,
                  censurarEtiqueta: false,
                  esDatoPersonal: true
                });
              }
            }
          }
        }
      }
    }

    return sujetos;
  }

  /**
   * Genera variantes y permutaciones de nombres (ej. Apellidos Nombres <-> Nombres Apellidos)
   */
  generarVariantesNombre(nombre: string): string[] {
    const palabras = nombre
      .trim()
      .split(/\s+/)
      .map(p => p.replace(/[,;.]/g, '').toUpperCase())
      .filter(p => p.length > 1);

    const variantes = new Set<string>();
    if (palabras.length === 0) return [];

    variantes.add(palabras.join(' '));

    // Si tiene 3 palabras (ej: HINOJOSA PACCO VICTORIA)
    if (palabras.length === 3) {
      // Nombres Apellidos: VICTORIA HINOJOSA PACCO
      variantes.add(`${palabras[2]} ${palabras[0]} ${palabras[1]}`);
      // Con coma: HINOJOSA PACCO, VICTORIA
      variantes.add(`${palabras[0]} ${palabras[1]}, ${palabras[2]}`);
      // Otra permutación posible
      variantes.add(`${palabras[1]} ${palabras[2]} ${palabras[0]}`);
    } else if (palabras.length === 4) {
      // Si tiene 4 palabras (ej: PEREZ HUAMANI JUAN CARLOS)
      // Nombres Apellidos: JUAN CARLOS PEREZ HUAMANI
      variantes.add(`${palabras[2]} ${palabras[3]} ${palabras[0]} ${palabras[1]}`);
      // Con coma: PEREZ HUAMANI, JUAN CARLOS
      variantes.add(`${palabras[0]} ${palabras[1]}, ${palabras[2]} ${palabras[3]}`);
      // Un solo nombre adelante: JUAN PEREZ HUAMANI CARLOS
      variantes.add(`${palabras[2]} ${palabras[0]} ${palabras[1]} ${palabras[3]}`);
    } else if (palabras.length === 2) {
      // Si tiene 2 palabras: PEREZ JUAN <-> JUAN PEREZ
      variantes.add(`${palabras[1]} ${palabras[0]}`);
      variantes.add(`${palabras[0]}, ${palabras[1]}`);
    }

    return Array.from(variantes);
  }

  /**
   * Determina si dos cadenas corresponden al mismo nombre independientemente del orden
   */
  sonMismoNombre(nombre1: string, nombre2: string): boolean {
    const tokens1 = this.normalizarTexto(nombre1).split(' ').filter(w => w.length > 1).sort().join(' ');
    const tokens2 = this.normalizarTexto(nombre2).split(' ').filter(w => w.length > 1).sort().join(' ');
    return tokens1.length > 3 && tokens1 === tokens2;
  }

  /**
   * Ejecuta OCR sobre la portada / primera página con Tesseract.js (para escaneados de imagen pura)
   */
  private async ejecutarOcrPrimeraPagina(
    doc: any,
    onProgreso?: (mensaje: string, porcentaje: number) => void
  ): Promise<string> {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 });

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
   * Soporta variantes de nombres, datos personales de las partes y permutaciones en todo el documento.
   */
  async censurarPdf(
    pdfOriginalBytes: ArrayBuffer,
    sujetosACensurar: SujetoCensura[],
    opciones: {
      censurarTodasLasOcurrencias?: boolean;
      censurarEtiquetas?: boolean;
      colorHex?: string;
      recuadrosManuales?: RecuadroManualCensura[];
    } = {}
  ): Promise<{ pdfBytes: Uint8Array; totalCoincidencias: number }> {
    const { censurarEtiquetas = false, recuadrosManuales = [] } = opciones;

    const terminosValidos = sujetosACensurar
      .filter(s => s.seleccionado && s.valor && s.valor.trim().length > 1)
      .map(s => {
        const todasLasVariantes = new Set<string>();
        todasLasVariantes.add(s.valor.trim());
        if (s.variantes && s.variantes.length > 0) {
          s.variantes.forEach(v => todasLasVariantes.add(v.trim()));
        }
        // Generar también variantes sobre la marcha
        const varsCalculadas = this.generarVariantesNombre(s.valor);
        varsCalculadas.forEach(v => todasLasVariantes.add(v));

        const palabrasClave = s.valor
          .split(/\s+/)
          .map(w => this.normalizarTexto(w))
          .filter(w => w.length > 1);

        return {
          valorOriginal: s.valor.trim(),
          variantes: Array.from(todasLasVariantes),
          palabrasClave,
          etiqueta: s.etiqueta,
          censurarEtiqueta: s.censurarEtiqueta || censurarEtiquetas
        };
      });

    if (terminosValidos.length === 0 && recuadrosManuales.length === 0) {
      return { pdfBytes: new Uint8Array(pdfOriginalBytes.slice(0)), totalCoincidencias: 0 };
    }

    // Clonar copias independientes para PDF.js y pdf-lib
    const bytesParaPdfJs = new Uint8Array(pdfOriginalBytes.slice(0));
    const bytesParaPdfLib = new Uint8Array(pdfOriginalBytes.slice(0));

    const docPdfJs = await pdfjsLib.getDocument({ data: bytesParaPdfJs }).promise;
    const pdfLibDoc = await PDFDocument.load(bytesParaPdfLib);
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

      // 1. Búsqueda directa y por variantes en cada item individual
      for (const t of terminosValidos) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const textoItemNorm = this.normalizarTexto(item.str);

          let coincide = false;

          // Verificar contra todas las variantes conocidas
          for (const varTxt of t.variantes) {
            const varNorm = this.normalizarTexto(varTxt);
            if (textoItemNorm.includes(varNorm)) {
              coincide = true;
              break;
            }
          }

          // Si contiene todas las palabras clave del nombre juntas en el mismo item
          if (!coincide && t.palabrasClave.length >= 2) {
            const todasEnItem = t.palabrasClave.every(p => textoItemNorm.includes(p));
            if (todasEnItem) {
              coincide = true;
            }
          }

          if (coincide) {
            totalCoincidencias++;
            const padding = 3;
            pagePdfLib.drawRectangle({
              x: Math.max(0, item.tx - padding),
              y: Math.max(0, item.ty - padding),
              width: Math.min(pageWidth - item.tx, item.w + padding * 2),
              height: item.h + padding * 2,
              color: rgb(0, 0, 0),
              opacity: 1.0
            });
          }

          // Si también se debe censurar la etiqueta correspondiente (ej: DEMANDANTE:, Domicilio:)
          if (t.censurarEtiqueta && t.etiqueta) {
            const etiqNorm = this.normalizarTexto(t.etiqueta);
            if (textoItemNorm.includes(etiqNorm)) {
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

      // 2. Búsqueda por ventana deslizante de items contiguos (para frases divididas o nombres con orden invertido)
      for (const t of terminosValidos) {
        for (let i = 0; i < items.length; i++) {
          let accumNorm = '';
          let minX = items[i].tx;
          let maxX = items[i].tx + items[i].w;
          let minY = items[i].ty;
          let maxH = items[i].h;

          // Ventana de hasta 8 items contiguos
          for (let j = i; j < Math.min(items.length, i + 8); j++) {
            accumNorm += ' ' + this.normalizarTexto(items[j].str);
            accumNorm = accumNorm.trim();
            minX = Math.min(minX, items[j].tx);
            maxX = Math.max(maxX, items[j].tx + items[j].w);
            minY = Math.min(minY, items[j].ty);
            maxH = Math.max(maxH, items[j].h);

            let coincideVentana = false;

            // Coincidencia con alguna variante completa
            for (const varTxt of t.variantes) {
              const varNorm = this.normalizarTexto(varTxt);
              if (accumNorm.includes(varNorm)) {
                coincideVentana = true;
                break;
              }
            }

            // O coincidencia si todas las palabras clave del nombre están presentes en la ventana contigua
            if (!coincideVentana && t.palabrasClave.length >= 2) {
              const todasPresentes = t.palabrasClave.every(p => accumNorm.includes(p));
              if (todasPresentes) {
                coincideVentana = true;
              }
            }

            if (coincideVentana) {
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
              i = j; // Avanzar el cursor
              break;
            }
          }
        }
      }

      // 3. Aplicar recuadros manuales dibujados por el usuario para esta página
      if (recuadrosManuales && recuadrosManuales.length > 0) {
        const recuadrosPagina = recuadrosManuales.filter(r => r.pagina === pageNum);
        for (const r of recuadrosPagina) {
          totalCoincidencias++;
          pagePdfLib.drawRectangle({
            x: Math.max(0, r.x),
            y: Math.max(0, r.y),
            width: Math.min(pageWidth - r.x, r.width),
            height: Math.min(pageHeight - r.y, r.height),
            color: rgb(0, 0, 0),
            opacity: 1.0
          });
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
