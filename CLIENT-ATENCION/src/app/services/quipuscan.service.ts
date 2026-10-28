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
  private ftpDownloadUrl = 'http://10.66.88.160:5100/api/ftp/download';
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

  /**
   * Genera la URL directa de descarga del archivo desde el servicio FTP
   */
  obtenerUrlFtp(fileName: string, folderPath: string): string {
    const fName = encodeURIComponent((fileName || '').trim());
    const fPath = encodeURIComponent((folderPath || '').trim());
    return `${this.ftpDownloadUrl}?fileName=${fName}&folderPath=${fPath}`;
  }

  /**
   * Genera la URL de la portada del expediente en Quipuscan
   * Ejemplo: folderPath=EJFT2014CUSCO/PORTADAS, fileName=01379-2014-0-1001-JR-FT-02.pdf
   */
  obtenerUrlPortada(nroExpediente: string, codigo: string): string {
    const fileName = nroExpediente.endsWith('.pdf') ? nroExpediente : `${nroExpediente}.pdf`;
    const folderPath = `${codigo}/PORTADAS`;
    return this.obtenerUrlFtp(fileName, folderPath);
  }

  /**
   * Genera la URL del documento/expediente digitalizado en Quipuscan
   * Ejemplo: folderPath=EJFT2014CUSCO/EXPEDIENTES, fileName=01379-2014-0-1001-JR-FT-02.pdf
   */
  obtenerUrlExpedientePdf(nroExpediente: string, dirFtp: string): string {
    const fileName = nroExpediente.endsWith('.pdf') ? nroExpediente : `${nroExpediente}.pdf`;
    return this.obtenerUrlFtp(fileName, dirFtp);
  }

  /**
   * Descarga el archivo del FTP como Blob (por ejemplo para descarga directa o abrir con blob URL)
   */
  async descargarArchivoFtp(fileName: string, folderPath: string): Promise<Blob> {
    const url = this.obtenerUrlFtp(fileName, folderPath);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Error descargando archivo FTP (${res.status}): ${res.statusText}`);
    }
    return await res.blob();
  }

  /**
   * Descarga el archivo del FTP y lo convierte a Data URI base64 para el visor PDF interno
   */
  async descargarArchivoBase64(fileName: string, folderPath: string): Promise<string> {
    const blob = await this.descargarArchivoFtp(fileName, folderPath);
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(blob);
    });
  }

  limpiarCache(): void {
    this.cache.clear();
  }
}
