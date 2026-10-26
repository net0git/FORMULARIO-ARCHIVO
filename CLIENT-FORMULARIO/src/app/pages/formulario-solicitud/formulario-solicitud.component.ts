import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CORTES_SUPERIORES,
  CostoTramite,
  DocumentoAdjunto,
  SolicitudArchivo,
  TIPOS_USUARIO
} from '../../models/archivo.models';
import { ArchivoService } from '../../services/archivo.service';
import { PdfViewerModalComponent } from '../../components/pdf-viewer-modal/pdf-viewer-modal.component';

@Component({
  selector: 'app-formulario-solicitud',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PdfViewerModalComponent
  ],
  templateUrl: './formulario-solicitud.component.html',
  styleUrls: ['./formulario-solicitud.component.css']
})
export class FormularioSolicitudComponent implements OnInit {
  // Control de pasos del Wizard (1 a 5)
  paso = 1;

  // Estado de conexión con Google Sheets
  conectado = false;
  verificandoConexion = true;
  mensajeErrorConexion = '';

  // Catálogos (Los trámites y costos provienen únicamente de Google Sheets)
  cortes = CORTES_SUPERIORES;
  tiposUsuario = TIPOS_USUARIO;
  costosCol1: CostoTramite[] = [];
  costosCol2: CostoTramite[] = [];
  todosLosTramites: CostoTramite[] = [];
  aniosDisponibles: string[] = [];

  // Paso 2: Datos del Tipo de solicitud
  corteSeleccionada = 'AMAZONAS';
  tipoUsuarioSeleccionado = 'Parte procesal';
  solicitoSeleccionado = '';
  razonSolicitud = '';

  // Paso 3: Identidad del Solicitante
  dni = '';
  dniValidado = false;
  apellidos = '';
  nombres = '';
  email = '';
  celular = '';
  domicilioProcesal = '';
  documentoDniAdjunto: DocumentoAdjunto | null = null;

  // Paso 4: Datos del expediente
  modoExpedienteManual = false;
  numeroExpedienteCorto = '';
  anioExpediente = '';
  numeroExpedienteCompleto = '';
  demandante = '';
  demandado = '';
  materiaDelito = '';
  juzgadoInstancia = '';
  documentoExpedienteAdjunto: DocumentoAdjunto | null = null;

  // Paso 5: Adjuntar Tasa(s) Judicial(es) y Otros Documentos (Pág. 10)
  documentosAdjuntos: DocumentoAdjunto[] = [];
  mostrarModalAgregarAdjunto = false;
  archivoSeleccionadoTemp: File | null = null;
  base64Temp = '';
  descripcionAdjuntoTemp = '';
  tipoAdjuntoTemp: 'DNI' | 'EXPEDIENTE' | 'TASA' | 'OTRO' = 'TASA';

  // Alertas rojas de validación (Págs. 7 y 8)
  alertasValidacion: string[] = [];

  // Alerta verde "Solicitud Registrada" y Visor PDF (Pág. 11)
  registrando = false;
  mostrarAlertaSolicitudRegistrada = false;
  solicitudRecienRegistrada: SolicitudArchivo | null = null;
  mostrarVisorPdf = false;

  constructor(public archivoService: ArchivoService) {}

  ngOnInit(): void {
    const anioActual = new Date().getFullYear();
    for (let y = anioActual; y >= 1985; y--) {
      this.aniosDisponibles.push(String(y));
    }
    this.anioExpediente = '';

    this.archivoService.verificandoConexion$.subscribe((verificando) => {
      this.verificandoConexion = verificando;
    });

    this.archivoService.mensajeErrorConexion$.subscribe((msg) => {
      this.mensajeErrorConexion = msg;
    });

    this.archivoService.conectado$.subscribe((estado) => {
      this.conectado = estado;
      if (!estado && this.paso > 1) {
        this.paso = 1;
      }
    });

    this.archivoService.tramites$.subscribe((lista) => {
      this.todosLosTramites = lista;
      this.costosCol1 = lista.filter((c) => c.columna === 1);
      this.costosCol2 = lista.filter((c) => c.columna === 2);
      if (lista.length > 0 && !this.solicitoSeleccionado) {
        this.solicitoSeleccionado = lista[0].codigo;
      }
    });
  }

  reintentarConexion(): void {
    this.archivoService.inicializarYVerificarHoja();
  }

  limpiarAlertas(): void {
    this.alertasValidacion = [];
  }

  // =========================================================================
  // PASO 1: DECLARACIÓN JURADA (BLOQUEADO SI NO HAY CONEXIÓN CON GOOGLE SHEET)
  // =========================================================================
  aceptarDeclaracionJurada(): void {
    this.limpiarAlertas();
    if (!this.conectado || this.todosLosTramites.length === 0) {
      this.alertasValidacion.push('EL FORMULARIO NO ESTÁ CONECTADO AL SERVIDOR DE ARCHIVO. VERIFIQUE LA CONEXIÓN.');
      return;
    }
    this.paso = 2;
  }

  descargarManualUsuario(): void {
    window.open('/manual.pdf', '_blank');
  }

  // =========================================================================
  // PASO 2: DATOS DEL TIPO DE SOLICITUD
  // =========================================================================
  irAPaso3(): void {
    this.limpiarAlertas();
    if (!this.conectado) return;
    if (
      !this.corteSeleccionada ||
      !this.tipoUsuarioSeleccionado ||
      !this.solicitoSeleccionado ||
      !this.razonSolicitud.trim()
    ) {
      this.alertasValidacion.push('LLENE TODOS LOS CAMPOS PARA CONTINUAR EN LA SIGUIENTE PANTALLA');
      return;
    }
    this.paso = 3;
  }

  // =========================================================================
  // PASO 3: IDENTIDAD DEL SOLICITANTE (DNI + FOTO/PDF)
  // =========================================================================
  onDniChange(): void {
    if (this.dni.trim().length === 8 && this.documentoDniAdjunto) {
      this.dniValidado = true;
    } else {
      this.dniValidado = false;
    }
  }

  validarDniConLupa(): void {
    this.limpiarAlertas();
    const limpio = (this.dni || '').trim();
    if (!/^\d{8}$/.test(limpio)) {
      this.alertasValidacion.push('INGRESE UN NÚMERO DE DNI VÁLIDO DE 8 DÍGITOS');
      return;
    }
    this.dniValidado = true;
  }

  onSeleccionarArchivoDni(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];

    this.leerArchivoComoBase64(file).then((base64) => {
      const nuevoDoc: DocumentoAdjunto = {
        id: Date.now(),
        nombreArchivo: file.name,
        descripcion: 'DNI DEL SOLICITANTE (FOTO/PDF)',
        tipo: 'DNI',
        mimeType: file.type || 'application/pdf',
        tamano: file.size,
        base64Data: base64
      };
      this.documentoDniAdjunto = nuevoDoc;
      this.documentosAdjuntos = [
        ...this.documentosAdjuntos.filter((d) => d.tipo !== 'DNI'),
        nuevoDoc
      ];
      if (this.dni.trim().length >= 8) {
        this.dniValidado = true;
      }
      this.limpiarAlertas();
    });
  }

  irAPaso4(): void {
    this.limpiarAlertas();
    if (!this.conectado) return;
    const limpioDni = (this.dni || '').trim();

    if (!this.dniValidado && !this.documentoDniAdjunto) {
      this.alertasValidacion.push('PRESIONE EL BOTÓN BUSCAR(ICONO LUPA) PARA VALIDAR SU DNI O ADJUNTE SU FOTO/PDF');
    }

    if (
      !limpioDni ||
      !this.apellidos.trim() ||
      !this.nombres.trim() ||
      !this.email.trim() ||
      !this.celular.trim()
    ) {
      this.alertasValidacion.push('LLENE TODOS LOS CAMPOS PARA CONTINUAR EN LA SIGUIENTE PANTALLA');
    }

    if (this.alertasValidacion.length > 0) {
      return;
    }

    this.paso = 4;
  }

  // =========================================================================
  // PASO 4: DATOS DEL EXPEDIENTE
  // =========================================================================
  alternarModoExpedienteManual(): void {
    this.limpiarAlertas();
    this.modoExpedienteManual = !this.modoExpedienteManual;
    if (this.modoExpedienteManual) {
      this.numeroExpedienteCorto = '';
      this.anioExpediente = '';
    } else {
      this.numeroExpedienteCompleto = '';
    }
  }

  irAPaso5(): void {
    this.limpiarAlertas();
    if (!this.conectado) return;

    if (!this.modoExpedienteManual) {
      if (!this.numeroExpedienteCorto.trim() || !this.anioExpediente.trim()) {
        this.alertasValidacion.push('DEBE INGRESAR EL NÚMERO Y AÑO DEL EXPEDIENTE');
      }
    } else {
      if (!this.numeroExpedienteCompleto.trim()) {
        this.alertasValidacion.push('DEBE INGRESAR EL CÓDIGO COMPLETO DEL EXPEDIENTE');
      }
    }

    if (
      !this.demandante.trim() ||
      !this.demandado.trim() ||
      !this.materiaDelito.trim() ||
      !this.juzgadoInstancia.trim()
    ) {
      this.alertasValidacion.push('LLENE TODOS LOS CAMPOS PARA CONTINUAR EN LA SIGUIENTE PANTALLA');
    }

    if (this.alertasValidacion.length > 0) {
      return;
    }

    this.paso = 5;
  }

  // =========================================================================
  // PASO 5: ADJUNTAR TASA(S) JUDICIAL(ES) Y OTROS DOCUMENTOS (PÁG. 10 y 11)
  // =========================================================================
  abrirModalAgregarDocumento(): void {
    this.archivoSeleccionadoTemp = null;
    this.base64Temp = '';
    this.descripcionAdjuntoTemp = '';
    this.tipoAdjuntoTemp = 'TASA';
    this.mostrarModalAgregarAdjunto = true;
  }

  onFileModalChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    this.archivoSeleccionadoTemp = file;
    this.leerArchivoComoBase64(file).then((b64) => {
      this.base64Temp = b64;
    });
  }

  confirmarAgregarFichero(): void {
    if (!this.archivoSeleccionadoTemp) {
      return;
    }
    const desc = (this.descripcionAdjuntoTemp || 'TASA JUDICIAL').trim().toUpperCase();
    const nuevo: DocumentoAdjunto = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      nombreArchivo: this.archivoSeleccionadoTemp.name,
      descripcion: desc,
      tipo: this.tipoAdjuntoTemp,
      mimeType: this.archivoSeleccionadoTemp.type || 'application/pdf',
      tamano: this.archivoSeleccionadoTemp.size,
      base64Data: this.base64Temp
    };

    this.documentosAdjuntos = [...this.documentosAdjuntos, nuevo];
    this.mostrarModalAgregarAdjunto = false;
    this.limpiarAlertas();
  }

  eliminarDocumentoAdjunto(id: number): void {
    const doc = this.documentosAdjuntos.find((d) => d.id === id);
    if (doc?.tipo === 'DNI') {
      this.documentoDniAdjunto = null;
    }
    if (doc?.tipo === 'EXPEDIENTE') {
      this.documentoExpedienteAdjunto = null;
    }
    this.documentosAdjuntos = this.documentosAdjuntos.filter((d) => d.id !== id);
  }

  async registrarSolicitudFinal(): Promise<void> {
    this.limpiarAlertas();
    if (!this.conectado) {
      this.alertasValidacion.push('EL FORMULARIO NO ESTÁ CONECTADO AL SERVIDOR.');
      return;
    }
    if (this.documentosAdjuntos.length === 0) {
      this.alertasValidacion.push(
        'DEBE ADJUNTAR AL MENOS UN DOCUMENTO (TASA JUDICIAL Y/O FOTO O PDF DE DNI)'
      );
      return;
    }

    const expedienteIdentificador = this.numeroExpedienteCompleto.trim()
      ? this.numeroExpedienteCompleto.trim()
      : `${this.numeroExpedienteCorto.trim()}-${this.anioExpediente.trim()}`;

    this.registrando = true;
    const creada = await this.archivoService.registrarNuevaSolicitud({
      corte: this.corteSeleccionada,
      tipoUsuario: this.tipoUsuarioSeleccionado,
      tipoSolicitud: this.solicitoSeleccionado,
      razonSolicitud: this.razonSolicitud.trim(),
      motivoTramite: this.razonSolicitud.trim(),
      dni: this.dni.trim(),
      apellidos: this.apellidos.trim(),
      nombres: this.nombres.trim(),
      email: this.email.trim(),
      celular: this.celular.trim(),
      domicilioProcesal: this.domicilioProcesal.trim(),
      nroExpediente: expedienteIdentificador,
      numeroExpedienteCorto: this.numeroExpedienteCorto.trim(),
      anioExpediente: this.anioExpediente.trim(),
      codigoCompletoExpediente: this.numeroExpedienteCompleto.trim(),
      demandante: this.demandante.trim(),
      demandado: this.demandado.trim(),
      materiaDelito: this.materiaDelito.trim(),
      juzgadoEmisor: this.juzgadoInstancia.trim(),
      documentos: this.documentosAdjuntos
    });

    this.registrando = false;
    this.solicitudRecienRegistrada = creada;
    this.mostrarAlertaSolicitudRegistrada = true;

    setTimeout(() => {
      if (this.mostrarAlertaSolicitudRegistrada) {
        this.mostrarAlertaSolicitudRegistrada = false;
        this.mostrarVisorPdf = true;
      }
    }, 1800);
  }

  cerrarAlertaYVerPdf(): void {
    this.mostrarAlertaSolicitudRegistrada = false;
    this.mostrarVisorPdf = true;
  }

  finalizarYReiniciarFormulario(): void {
    this.mostrarVisorPdf = false;
    this.paso = 1;
    this.razonSolicitud = '';
    this.dni = '';
    this.dniValidado = false;
    this.apellidos = '';
    this.nombres = '';
    this.email = '';
    this.celular = '';
    this.domicilioProcesal = '';
    this.documentoDniAdjunto = null;
    this.numeroExpedienteCorto = '';
    this.anioExpediente = '';
    this.numeroExpedienteCompleto = '';
    this.demandante = '';
    this.demandado = '';
    this.materiaDelito = '';
    this.juzgadoInstancia = '';
    this.documentoExpedienteAdjunto = null;
    this.documentosAdjuntos = [];
  }

  private leerArchivoComoBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }
}
