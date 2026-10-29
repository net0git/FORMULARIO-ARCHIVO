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
  variantes?: string[]; // Combinaciones y permutaciones internas
  esDatoPersonal?: boolean;
  sujetoPadreId?: string;
  datosPersonales?: SujetoCensura[]; // Datos personales anidados bajo este sujeto procesal
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

export interface CajaCensuraDetectada {
  id: string;
  terminoId?: string;
  sujetoPadreId?: string;
  tipo: 'sujeto' | 'dato_personal';
  categoria?: string;
  etiqueta?: string;
  valorTexto: string;
  pdfX: number;
  pdfY: number;
  pdfW: number;
  pdfH: number;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
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
                esDatoPersonal: false,
                datosPersonales: []
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
              // Identificar al sujeto procesal padre según el encabezado actual
              let sujetoPadre = sujetos.find(s => {
                if (parteActual.includes('DEMAND')) return s.categoria === 'DEMANDADO';
                if (parteActual.includes('AGRAV')) return s.categoria === 'AGRAVIADO';
                if (parteActual.includes('DEMANDANTE')) return s.categoria === 'DEMANDANTE';
                return false;
              });

              const nuevoDato: SujetoCensura = {
                id: 'pers_' + Math.random().toString(36).substring(2, 9),
                categoria: cp.categoria,
                campo: nombreCampo,
                etiqueta: cp.campo,
                valor: valorExtraido,
                seleccionado: true,
                censurarEtiqueta: false,
                esDatoPersonal: true,
                sujetoPadreId: sujetoPadre ? sujetoPadre.id : undefined
              };

              if (sujetoPadre) {
                sujetoPadre.datosPersonales = sujetoPadre.datosPersonales || [];
                const yaEnPadre = sujetoPadre.datosPersonales.some(
                  (d: SujetoCensura) => d.etiqueta === cp.campo && d.valor.toLowerCase() === valorExtraido.toLowerCase()
                );
                if (!yaEnPadre) {
                  sujetoPadre.datosPersonales.push(nuevoDato);
                }
              } else {
                const yaExiste = sujetos.some(
                  s => s.campo === nombreCampo && s.valor.toLowerCase() === valorExtraido.toLowerCase()
                );
                if (!yaExiste) {
                  sujetos.push(nuevoDato);
                }
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
    /**
   * Separa las palabras del nombre y genera todas sus combinaciones exactas y permutaciones
   * para cubrir cambios de orden en el expediente judicial (ej: Apellidos + Nombres o Nombres + Apellidos)
   */
  generarCombinacionesPalabras(nombre: string): string[] {
    const palabras = (nombre || '')
      .trim()
      .split(/\s+/)
      .map(p => p.replace(/[,;.:\-_/]/g, '').trim())
      .filter(p => p.length >= 3);

    if (palabras.length === 0) return [];
    if (palabras.length === 1) return [palabras[0].toUpperCase()];

    const combinaciones = new Set<string>();

    // 1. Agregar el nombre completo original
    combinaciones.add(palabras.join(' ').toUpperCase());

    // 2. Permutaciones completas (hasta 4 palabras para rendimiento O(N!))
    const permutar = (arr: string[]): string[][] => {
      if (arr.length <= 1) return [arr];
      const res: string[][] = [];
      for (let i = 0; i < arr.length; i++) {
        const actual = arr[i];
        const resto = [...arr.slice(0, i), ...arr.slice(i + 1)];
        for (const p of permutar(resto)) {
          res.push([actual, ...p]);
        }
      }
      return res;
    };

    const palabrasBase = palabras.slice(0, 4);
    const permutadas = permutar(palabrasBase);
    for (const p of permutadas) {
      const frase = p.join(' ').toUpperCase();
      combinaciones.add(frase);
      // Con coma tras los dos primeros (ej. "PEREZ HUAMANI, EVANGELINO")
      if (p.length >= 3) {
        combinaciones.add(`${p[0]} ${p[1]}, ${p.slice(2).join(' ')}`.toUpperCase());
      }
    }

    // 3. Sub-combinaciones de pares contiguos (ej. los dos apellidos juntos o nombre y apellido)
    for (let i = 0; i < palabras.length; i++) {
      for (let j = 0; j < palabras.length; j++) {
        if (i !== j) {
          combinaciones.add(`${palabras[i]} ${palabras[j]}`.toUpperCase());
        }
      }
    }

    return Array.from(combinaciones);
  }

  generarVariantesNombre(nombre: string): string[] {
    return this.generarCombinacionesPalabras(nombre);
  }

  /**
   * Determina si una palabra o frase aparece como termino exacto (con limites de palabra)
   * en el texto normalizado, evitando coincidencias parciales dentro de otras palabras (ej. letra J en Juzgado)
   */
  contieneTerminoExacto(textoNormalizado: string, termino: string): boolean {
    if (!textoNormalizado || !termino) return false;
    const t = this.normalizarTexto(termino);
    if (!t || (t.length < 3 && !/^\d{8}$/.test(t))) return false;
    const caracteresEspeciales = "[](){}.*+?^$|\\";
    let tEscapado = "";
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      tEscapado += caracteresEspeciales.indexOf(c) !== -1 ? "\\" + c : c;
    }
    const regex = new RegExp("(?:^|\\s)" + tEscapado + "(?=$|\\s)", "i");
    return regex.test(textoNormalizado);
  }

  /**
   * Determina si dos cadenas corresponden al mismo nombre independientemente del orden
   */
  sonMismoNombre(nombre1: string, nombre2: string): boolean {
    const tokens1 = this.normalizarTexto(nombre1).split(' ').filter((w: string) => w.length > 1).sort().join(' ');
    const tokens2 = this.normalizarTexto(nombre2).split(' ').filter((w: string) => w.length > 1).sort().join(' ');
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
   * Identifica y calcula las cajas de censura de una página agrupando por líneas visuales
   * y añadiendo un margen de seguridad adaptativo para cubrir completamente nombres compuestos,
   * caracteres anchos y terminaciones sin dejar letras expuestas ni desfasadas.
   */
  calcularCajasPagina(
    textContent: any,
    sujetos: SujetoCensura[],
    pageWidth: number,
    pageHeight: number,
    pageNum: number = 1,
    opciones: { censurarEtiquetas?: boolean } = {}
  ): CajaCensuraDetectada[] {
    const { censurarEtiquetas = false } = opciones;
    const cajas: CajaCensuraDetectada[] = [];

    const rawItems = ((textContent && textContent.items) as any[] || []).filter(it => it && it.str && it.str.trim());
    if (rawItems.length === 0) return cajas;

    const items = rawItems.map(it => ({
      str: it.str,
      strNorm: this.normalizarTexto(it.str),
      tx: it.transform ? it.transform[4] : 0,
      ty: it.transform ? it.transform[5] : 0,
      fontH: it.transform ? (Math.hypot(it.transform[0], it.transform[1]) || it.height || 12) : 12,
      fontW: it.width || (it.str.length * 8)
    }));

    // Agrupar items por línea visual (mismo Y con tolerancia de 4pt)
    const itemsOrdenados = [...items].sort((a, b) => {
      if (Math.abs(a.ty - b.ty) > 4) return b.ty - a.ty;
      return a.tx - b.tx;
    });

    const lineasVisuales: any[][] = [];
    let lineaActual: any[] = [];
    let yActual: number | null = null;
    for (const it of itemsOrdenados) {
      if (yActual === null || Math.abs(it.ty - yActual) > 4) {
        if (lineaActual.length > 0) {
          lineasVisuales.push(lineaActual.sort((a, b) => a.tx - b.tx));
        }
        lineaActual = [it];
        yActual = it.ty;
      } else {
        lineaActual.push(it);
      }
    }
    if (lineaActual.length > 0) {
      lineasVisuales.push(lineaActual.sort((a, b) => a.tx - b.tx));
    }

    // Aplanar sujetos principales y datos personales seleccionados
    const todosSujetos: SujetoCensura[] = [];
    for (const s of sujetos) {
      if (s.seleccionado && s.valor && s.valor.trim().length > 1) {
        todosSujetos.push(s);
      }
      if (s.datosPersonales && s.datosPersonales.length > 0) {
        for (const dp of s.datosPersonales) {
          if (dp.seleccionado && dp.valor && dp.valor.trim().length > 1) {
            todosSujetos.push(dp);
          }
        }
      }
    }

    for (const s of todosSujetos) {
      const sNorm = this.normalizarTexto(s.valor);
      if (!sNorm || sNorm.length < 2) continue;

      const palabras = sNorm.split(' ').filter((w: string) => w.length > 1);
      const combinaciones = this.generarCombinacionesPalabras(s.valor);

      for (const linea of lineasVisuales) {
        const textoLineaNorm = linea.map(it => it.strNorm).join(' ');

        let coincide = false;
        if (!s.esDatoPersonal) {
          // Sujeto procesal: coincidencia por combinación exacta, por todas las palabras clave o por texto exacto
          const coincideCombinacion = combinaciones.some(c => this.contieneTerminoExacto(textoLineaNorm, c));
          const coincidenTodas = palabras.length >= 2 && palabras.every((p: string) => this.contieneTerminoExacto(textoLineaNorm, p));
          const coincideDirecto = this.contieneTerminoExacto(textoLineaNorm, s.valor);
          coincide = coincideCombinacion || coincidenTodas || coincideDirecto;
        } else {
          // Dato personal: coincidencia exacta de término, subcadena de dígitos/código o todas las palabras
          coincide =
            this.contieneTerminoExacto(textoLineaNorm, s.valor) ||
            (sNorm.length >= 4 && textoLineaNorm.includes(sNorm)) ||
            (palabras.length >= 2 && palabras.every((p: string) => this.contieneTerminoExacto(textoLineaNorm, p)));
        }

        if (coincide) {
          let itemsMatch: any[] = [];
          if (!s.esDatoPersonal) {
            itemsMatch = linea.filter(it =>
              palabras.some((p: string) => it.strNorm === p || this.contieneTerminoExacto(it.strNorm, p)) ||
              this.contieneTerminoExacto(it.strNorm, s.valor)
            );
          } else {
            itemsMatch = linea.filter(it =>
              this.contieneTerminoExacto(it.strNorm, s.valor) ||
              (sNorm.length >= 4 && it.strNorm.includes(sNorm)) ||
              palabras.some((p: string) => it.strNorm === p || this.contieneTerminoExacto(it.strNorm, p))
            );
          }

          if (itemsMatch.length > 0) {
            const minX = Math.min(...itemsMatch.map(it => it.tx));
            const lastItem = itemsMatch[itemsMatch.length - 1];

            // Margen adaptativo: las fuentes en PDFs escaneados u OCR suelen ser más anchas
            // que el cálculo base de PDF.js. Añadimos margen extra para garantizar cobertura 100%.
            const extraRight = Math.max(14, lastItem.fontW * 0.25 + 6);
            const maxX = Math.max(...itemsMatch.map(it => it.tx + it.fontW)) + extraRight;
            const minY = Math.min(...itemsMatch.map(it => it.ty));
            const maxY = Math.max(...itemsMatch.map(it => it.ty + it.fontH));

            const paddingX = 4;
            const paddingY = 2.5;

            const pdfX = Math.max(0, minX - paddingX);
            const pdfY = Math.max(0, minY - paddingY);
            const pdfW = Math.min(pageWidth - pdfX, (maxX - minX) + paddingX * 2);
            const pdfH = Math.min(pageHeight - pdfY, (maxY - minY) + paddingY * 2);

            const xPct = Math.max(0, (pdfX / pageWidth) * 100);
            const yPct = Math.max(0, ((pageHeight - (pdfY + pdfH)) / pageHeight) * 100);
            const wPct = Math.min(100, (pdfW / pageWidth) * 100);
            const hPct = Math.min(100, (pdfH / pageHeight) * 100);

            const cajaId = `vis_p${pageNum}_${s.esDatoPersonal ? 'dp' : 'suj'}_${s.id}_${Math.round(xPct)}_${Math.round(yPct)}`;

            cajas.push({
              id: cajaId,
              terminoId: s.id,
              sujetoPadreId: s.sujetoPadreId,
              tipo: s.esDatoPersonal ? 'dato_personal' : 'sujeto',
              categoria: s.categoria,
              etiqueta: s.etiqueta || s.categoria,
              valorTexto: s.valor,
              pdfX,
              pdfY,
              pdfW,
              pdfH,
              xPct,
              yPct,
              wPct,
              hPct
            });
          }
        }
      }

      // Si también se solicitó censurar la etiqueta asociada al término (ej: "DEMANDADO:", "AGRAVIADO:")
      const debeCensurarEtiqueta = s.censurarEtiqueta || censurarEtiquetas;
      if (debeCensurarEtiqueta && s.etiqueta) {
        const etiqNorm = this.normalizarTexto(s.etiqueta);
        if (etiqNorm.length >= 3) {
          for (const linea of lineasVisuales) {
            const itemsEtiq = linea.filter(it => it.strNorm.includes(etiqNorm) || this.contieneTerminoExacto(it.strNorm, s.etiqueta!));
            if (itemsEtiq.length > 0) {
              const minX = Math.min(...itemsEtiq.map(it => it.tx));
              const maxX = Math.max(...itemsEtiq.map(it => it.tx + it.fontW)) + 6;
              const minY = Math.min(...itemsEtiq.map(it => it.ty));
              const maxY = Math.max(...itemsEtiq.map(it => it.ty + it.fontH));

              const paddingX = 3;
              const paddingY = 2;

              const pdfX = Math.max(0, minX - paddingX);
              const pdfY = Math.max(0, minY - paddingY);
              const pdfW = Math.min(pageWidth - pdfX, (maxX - minX) + paddingX * 2);
              const pdfH = Math.min(pageHeight - pdfY, (maxY - minY) + paddingY * 2);

              const xPct = Math.max(0, (pdfX / pageWidth) * 100);
              const yPct = Math.max(0, ((pageHeight - (pdfY + pdfH)) / pageHeight) * 100);
              const wPct = Math.min(100, (pdfW / pageWidth) * 100);
              const hPct = Math.min(100, (pdfH / pageHeight) * 100);

              const cajaId = `etiq_p${pageNum}_${s.id}_${Math.round(xPct)}_${Math.round(yPct)}`;
              cajas.push({
                id: cajaId,
                terminoId: s.id,
                tipo: 'sujeto',
                categoria: s.categoria,
                etiqueta: s.etiqueta,
                valorTexto: s.etiqueta,
                pdfX,
                pdfY,
                pdfW,
                pdfH,
                xPct,
                yPct,
                wPct,
                hPct
              });
            }
          }
        }
      }
    }

    return cajas;
  }

  /**
   * Aplica la censura con rectángulos negros sobre el PDF original
   * Utiliza la misma detección precisa y márgenes que el visor visual.
   */
  async censurarPdf(
    pdfOriginalBytes: ArrayBuffer,
    sujetosACensurar: SujetoCensura[],
    opciones: {
      censurarTodasLasOcurrencias?: boolean;
      censurarEtiquetas?: boolean;
      colorHex?: string;
      recuadrosManuales?: RecuadroManualCensura[];
      cajasExcluidas?: { pagina: number; xPct: number; yPct: number; wPct: number; hPct: number }[];
    } = {}
  ): Promise<{ pdfBytes: Uint8Array; totalCoincidencias: number }> {
    const { censurarEtiquetas = false, recuadrosManuales = [], cajasExcluidas = [] } = opciones;

    const haySujetos = sujetosACensurar.some(
      s => s.seleccionado || (s.datosPersonales && s.datosPersonales.some(d => d.seleccionado))
    );
    if (!haySujetos && recuadrosManuales.length === 0) {
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

      // Helper para comprobar si una región coincide con alguna caja excluida por el usuario
      const estaExcluido = (pNum: number, rx: number, ry: number, rw: number, rh: number) => {
        if (!cajasExcluidas || cajasExcluidas.length === 0) return false;
        const xPct = (rx / pageWidth) * 100;
        const yPct = ((pageHeight - (ry + rh)) / pageHeight) * 100;
        const wPct = (rw / pageWidth) * 100;
        const hPct = (rh / pageHeight) * 100;
        return cajasExcluidas.some(ex => {
          if (ex.pagina !== pNum) return false;
          const solapeX = Math.max(0, Math.min(xPct + wPct, ex.xPct + ex.wPct) - Math.max(xPct, ex.xPct));
          const solapeY = Math.max(0, Math.min(yPct + hPct, ex.yPct + ex.hPct) - Math.max(yPct, ex.yPct));
          return solapeX > 0.4 * Math.min(wPct, ex.wPct) && solapeY > 0.4 * Math.min(hPct, ex.hPct);
        });
      };

      // 1. Detección automática por líneas visuales idéntica a la del visor interactivo
      const cajasDetectadas = this.calcularCajasPagina(
        textContent,
        sujetosACensurar,
        pageWidth,
        pageHeight,
        pageNum,
        { censurarEtiquetas }
      );

      for (const caja of cajasDetectadas) {
        if (estaExcluido(pageNum, caja.pdfX, caja.pdfY, caja.pdfW, caja.pdfH)) {
          continue;
        }
        totalCoincidencias++;
        pagePdfLib.drawRectangle({
          x: Math.max(0, caja.pdfX),
          y: Math.max(0, caja.pdfY),
          width: Math.min(pageWidth - caja.pdfX, caja.pdfW),
          height: Math.min(pageHeight - caja.pdfY, caja.pdfH),
          color: rgb(0, 0, 0),
          opacity: 1.0
        });
      }

      // 2. Aplicar recuadros manuales trazados por el usuario para esta página
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

  public normalizarTexto(txt: string): string {
    return (txt || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
