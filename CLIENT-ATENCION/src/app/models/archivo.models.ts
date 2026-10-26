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
  idSolicitud: number;
  accion: string;
  usuario: string;
  trabajador: string;
  descripcion: string;
  fecha: string;
  documento?: DocumentoAdjunto | null;
}

export interface SolicitudArchivo {
  idSolicitud: number;
  nroSolicitud: number;
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

export interface UsuarioSistema {
  idUsuario?: number;
  usuario: string;
  password?: string;
  nombreCompleto: string;
  dni?: string;
  email?: string;
  corte: string;
  rol: string;
  activo?: boolean;
}

export const CORTES_SUPERIORES: string[] = [
  'AMAZONAS',
  'ANCASH',
  'APURIMAC',
  'AREQUIPA',
  'AYACUCHO',
  'CAJAMARCA',
  'CALLAO',
  'CAÑETE',
  'CUSCO',
  'HUANCAVELICA',
  'HUANUCO',
  'HUAURA',
  'ICA',
  'JUNIN',
  'LA LIBERTAD',
  'LAMBAYEQUE',
  'LIMA',
  'LIMA ESTE',
  'LIMA NORTE',
  'LIMA SUR',
  'LORETO',
  'MADRE DE DIOS',
  'MOQUEGUA',
  'PASCO',
  'PIURA',
  'PUENTE PIEDRA - VENTANILLA',
  'PUNO',
  'SAN MARTIN',
  'SANTA',
  'SELVA CENTRAL',
  'SULLANA',
  'TACNA',
  'TUMBES',
  'UCAYALI'
];
