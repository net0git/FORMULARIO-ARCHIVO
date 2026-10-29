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
  // URL base de Ollama (configurable a localhost o IP del servidor de red)
  private ollamaUrl = 'http://localhost:11434';
  private modeloPorDefecto = 'llama3.2:3b';

  get urlServidor(): string {
    return this.ollamaUrl;
  }

  set urlServidor(url: string) {
    this.ollamaUrl = url ? url.replace(/\/+$/, '') : 'http://localhost:11434';
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
            variantes: [menor.trim()],
            seleccionado: true,
            esDatoPersonal: true
          });
        }
      }
    }

    // 2. Agraviados / Víctimas
    if (res.agraviados && Array.isArray(res.agraviados)) {
      for (const agr of res.agraviados) {
        if (agr.nombre) {
          const vars = [agr.nombre];
          if (agr.alias_variantes) vars.push(...agr.alias_variantes);

          sujetos.push({
            id: 'ia_agr_' + Math.random().toString(36).substring(2, 9),
            categoria: 'AGRAVIADO',
            campo: 'Agraviada / Víctima',
            etiqueta: 'AGRAVIADA',
            valor: agr.nombre.trim(),
            variantes: Array.from(new Set(vars.map(v => v.trim()))),
            seleccionado: true,
            esDatoPersonal: true
          });
        }

        // Datos personales del agraviado
        this.extraerCamposDetalle(sujetos, agr, 'AGRAVIADA');
      }
    }

    // 3. Demandados / Imputados
    if (res.demandados_imputados && Array.isArray(res.demandados_imputados)) {
      for (const dem of res.demandados_imputados) {
        if (dem.nombre) {
          const vars = [dem.nombre];
          if (dem.alias_variantes) vars.push(...dem.alias_variantes);

          sujetos.push({
            id: 'ia_dem_' + Math.random().toString(36).substring(2, 9),
            categoria: 'DEMANDADO',
            campo: 'Demandado / Imputado',
            etiqueta: 'DEMANDADO',
            valor: dem.nombre.trim(),
            variantes: Array.from(new Set(vars.map(v => v.trim()))),
            seleccionado: true,
            esDatoPersonal: true
          });
        }

        // Datos personales del demandado
        this.extraerCamposDetalle(sujetos, dem, 'DEMANDADO');
      }
    }

    return sujetos;
  }

  private extraerCamposDetalle(sujetos: SujetoCensura[], obj: any, prefijo: string): void {
    if (obj.identificado && obj.identificado !== '<No Definido>') {
      const numDni = obj.identificado.replace(/[^0-9]/g, '');
      const val = numDni.length === 8 ? numDni : obj.identificado;
      sujetos.push({
        id: 'ia_dni_' + Math.random().toString(36).substring(2, 9),
        categoria: 'DNI',
        campo: `${prefijo}: DNI`,
        etiqueta: 'DNI',
        valor: val,
        variantes: [val],
        seleccionado: true,
        esDatoPersonal: true
      });
    }

    if (obj.telefono && obj.telefono.length > 5) {
      sujetos.push({
        id: 'ia_tel_' + Math.random().toString(36).substring(2, 9),
        categoria: 'TELEFONO',
        campo: `${prefijo}: Teléfono`,
        etiqueta: 'Teléfono',
        valor: obj.telefono,
        variantes: [obj.telefono, obj.telefono.replace(/[\-\s]/g, '')],
        seleccionado: true,
        esDatoPersonal: true
      });
    }

    if (obj.domicilio && obj.domicilio.length > 6) {
      sujetos.push({
        id: 'ia_dom_' + Math.random().toString(36).substring(2, 9),
        categoria: 'DOMICILIO',
        campo: `${prefijo}: Domicilio`,
        etiqueta: 'Domicilio',
        valor: obj.domicilio,
        variantes: [obj.domicilio],
        seleccionado: true,
        esDatoPersonal: true
      });
    }

    if (obj.edad) {
      sujetos.push({
        id: 'ia_edad_' + Math.random().toString(36).substring(2, 9),
        categoria: 'DATO_PERSONAL',
        campo: `${prefijo}: Edad`,
        etiqueta: 'Edad',
        valor: String(obj.edad),
        variantes: [String(obj.edad)],
        seleccionado: true,
        esDatoPersonal: true
      });
    }

    if (obj.natural_de) {
      sujetos.push({
        id: 'ia_nat_' + Math.random().toString(36).substring(2, 9),
        categoria: 'DATO_PERSONAL',
        campo: `${prefijo}: Natural de`,
        etiqueta: 'Natural de',
        valor: obj.natural_de,
        variantes: [obj.natural_de],
        seleccionado: true,
        esDatoPersonal: true
      });
    }

    if (obj.estado_civil) {
      sujetos.push({
        id: 'ia_ec_' + Math.random().toString(36).substring(2, 9),
        categoria: 'DATO_PERSONAL',
        campo: `${prefijo}: Estado Civil`,
        etiqueta: 'Estado Civil',
        valor: obj.estado_civil,
        variantes: [obj.estado_civil],
        seleccionado: true,
        esDatoPersonal: true
      });
    }

    if (obj.ocupacion) {
      sujetos.push({
        id: 'ia_oc_' + Math.random().toString(36).substring(2, 9),
        categoria: 'DATO_PERSONAL',
        campo: `${prefijo}: Ocupación`,
        etiqueta: 'Ocupación',
        valor: obj.ocupacion,
        variantes: [obj.ocupacion],
        seleccionado: true,
        esDatoPersonal: true
      });
    }
  }
}
