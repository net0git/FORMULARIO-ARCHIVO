import { Injectable } from '@angular/core';

export interface QuipuscanExpediente {
  id_expediente: number;
  nro_expediente: string;
  serie_doc?: string;
  codigo?: string;
  dir_ftp?: string;
  peso_doc?: number;
  nombre_disco?: string;
}

@Injectable({
  providedIn: 'root'
})
export class QuipuscanService {
  private apiUrl = 'http://10.66.88.160:5100/api/expediente/detail';
  private cache = new Map<string, QuipuscanExpediente[]>();

  async obtenerDetalleExpediente(nroExpediente: string): Promise<QuipuscanExpediente[]> {
    const nroLimpio = (nroExpediente || '').trim();
    if (!nroLimpio) return [];

    if (this.cache.has(nroLimpio)) {
      return this.cache.get(nroLimpio)!;
    }

    try {
      const url = `${this.apiUrl}/${encodeURIComponent(nroLimpio)}`;
      const res = await fetch(url);
      if (!res.ok) {
        return [];
      }
      const data = await res.json();
      const resultado: QuipuscanExpediente[] = Array.isArray(data) ? data : (data ? [data] : []);
      this.cache.set(nroLimpio, resultado);
      return resultado;
    } catch (err) {
      console.warn('Error consultando servicio Quipuscan:', err);
      return [];
    }
  }

  limpiarCache(): void {
    this.cache.clear();
  }
}
