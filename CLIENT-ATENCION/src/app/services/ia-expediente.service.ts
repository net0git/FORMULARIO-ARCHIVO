import { Injectable } from '@angular/core';
import { SujetoCensura } from './pdf-censura.service';

export interface RespuestaIaExpediente {
  materia?: string;
  menores_de_edad?: string[];
  agraviados?: Array<{
    nombre: string;
    alias_variantes?: string[];
    edad?: number | string;
    natural_de?: string;
    estado_civil?: string;
    ocupacion?: string;
    identificado?: string;
    domicilio?: string;
    telefono?: string;
  }>;
  demandados_imputados?: Array<{
    nombre: string;
    alias_variantes?: string[];
    edad?: number | string;
    natural_de?: string;
    estado_civil?: string;
    ocupacion?: string;
    identificado?: string;
    domicilio?: string;
    telefono?: string;
  }>;
  entidades_publicas?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class IaExpedienteService {
  // URL base de Ollama (se autodetecta según la IP/host del servidor o se puede fijar manualmente aquí)
  private ollamaUrl = 'http://localhost:11434';
  private modeloPorDefecto = 'llama3.2:3b';

  constructor() {
    this.inicializarUrlOllama();
  }

  /**
   * Inicializa la URL de Ollama automáticamente con la IP/host actual del navegador
   */
  private inicializarUrlOllama(): void {
    if (typeof window !== 'undefined') {
      const guardada = localStorage.getItem('ollama_url');
      if (guardada) {
        this.ollamaUrl = guardada.replace(/\/+$/, '');
        return;
      }
      // Detección automática: si la página se abre desde http://10.66.88.160:4050,
      // conecta automáticamente a http://10.66.88.160:11434
      const host = window.location.hostname;
      if (host) {
        this.ollamaUrl = `http://${host}:11434`;
      }
    }
  }

  get urlServidor(): string {
    return this.ollamaUrl;
  }

  set urlServidor(url: string) {
    this.ollamaUrl = url ? url.replace(/\/+$/, '') : 'http://localhost:11434';
    if (typeof window !== 'undefined') {
      localStorage.setItem('ollama_url', this.ollamaUrl);
    }
  }

  /**
   * Verifica si el servidor de Ollama está activo y devuelve los modelos instalados
   */
  async verificarConexion(): Promise<{ conectado: boolean; modelos: string[]; mensaje: string }> {
    try {
      const res = await fetch(`${this.ollamaUrl}/api/tags`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!res.ok) {
        return { conectado: false, modelos: [], mensaje: `Servidor respondió con código ${res.status}` };
      }

      const data = await res.json();
      const modelos = (data.models || []).map((m: any) => m.name || m.model);
      return {
        conectado: true,
        modelos,
        mensaje: modelos.length > 0 ? `Ollama activo (${modelos.join(', ')})` : 'Ollama activo (sin modelos)'
      };
    } catch (err: any) {
      return {
        conectado: false,
        modelos: [],
        mensaje: 'Ollama local no disponible o apagado'
      };
    }
  }

  /**
   * Analiza el texto del expediente con Llama 3.2 en Ollama y devuelve datos estructurados en JSON
   */
  async analizarExpedienteConIa(textoExpediente: string, onProgreso?: (msg: string) => void): Promise<SujetoCensura[]> {
    onProgreso?.('Consultando modelo IA Llama 3.2 local...');

    // Limitar el texto a las páginas iniciales más relevantes (primeros 6000 caracteres)
    const textoResumido = textoExpediente.slice(0, 7000);

    const systemPrompt = `Eres un asistente judicial de alta precisión especializado en anonimización y protección de datos en expedientes del Poder Judicial del Perú (Ley 29733).
Analiza el expediente y extrae los datos sensibles en un objeto JSON estricto con esta estructura:
{
  "materia": "string",
  "menores_de_edad": ["lista de nombres de menores hijos"],
  "agraviados": [
    {
      "nombre": "string",
      "alias_variantes": ["variante1", "variante2"],
      "edad": "string",
      "natural_de": "string",
      "estado_civil": "string",
      "ocupacion": "string",
      "identificado": "string (DNI)",
      "domicilio": "string",
      "telefono": "string"
    }
  ],
  "demandados_imputados": [
    {
      "nombre": "string",
      "alias_variantes": ["variante1", "variante2"],
      "edad": "string",
      "natural_de": "string",
      "estado_civil": "string",
      "ocupacion": "string",
      "identificado": "string (DNI)",
      "domicilio": "string",
      "telefono": "string"
    }
  ],
  "entidades_publicas": ["Ministerio Público", etc.]
}
Responde únicamente el objeto JSON sin comentarios ni bloques de código.`;

    const body = {
      model: this.modeloPorDefecto,
      prompt: `Texto del expediente judicial:\n${textoResumido}\n\nExtrae los datos en JSON:`,
      system: systemPrompt,
      format: 'json',
      stream: false,
      options: {
        temperature: 0.1,
        num_ctx: 8192
      }
    };

    const response = await fetch(`${this.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Error en Ollama: código ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    let jsonResult: RespuestaIaExpediente = {};

    try {
      jsonResult = JSON.parse(data.response);
    } catch (e) {
      console.warn('No se pudo parsear directamente el JSON de la IA:', data.response);
      return [];
    }

    return this.transformarRespuestaIaASujetos(jsonResult);
  }

  /**
   * Transforma la respuesta estructurada de la IA a la lista de SujetoCensura utilizada por el visor
   */
    /**
   * Transforma la respuesta estructurada de la IA a la lista de SujetoCensura utilizada por el visor,
   * anidando los datos personales identificados directamente bajo cada sujeto procesal.
   */
  private transformarRespuestaIaASujetos(res: RespuestaIaExpediente): SujetoCensura[] {
    const sujetos: SujetoCensura[] = [];

    // 1. Menores de edad
    if (res.menores_de_edad && Array.isArray(res.menores_de_edad)) {
      for (const menor of res.menores_de_edad) {
        if (menor && menor.length > 3) {
          sujetos.push({
            id: 'ia_menor_' + Math.random().toString(36).substring(2, 9),
            categoria: 'AGRAVIADO',
            campo: 'Menor de Edad (Hijo/a)',
            etiqueta: 'MENOR HIJO',
            valor: menor.trim(),
            seleccionado: true,
            esDatoPersonal: false,
            datosPersonales: []
          });
        }
      }
    }

    // 2. Agraviados / Víctimas
    if (res.agraviados && Array.isArray(res.agraviados)) {
      for (const agr of res.agraviados) {
        if (agr.nombre) {
          const sujetoAgr: SujetoCensura = {
            id: 'ia_agr_' + Math.random().toString(36).substring(2, 9),
            categoria: 'AGRAVIADO',
            campo: 'Agraviada / Víctima',
            etiqueta: 'AGRAVIADA',
            valor: agr.nombre.trim(),
            seleccionado: true,
            esDatoPersonal: false,
            datosPersonales: []
          };

          // Anidar datos personales del agraviado directamente debajo de este sujeto
          this.extraerCamposDetalle(sujetoAgr, agr, 'AGRAVIADA');
          sujetos.push(sujetoAgr);
        }
      }
    }

    // 3. Demandados / Imputados
    if (res.demandados_imputados && Array.isArray(res.demandados_imputados)) {
      for (const dem of res.demandados_imputados) {
        if (dem.nombre) {
          const sujetoDem: SujetoCensura = {
            id: 'ia_dem_' + Math.random().toString(36).substring(2, 9),
            categoria: 'DEMANDADO',
            campo: 'Demandado / Imputado',
            etiqueta: 'DEMANDADO',
            valor: dem.nombre.trim(),
            seleccionado: true,
            esDatoPersonal: false,
            datosPersonales: []
          };

          // Anidar datos personales del demandado directamente debajo de este sujeto
          this.extraerCamposDetalle(sujetoDem, dem, 'DEMANDADO');
          sujetos.push(sujetoDem);
        }
      }
    }

    return sujetos;
  }

  private extraerCamposDetalle(padre: SujetoCensura, obj: any, prefijo: string): void {
    if (!padre.datosPersonales) padre.datosPersonales = [];

    if (obj.identificado && obj.identificado !== '<No Definido>') {
      const numDni = obj.identificado.replace(/[^0-9]/g, '');
      const val = numDni.length === 8 ? numDni : obj.identificado;
      padre.datosPersonales.push({
        id: 'ia_dni_' + Math.random().toString(36).substring(2, 9),
        categoria: 'DNI',
        campo: `${prefijo}: DNI`,
        etiqueta: 'DNI',
        valor: val,
        seleccionado: true,
        esDatoPersonal: true,
        sujetoPadreId: padre.id
      });
    }

    if (obj.telefono && obj.telefono.length > 5) {
      padre.datosPersonales.push({
        id: 'ia_tel_' + Math.random().toString(36).substring(2, 9),
        categoria: 'TELEFONO',
        campo: `${prefijo}: Teléfono`,
        etiqueta: 'Teléfono',
        valor: obj.telefono,
        seleccionado: true,
        esDatoPersonal: true,
        sujetoPadreId: padre.id
      });
    }

    if (obj.domicilio && obj.domicilio.length > 6) {
      padre.datosPersonales.push({
        id: 'ia_dom_' + Math.random().toString(36).substring(2, 9),
        categoria: 'DOMICILIO',
        campo: `${prefijo}: Domicilio`,
        etiqueta: 'Domicilio',
        valor: obj.domicilio,
        seleccionado: true,
        esDatoPersonal: true,
        sujetoPadreId: padre.id
      });
    }

    if (obj.edad) {
      padre.datosPersonales.push({
        id: 'ia_edad_' + Math.random().toString(36).substring(2, 9),
        categoria: 'DATO_PERSONAL',
        campo: `${prefijo}: Edad`,
        etiqueta: 'Edad',
        valor: String(obj.edad),
        seleccionado: true,
        esDatoPersonal: true,
        sujetoPadreId: padre.id
      });
    }

    if (obj.natural_de) {
      padre.datosPersonales.push({
        id: 'ia_nat_' + Math.random().toString(36).substring(2, 9),
        categoria: 'DATO_PERSONAL',
        campo: `${prefijo}: Natural de`,
        etiqueta: 'Natural de',
        valor: obj.natural_de,
        seleccionado: true,
        esDatoPersonal: true,
        sujetoPadreId: padre.id
      });
    }

    if (obj.estado_civil) {
      padre.datosPersonales.push({
        id: 'ia_ec_' + Math.random().toString(36).substring(2, 9),
        categoria: 'DATO_PERSONAL',
        campo: `${prefijo}: Estado Civil`,
        etiqueta: 'Estado Civil',
        valor: obj.estado_civil,
        seleccionado: true,
        esDatoPersonal: true,
        sujetoPadreId: padre.id
      });
    }

    if (obj.ocupacion) {
      padre.datosPersonales.push({
        id: 'ia_oc_' + Math.random().toString(36).substring(2, 9),
        categoria: 'DATO_PERSONAL',
        campo: `${prefijo}: Ocupación`,
        etiqueta: 'Ocupación',
        valor: obj.ocupacion,
        seleccionado: true,
        esDatoPersonal: true,
        sujetoPadreId: padre.id
      });
    }
  }
}