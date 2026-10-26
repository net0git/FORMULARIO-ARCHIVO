import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import {
  CORTES_SUPERIORES,
  DocumentoAdjunto,
  EstadoSolicitud,
  EventoSeguimiento,
  SolicitudArchivo,
  UsuarioSistema
} from '../../models/archivo.models';
import { ArchivoService } from '../../services/archivo.service';
import { PdfConstanciaService } from '../../services/pdf-constancia.service';
import { PdfViewerModalComponent } from '../../components/pdf-viewer-modal/pdf-viewer-modal.component';
import { GoogleSheetModalComponent } from '../../components/google-sheet-modal/google-sheet-modal.component';

@Component({
  selector: 'app-atencion-solicitudes',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    PdfViewerModalComponent,
    GoogleSheetModalComponent
  ],
  templateUrl: './atencion-solicitudes.component.html',
  styleUrls: ['./atencion-solicitudes.component.css']
})
export class AtencionSolicitudesComponent implements OnInit {
  usuarioActual: UsuarioSistema | null = null;
  sidebarColapsado = false;
  menuArchivoAbierto = true;
  menuConfiguracionAbierto = true;
  vistaActiva: 'solicitudes' | 'personal' = 'solicitudes';
  cortes = CORTES_SUPERIORES;

  // Lista completa y filtrada de Solicitudes
  todasLasSolicitudes: SolicitudArchivo[] = [];
  solicitudesFiltradas: SolicitudArchivo[] = [];

  // Gestión de Personal / Usuarios
  todosLosUsuarios: UsuarioSistema[] = [];
  usuariosFiltrados: UsuarioSistema[] = [];
  filtroUsuarioLogin = '';
  filtroUsuarioNombre = '';
  filtroUsuarioCorte = '';
  mostrarModalUsuario = false;
  editandoUsuario = false;
  usuarioForm: UsuarioSistema = {
    usuario: '',
    password: '',
    nombreCompleto: '',
    dni: '',
    email: '',
    corte: 'LA LIBERTAD',
    rol: 'PERSONAL JURISDICCIONAL',
    activo: true
  };

  // Filtros de Búsqueda (Pág. 12)
  filtroDemandado = '';
  filtroDemandante = '';
  filtroNroExpediente = '';
  filtroFechaInicio = '';
  filtroFechaFin = '';

  // Paginación configurable (Pág. 12, numeral 3: 10,15,20,30,100,500,1000 y 5000)
  opcionesTamanoPagina = [10, 15, 20, 30, 100, 500, 1000, 5000];
  tamanoPagina = 100;
  paginaActual = 1;

  // Solicitud activa seleccionada para cualquiera de las 6 acciones
  solicitudActiva: SolicitudArchivo | null = null;

  // 1. Modal Ver Detalles (Pág. 15)
  mostrarModalVerDetalles = false;

  // 2. Modal Envío de Correo (Pág. 16)
  mostrarModalEnviarCorreo = false;
  correoEnviarOriginal = false;
  correoDestinatario = '';
  correoCc = '';
  correoRespaldo = 'dfa.diego.flores@gmail.com';
  correoMensaje = '';
  correoAdjuntosExtras: { id: number; archivo: File | null; base64: string; nombre: string }[] = [
    { id: 1, archivo: null, base64: '', nombre: '' }
  ];
  enviandoCorreo = false;

  // 3. Modal Cambiar Estado (Pág. 17)
  mostrarModalCambiarEstado = false;
  nuevoEstadoSeleccionado: EstadoSolicitud = 'EN PROCESO';
  estadosDisponibles: EstadoSolicitud[] = ['PENDIENTE', 'EN PROCESO', 'CITADO', 'FINALIZADO'];

  // 4. Modal Agregar Seguimiento (Pág. 18 y 19)
  mostrarModalSeguimiento = false;
  descripcionSeguimiento = '';
  documentoSeguimientoTemp: DocumentoAdjunto | null = null;
  guardandoSeguimiento = false;

  // 5. Modal Ubicación Expediente (Pág. 19 y 20)
  mostrarModalUbicacion = false;
  ubicacionForm = {
    ubicacion: '',
    anaquel: '',
    fila: '',
    columna: '',
    paquete: ''
  };

  // 6. Modal Constancia PDF y Visor de Documentos Adjuntos (Pág. 20 y 21)
  mostrarModalPdf = false;
  documentoVisorActivo: DocumentoAdjunto | null = null;
  modoDocsEventos = false;

  // Modal Cambiar Clave (Topbar)
  mostrarModalCambiarClave = false;
  nuevaClaveInput = '';

  // Modal Google Sheets
  mostrarModalGoogleSheet = false;

  // Alerta verde de confirmación del sistema
  alertaVerdeMensaje = '';

  constructor(
    public archivoService: ArchivoService,
    private pdfService: PdfConstanciaService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.usuarioActual = this.archivoService.obtenerUsuarioSesion();
    if (!this.usuarioActual) {
      this.router.navigate(['/login']);
      return;
    }

    this.archivoService.solicitudes$.subscribe((lista) => {
      this.todasLasSolicitudes = lista;
      this.aplicarFiltros();
      if (this.solicitudActiva) {
        const actualizada = lista.find((s) => s.idSolicitud === this.solicitudActiva?.idSolicitud);
        if (actualizada) {
          this.solicitudActiva = actualizada;
        }
      }
    });

    this.archivoService.usuarios$.subscribe((usuarios) => {
      this.todosLosUsuarios = usuarios;
      this.aplicarFiltrosUsuarios();
    });
  }

  async recargarDesdeSheet(): Promise<void> {
    if (!this.archivoService.estaConectadoAGoogleSheet()) {
      this.mostrarModalGoogleSheet = true;
      return;
    }
    await this.archivoService.sincronizarDesdeGoogleSheet();
  }

  // =========================================================================
  // MÓDULO PERSONAL: ADMINISTRACIÓN DE USUARIOS
  // =========================================================================
  aplicarFiltrosUsuarios(): void {
    const login = this.filtroUsuarioLogin.trim().toLowerCase();
    const nombre = this.filtroUsuarioNombre.trim().toLowerCase();
    const corte = this.filtroUsuarioCorte.trim().toLowerCase();

    this.usuariosFiltrados = this.todosLosUsuarios.filter((u) => {
      if (login && !u.usuario.toLowerCase().includes(login)) return false;
      if (nombre && !u.nombreCompleto.toLowerCase().includes(nombre)) return false;
      if (corte && !u.corte.toLowerCase().includes(corte)) return false;
      return true;
    });
  }

  limpiarFiltrosUsuarios(): void {
    this.filtroUsuarioLogin = '';
    this.filtroUsuarioNombre = '';
    this.filtroUsuarioCorte = '';
    this.aplicarFiltrosUsuarios();
  }

  abrirNuevoUsuario(): void {
    this.editandoUsuario = false;
    this.usuarioForm = {
      usuario: '',
      password: '',
      nombreCompleto: '',
      dni: '',
      email: '',
      corte: 'LA LIBERTAD',
      rol: 'PERSONAL JURISDICCIONAL',
      activo: true
    };
    this.mostrarModalUsuario = true;
  }

  abrirEditarUsuario(u: UsuarioSistema): void {
    this.editandoUsuario = true;
    this.usuarioForm = {
      idUsuario: u.idUsuario,
      usuario: u.usuario,
      password: u.password || '',
      nombreCompleto: u.nombreCompleto,
      dni: u.dni || '',
      email: u.email || '',
      corte: u.corte,
      rol: u.rol,
      activo: u.activo !== false
    };
    this.mostrarModalUsuario = true;
  }

  async guardarFormularioUsuario(): Promise<void> {
    if (!this.usuarioForm.usuario.trim() || !this.usuarioForm.nombreCompleto.trim()) {
      return;
    }
    await this.archivoService.guardarUsuario(this.usuarioForm);
    this.mostrarModalUsuario = false;
    this.mostrarAlertaVerde(
      this.editandoUsuario ? 'USUARIO ACTUALIZADO CORRECTAMENTE' : 'USUARIO REGISTRADO CORRECTAMENTE'
    );
  }

  async alternarEstadoUsuario(u: UsuarioSistema): Promise<void> {
    if (!u.idUsuario) return;
    await this.archivoService.cambiarEstadoActivoUsuario(u.idUsuario);
    this.mostrarAlertaVerde('ESTADO DE USUARIO ACTUALIZADO');
  }

  async eliminarUsuarioConfirmado(u: UsuarioSistema): Promise<void> {
    if (!u.idUsuario) return;
    if (this.todosLosUsuarios.length <= 1) {
      return;
    }
    await this.archivoService.eliminarUsuario(u.idUsuario);
    this.mostrarAlertaVerde('USUARIO ELIMINADO CORRECTAMENTE');
  }

  // =========================================================================
  // FILTROS Y PAGINACIÓN
  // =========================================================================
  aplicarFiltros(): void {
    const demdo = this.filtroDemandado.trim().toLowerCase();
    const demte = this.filtroDemandante.trim().toLowerCase();
    const exp = this.filtroNroExpediente.trim().toLowerCase();
    const fIni = this.filtroFechaInicio;
    const fFin = this.filtroFechaFin;

    this.solicitudesFiltradas = this.todasLasSolicitudes.filter((s) => {
      if (demdo && !s.demandado.toLowerCase().includes(demdo)) return false;
      if (demte && !s.demandante.toLowerCase().includes(demte)) return false;
      if (exp && !s.nroExpediente.toLowerCase().includes(exp)) return false;
      if (fIni || fFin) {
        const fechaSolIso = this.extraerFechaIsoParaFiltro(s.fechaInicio);
        if (fIni && fechaSolIso && fechaSolIso < fIni) return false;
        if (fFin && fechaSolIso && fechaSolIso > fFin) return false;
      }
      return true;
    });

    this.paginaActual = 1;
  }

  private extraerFechaIsoParaFiltro(fechaStr: string): string {
    if (!fechaStr) return '';
    const soloFecha = String(fechaStr).trim().split(' ')[0];
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(soloFecha)) {
      const [dd, mm, yyyy] = soloFecha.split('/');
      return `${yyyy}-${mm}-${dd}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(soloFecha)) {
      return soloFecha;
    }
    const d = new Date(fechaStr);
    if (!isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    return '';
  }

  limpiarFiltros(): void {
    this.filtroDemandado = '';
    this.filtroDemandante = '';
    this.filtroNroExpediente = '';
    this.filtroFechaInicio = '';
    this.filtroFechaFin = '';
    this.aplicarFiltros();
  }

  get solicitudesPaginadas(): SolicitudArchivo[] {
    const inicio = (this.paginaActual - 1) * Number(this.tamanoPagina);
    const fin = inicio + Number(this.tamanoPagina);
    return this.solicitudesFiltradas.slice(inicio, fin);
  }

  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.solicitudesFiltradas.length / Number(this.tamanoPagina)));
  }

  get rangoTexto(): string {
    const total = this.solicitudesFiltradas.length;
    if (total === 0) return 'Del 0 al 0';
    const ini = (this.paginaActual - 1) * Number(this.tamanoPagina) + 1;
    return `Del ${ini} al ${Number(this.tamanoPagina)}`;
  }

  cambiarTamanoPagina(): void {
    this.paginaActual = 1;
  }

  paginaAnterior(): void {
    if (this.paginaActual > 1) {
      this.paginaActual--;
    }
  }

  paginaSiguiente(): void {
    if (this.paginaActual < this.totalPaginas) {
      this.paginaActual++;
    }
  }

  exportarExcel(): void {
    this.archivoService.exportarAExcel(this.solicitudesFiltradas);
  }

  // =========================================================================
  // ACCIÓN 1: VER DETALLES DE SOLICITUD (Pág. 15)
  // =========================================================================
  abrirVerDetalles(sol: SolicitudArchivo): void {
    this.solicitudActiva = sol;
    this.mostrarModalVerDetalles = true;
  }

  descargarOVerAdjunto(doc: DocumentoAdjunto): void {
    this.documentoVisorActivo = doc;
    this.mostrarModalPdf = true;
  }

  verDocumentoEvento(ev: EventoSeguimiento, sol: SolicitudArchivo): void {
    if (ev.accion === 'REGISTRO DE SOLICITUD') {
      this.solicitudActiva = sol;
      this.documentoVisorActivo = null;
      this.mostrarModalPdf = true;
      return;
    }
    if (ev.documento) {
      this.solicitudActiva = sol;
      this.documentoVisorActivo = ev.documento;
      this.mostrarModalPdf = true;
    }
  }

  // =========================================================================
  // ACCIÓN 2: ENVÍO DE CORREOS (Págs. 16 y 17)
  // =========================================================================
  abrirEnviarCorreo(sol: SolicitudArchivo): void {
    this.solicitudActiva = sol;
    this.correoEnviarOriginal = false;
    this.correoDestinatario = sol.email || '';
    this.correoCc = '';
    this.correoRespaldo = 'dfa.diego.flores@gmail.com';
    this.correoMensaje = `Buenos días señor(a) ${sol.nombres} ${sol.apellidos}, se está procediendo a atender su trámite (Solicitud N° ${sol.nroSolicitud} - Exp. ${sol.nroExpediente}), agradecemos su espera.`;
    this.correoAdjuntosExtras = [{ id: Date.now(), archivo: null, base64: '', nombre: '' }];
    this.mostrarModalEnviarCorreo = true;
  }

  agregarFilaAdjuntoCorreo(): void {
    this.correoAdjuntosExtras.push({
      id: Date.now() + Math.floor(Math.random() * 1000),
      archivo: null,
      base64: '',
      nombre: ''
    });
  }

  quitarFilaAdjuntoCorreo(id: number): void {
    this.correoAdjuntosExtras = this.correoAdjuntosExtras.filter((f) => f.id !== id);
  }

  onSeleccionarAdjuntoCorreo(event: Event, fila: { id: number; archivo: File | null; base64: string; nombre: string }): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const f = input.files[0];
    fila.archivo = f;
    fila.nombre = f.name;
    const reader = new FileReader();
    reader.onload = () => {
      fila.base64 = String(reader.result || '');
    };
    reader.readAsDataURL(f);
  }

  async confirmarEnvioCorreo(): Promise<void> {
    if (!this.solicitudActiva || !this.correoDestinatario.trim()) return;
    this.enviandoCorreo = true;

    const adjuntosEnviar: DocumentoAdjunto[] = [];
    if (this.correoEnviarOriginal) {
      adjuntosEnviar.push({
        id: 1,
        nombreArchivo: `CONSTANCIA_SOLICITUD_${this.solicitudActiva.nroSolicitud}.pdf`,
        descripcion: 'SOLICITUD ORIGINAL',
        tipo: 'OTRO',
        mimeType: 'application/pdf',
        base64Data: this.pdfService.obtenerBase64DataUri(this.solicitudActiva)
      });
      if (this.solicitudActiva.documentos) {
        adjuntosEnviar.push(...this.solicitudActiva.documentos);
      }
    }

    this.correoAdjuntosExtras.forEach((f, idx) => {
      if (f.base64) {
        adjuntosEnviar.push({
          id: idx + 10,
          nombreArchivo: f.nombre || `adjunto_${idx + 1}.pdf`,
          descripcion: 'ADJUNTO DE ATENCIÓN',
          tipo: 'OTRO',
          mimeType: f.archivo?.type || 'application/pdf',
          base64Data: f.base64
        });
      }
    });

    await this.archivoService.enviarCorreo({
      idSolicitud: this.solicitudActiva.idSolicitud,
      nroSolicitud: this.solicitudActiva.nroSolicitud,
      destinatario: this.correoDestinatario.trim(),
      cc: this.correoCc.trim(),
      correoRespaldo: this.correoRespaldo.trim(),
      mensaje: this.correoMensaje.trim(),
      enviarOriginal: this.correoEnviarOriginal,
      adjuntos: adjuntosEnviar
    });

    this.enviandoCorreo = false;
    this.mostrarModalEnviarCorreo = false;
    this.mostrarAlertaVerde('CORREO ENVIADO');
  }

  // =========================================================================
  // ACCIÓN 3: CAMBIO DE ESTADO DE SOLICITUD (Págs. 17 y 18)
  // =========================================================================
  abrirCambiarEstado(sol: SolicitudArchivo): void {
    this.solicitudActiva = sol;
    this.nuevoEstadoSeleccionado = sol.estado === 'PENDIENTE' ? 'EN PROCESO' : sol.estado;
    this.mostrarModalCambiarEstado = true;
  }

  async guardarCambioEstado(): Promise<void> {
    if (!this.solicitudActiva) return;
    await this.archivoService.cambiarEstado(this.solicitudActiva.idSolicitud, this.nuevoEstadoSeleccionado);
    this.mostrarModalCambiarEstado = false;
    this.mostrarAlertaVerde('ESTADO CAMBIADO CORRECTAMENTE');
  }

  // =========================================================================
  // ACCIÓN 4: AGREGAR DETALLES DE SEGUIMIENTO (Págs. 18 y 19)
  // =========================================================================
  abrirAgregarSeguimiento(sol: SolicitudArchivo): void {
    this.solicitudActiva = sol;
    this.descripcionSeguimiento = '';
    this.documentoSeguimientoTemp = null;
    this.guardandoSeguimiento = false;
    this.mostrarModalSeguimiento = true;
  }

  onSeleccionarArchivoSeguimiento(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      this.documentoSeguimientoTemp = null;
      return;
    }
    const f = input.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      this.documentoSeguimientoTemp = {
        id: Date.now(),
        nombreArchivo: f.name,
        descripcion: 'DOCUMENTO DE SEGUIMIENTO',
        tipo: 'OTRO',
        mimeType: f.type || 'application/pdf',
        tamano: f.size,
        base64Data: String(reader.result || '')
      };
    };
    reader.readAsDataURL(f);
  }

  limpiarArchivoSeguimiento(): void {
    this.documentoSeguimientoTemp = null;
  }

  async guardarSeguimiento(): Promise<void> {
    if (!this.solicitudActiva || !this.descripcionSeguimiento.trim() || this.guardandoSeguimiento) return;
    this.guardandoSeguimiento = true;
    try {
      await this.archivoService.agregarSeguimiento(
        this.solicitudActiva.idSolicitud,
        this.descripcionSeguimiento.trim(),
        this.documentoSeguimientoTemp
      );
      this.mostrarModalSeguimiento = false;
      this.documentoSeguimientoTemp = null;
      this.mostrarAlertaVerde('EVENTO REGISTRADO');
    } finally {
      this.guardandoSeguimiento = false;
    }
  }

  // =========================================================================
  // ACCIÓN 5: AGREGAR UBICACIÓN FÍSICA DE EXPEDIENTES (Págs. 19 y 20)
  // =========================================================================
  abrirUbicacionExpediente(sol: SolicitudArchivo): void {
    this.solicitudActiva = sol;
    this.ubicacionForm = {
      ubicacion: sol.ubicacion || '',
      anaquel: sol.anaquel || '',
      fila: sol.fila || '',
      columna: sol.columna || '',
      paquete: sol.paquete || ''
    };
    this.mostrarModalUbicacion = true;
  }

  async guardarUbicacionExpediente(): Promise<void> {
    if (!this.solicitudActiva) return;
    await this.archivoService.actualizarUbicacion(this.solicitudActiva.idSolicitud, this.ubicacionForm);
    this.mostrarModalUbicacion = false;
    this.mostrarAlertaVerde('UBICACION REGISTRADA');
  }

  // =========================================================================
  // ACCIÓN 6: VISUALIZACIÓN DE CONSTANCIA DE SOLICITUD PDF (Págs. 20 y 21)
  // =========================================================================
  abrirConstanciaPdf(sol: SolicitudArchivo): void {
    this.solicitudActiva = sol;
    this.documentoVisorActivo = null;
    this.modoDocsEventos = false;
    this.mostrarModalPdf = true;
  }

  // Abre el visor con todos los documentos (DOC) de los eventos unidos en un solo PDF
  abrirDocsEventosPdf(sol: SolicitudArchivo): void {
    this.solicitudActiva = sol;
    this.documentoVisorActivo = null;
    this.modoDocsEventos = true;
    this.mostrarModalPdf = true;
  }

  // =========================================================================
  // UTILIDADES Y SESIÓN
  // =========================================================================
  mostrarAlertaVerde(mensaje: string): void {
    this.alertaVerdeMensaje = mensaje;
  }

  async guardarNuevaClave(): Promise<void> {
    if (!this.nuevaClaveInput.trim()) return;
    await this.archivoService.cambiarClaveAdmin(this.nuevaClaveInput.trim());
    this.mostrarModalCambiarClave = false;
    this.nuevaClaveInput = '';
    this.mostrarAlertaVerde('CLAVE ACTUALIZADA CORRECTAMENTE');
  }

  cerrarSesion(): void {
    this.archivoService.cerrarSesion();
    this.router.navigate(['/login']);
  }
}
