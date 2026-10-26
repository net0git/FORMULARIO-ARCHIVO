import { Injectable } from '@angular/core';

export interface ParteExpediente {
  nombre_parte: string;
  tipo_parte: string;
}

export interface ExpedienteArchivoCentral {
  codg_expdte: string;
  codg_expdte_origen: string;
  codg_anaqul: string;
  codg_fila: string;
  codg_column: string;
  codg_paquet: string;
  indc_incidn: string;
  indc_ubicac_archvo: string;
  codg_local: string;
  indc_anuldo: string;
  desc_instan: string;
  nro_formateado: string;
  partes: ParteExpediente[];
}

export interface RespuestaBusquedaExpediente {
  count: number;
  results: ExpedienteArchivoCentral[];
}

@Injectable({
  providedIn: 'root'
})
export class ConsultaArchivoService {
  private apiUrl = 'http://10.66.88.160:3000/api/expedientes/buscar';

  async buscarExpedientes(numero: string, anio: string): Promise<RespuestaBusquedaExpediente> {
    const numLimpio = numero.trim();
    const anioLimpio = anio.trim();

    if (!numLimpio || !anioLimpio) {
      return { count: 0, results: [] };
    }

    const url = `${this.apiUrl}?numero=${encodeURIComponent(numLimpio)}&anio=${encodeURIComponent(anioLimpio)}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Error en el servidor de consulta: ${res.statusText}`);
    }
    return await res.json();
  }
}
