export type EstadoSolicitud = 'PENDIENTE' | 'EN PROCESO' | 'CITADO' | 'FINALIZADO';

export interface DocumentoAdjunto {
  id: number;
  nombreArchivo: string;
  descripcion: string;
  tipo: 'DNI' | 'EXPEDIENTE' | 'TASA' | 'OTRO';
  mimeType: string;
  tamano?: number;
  base64Data?: string;
  url?: string;
  downloadUrl?: string;
}

export interface EventoSeguimiento {
  idEvento: number;
  idSolicitud: string;
  accion: string;
  usuario: string;
  trabajador: string;
  descripcion: string;
  fecha: string;
  documento?: DocumentoAdjunto | null;
}

export interface SolicitudArchivo {
  idSolicitud: string;
  estado: EstadoSolicitud;
  corte: string;
  tipoUsuario: string;
  tipoSolicitud: string;
  razonSolicitud?: string;
  fechaInicio: string;
  fechaFinal: string;
  tiempoTranscurrido: string;
  dni: string;
  apellidos: string;
  nombres: string;
  email: string;
  celular: string;
  domicilioProcesal: string;
  nroExpediente: string;
  numeroExpedienteCorto?: string;
  anioExpediente?: string;
  codigoCompletoExpediente?: string;
  demandante: string;
  demandado: string;
  materiaDelito: string;
  juzgadoEmisor: string;
  secretarioRemitente: string;
  fechaEnvioArchivo: string;
  juzgadoRemitir: string;
  motivoTramite: string;
  ubicacion: string;
  anaquel: string;
  fila: string;
  columna: string;
  paquete: string;
  documentos: DocumentoAdjunto[];
  eventos: EventoSeguimiento[];
  carpetaDriveUrl?: string;
}

export interface CostoTramite {
  idTramite?: number;
  codigo: string;
  nombre: string;
  nombreCorto: string;
  costo: string;
  columna: 1 | 2;
}

export const CORTES_SUPERIORES: string[] = [
  'CUSCO'
];

export const TIPOS_USUARIO: { valor: string; etiqueta: string }[] = [
  { valor: 'Parte procesal', etiqueta: 'Parte procesal' },
  { valor: 'Abogado(a)', etiqueta: 'Abogado(a)' },
  { valor: 'Entidad Publica', etiqueta: 'Entidad Publica' },
  { valor: 'Personal del Poder Judicial', etiqueta: 'Personal del Poder Judicial' },
  { valor: 'Tercero', etiqueta: 'Tercero' }
];
