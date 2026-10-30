import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
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
import { ConsultaArchivoService, ExpedienteArchivoCentral } from '../../services/consulta-archivo.service';
import { QuipuscanService, QuipuscanExpediente } from '../../services/quipuscan.service';
import { PdfViewerModalComponent } from '../../components/pdf-viewer-modal/pdf-viewer-modal.component';
import { GoogleSheetModalComponent } from '../../components/google-sheet-modal/google-sheet-modal.component';
import { CensurarPdfComponent } from '../../components/censurar-pdf/censurar-pdf.component';

@Component({
  selector: 'app-atencion-solicitudes',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    PdfViewerModalComponent,
    GoogleSheetModalComponent,
    CensurarPdfComponent
  ],
  templateUrl: './atencion-solicitudes.component.html',
  styleUrls: ['./atencion-solicitudes.component.css']
})
export class AtencionSolicitudesComponent implements OnInit {
  usuarioActual: UsuarioSistema | null = null;
  sidebarColapsado = false;
  menuArchivoAbierto = true;
  menuHerramientasAbierto = false;
  menuConfiguracionAbierto = false;
  vistaActiva: 'solicitudes' | 'personal' | 'censurar-pdf' = 'solicitudes';
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

  // Consulta al Archivo Central
  consultaNumero = '';
  consultaAnio = '';
  buscandoEnArchivo = false;
  todosResultadosArchivoCentral: ExpedienteArchivoCentral[] = [];
  resultadosArchivoCentral: ExpedienteArchivoCentral[] = [];
  expedienteSeleccionadoDetalle: ExpedienteArchivoCentral | null = null;
  mensajeErrorBusquedaArchivo = '';

  // Filtros automáticos extraídos de "Datos del expediente"
  filtrosCoincidencias: { clave: string; valor: string; activo: boolean }[] = [];

  // Mapa de resultados Quipuscan (indexado por nro_expediente / nro_formateado)
  quipuscanMap = new Map<string, QuipuscanExpediente>();
  solicitudTieneQuipuscan = false;

  // Mapa de persistencia Quipuscan por idSolicitud (para mantener el acceso después de guardar)
  solicitudesQuipuscanMap = new Map<number, QuipuscanExpediente>();
  solicitudesExpedienteArchivoMap = new Map<number, ExpedienteArchivoCentral>();

  // 6. Modal Constancia PDF y Visor de Documentos Adjuntos (Pág. 20 y 21)
  mostrarModalPdf = false;
  documentoVisorActivo: DocumentoAdjunto | null = null;
  modoDocsEventos = false;

  // Modal Cambiar Clave (Topbar)
  mostrarModalCambiarClave = false;
  nuevaClaveInput = '';

  // Modal Google Sheets
  mostrarModalGoogleSheet = false;

  // Modal Quipuscan (Ventana emergente con datos y visor de portada)
  mostrarModalQuipuscan = false;
  expedienteQuipuscanActivo: QuipuscanExpediente | null = null;
  expedienteArchivoActivo: ExpedienteArchivoCentral | null = null;
  urlPortadaQuipuscanSegura: SafeResourceUrl | null = null;
  descargandoExpedienteQuipuscan = false;

  // Alerta verde de confirmación del sistema
  alertaVerdeMensaje = '';

  constructor(
    public archivoService: ArchivoService,
    private pdfService: PdfConstanciaService,
    private consultaArchivoService: ConsultaArchivoService,
    private quipuscanService: QuipuscanService,
    private sanitizer: DomSanitizer,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.menuArchivoAbierto = true;
    this.menuHerramientasAbierto = false;
    this.menuConfiguracionAbierto = false;

    this.usuarioActual = this.archivoService.obtenerUsuarioSesion();
    if (!this.usuarioActual) {
      this.router.navigate(['/login']);
      return;
    }

    this.cargarVinculosQuipuscan();

    this.archivoService.solicitudes$.subscribe((lista) => {
      this.todasLasSolicitudes = lista;
      this.aplicarFiltros();
      if (this.solicitudActiva) {
        const actualizada = lista.find((s) => Number(s.idSolicitud) === Number(this.solicitudActiva?.idSolicitud));
        if (actualizada) {
          this.solicitudActiva = actualizada;
        }
      }
      // Verificar solicitudes que tengan Quipuscan disponible
      this.verificarQuipuscanParaListaSolicitudes(lista);
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
    const nroSol = (sol.codigoCompletoExpediente || sol.nroExpediente || '').trim();
    if (nroSol) {
      this.quipuscanService.obtenerDetalleExpediente(nroSol).then((res) => {
        this.solicitudTieneQuipuscan = Boolean(res && res.length > 0);
        if (this.solicitudTieneQuipuscan) {
          this.quipuscanMap.set(nroSol, res[0]);
        }
      });
    } else {
      this.solicitudTieneQuipuscan = false;
    }
  }

  descargarOVerAdjunto(doc: DocumentoAdjunto): void {
    this.documentoVisorActivo = doc;
    this.mostrarModalPdf = true;
  }

  verDocumentoEvento(ev: EventoSeguimiento, sol: SolicitudArchivo): void {
    if (ev.accion === 'REGISTRO DE SOLICITUD') {
      this.solicitudActiva = sol;
      this.documentoVisorActivo = null;
      this.modoDocsEventos = false;
      this.mostrarModalPdf = true;
      return;
    }
    if (ev.documento) {
      this.solicitudActiva = sol;
      this.documentoVisorActivo = ev.documento;
      this.modoDocsEventos = false;
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

    const tieneRegistroGuardado = Boolean(
      (sol.ubicacion && sol.ubicacion.trim()) ||
      (sol.anaquel && sol.anaquel.trim()) ||
      (sol.fila && sol.fila.trim()) ||
      (sol.columna && sol.columna.trim()) ||
      (sol.paquete && sol.paquete.trim())
    );

    this.ubicacionForm = {
      ubicacion: sol.ubicacion || '',
      anaquel: sol.anaquel || '',
      fila: sol.fila || '',
      columna: sol.columna || '',
      paquete: sol.paquete || ''
    };

    this.todosResultadosArchivoCentral = [];
    this.resultadosArchivoCentral = [];
    this.filtrosCoincidencias = [];
    this.expedienteSeleccionadoDetalle = null;
    this.mensajeErrorBusquedaArchivo = '';

    // Recuperar vínculo previo de Quipuscan si ya se guardó para esta solicitud
    const vinculoPrevio = this.solicitudesQuipuscanMap.get(sol.idSolicitud);
    if (vinculoPrevio) {
      this.solicitudTieneQuipuscan = true;
      this.quipuscanMap.set(vinculoPrevio.nro_expediente, vinculoPrevio);
      const expArchivoPrevio = this.solicitudesExpedienteArchivoMap.get(sol.idSolicitud);
      if (expArchivoPrevio) {
        this.expedienteSeleccionadoDetalle = expArchivoPrevio;
      }
    } else {
      const nroSol = (sol.codigoCompletoExpediente || sol.nroExpediente || '').trim();
      if (nroSol) {
        this.quipuscanService.obtenerDetalleExpediente(nroSol).then((res) => {
          this.solicitudTieneQuipuscan = Boolean(res && res.length > 0);
          if (this.solicitudTieneQuipuscan) {
            this.quipuscanMap.set(nroSol, res[0]);
            this.guardarVinculoQuipuscan(sol.idSolicitud, nroSol, res[0]);
          }
        });
      } else {
        this.solicitudTieneQuipuscan = false;
      }
    }

    if (tieneRegistroGuardado) {
      // Si ya existe registro guardado, el filtro de búsqueda y las coincidencias quedan limpios
      this.consultaNumero = '';
      this.consultaAnio = '';
    } else {
      // Si no existe registro guardado, precargar número y año para facilitar la búsqueda
      let numExp = (sol.numeroExpedienteCorto || '').trim();
      let anioExp = (sol.anioExpediente || '').trim();

      if (!numExp || !anioExp) {
        const expStr = sol.codigoCompletoExpediente || sol.nroExpediente || '';
        const match = expStr.match(/(\d+)-(\d{4})/);
        if (match) {
          if (!numExp) numExp = String(parseInt(match[1], 10));
          if (!anioExp) anioExp = match[2];
        }
      }

      this.consultaNumero = numExp;
      this.consultaAnio = anioExp;

      if (this.consultaNumero && this.consultaAnio) {
        this.buscarEnArchivoCentral();
      }
    }

    this.mostrarModalUbicacion = true;
  }

  async buscarEnArchivoCentral(): Promise<void> {
    if (!this.consultaNumero.trim() || !this.consultaAnio.trim()) {
      this.mensajeErrorBusquedaArchivo = 'Ingrese el número y año del expediente a buscar.';
      return;
    }

    this.buscandoEnArchivo = true;
    this.mensajeErrorBusquedaArchivo = '';
    this.todosResultadosArchivoCentral = [];
    this.resultadosArchivoCentral = [];
    this.filtrosCoincidencias = [];

    try {
      const res = await this.consultaArchivoService.buscarExpedientes(
        this.consultaNumero.trim(),
        this.consultaAnio.trim()
      );
      this.todosResultadosArchivoCentral = res.results || [];
      if (this.todosResultadosArchivoCentral.length === 0) {
        this.mensajeErrorBusquedaArchivo = 'No se encontraron expedientes con los criterios especificados.';
        this.resultadosArchivoCentral = [];
      } else {
        this.generarFiltrosDesdeSolicitud();
        this.aplicarFiltrosCoincidencias();
        this.consultarQuipuscanParaResultados(this.todosResultadosArchivoCentral);
      }
    } catch (err) {
      this.mensajeErrorBusquedaArchivo = 'Error al consultar el Archivo Central: ' + ((err as Error)?.message || 'Sin conexión');
    } finally {
      this.buscandoEnArchivo = false;
    }
  }

  /**
   * Genera las etiquetas de coincidencias basadas en los campos de "Datos del expediente" de la solicitud
   */
  private generarFiltrosDesdeSolicitud(): void {
    if (!this.solicitudActiva) return;
    const filtros: { clave: string; valor: string; activo: boolean }[] = [];

    const normalizar = (txt?: string) => (txt || '').trim();

    // 1. Demandante / Agraviado
    const dte = normalizar(this.solicitudActiva.demandante);
    if (dte && dte !== '-') {
      filtros.push({ clave: 'Demandante', valor: dte, activo: true });
    }

    // 2. Demandado / Inculpado
    const ddo = normalizar(this.solicitudActiva.demandado);
    if (ddo && ddo !== '-') {
      filtros.push({ clave: 'Demandado', valor: ddo, activo: true });
    }

    // 3. Juzgado / Instancia
    const juz = normalizar(this.solicitudActiva.juzgadoEmisor);
    if (juz && juz !== '-') {
      filtros.push({ clave: 'Juzgado', valor: juz, activo: true });
    }

    // 4. Materia / Delito
    const mat = normalizar(this.solicitudActiva.materiaDelito);
    if (mat && mat !== '-') {
      filtros.push({ clave: 'Materia', valor: mat, activo: true });
    }

    // 5. Código Completo
    const cod = normalizar(this.solicitudActiva.codigoCompletoExpediente);
    if (cod && cod !== '-' && cod !== this.solicitudActiva.nroExpediente) {
      filtros.push({ clave: 'Código', valor: cod, activo: true });
    }

    this.filtrosCoincidencias = filtros;
  }

  /**
   * Filtra los resultados del Archivo Central según las etiquetas activas.
   * Si no coincide ninguno con todos los filtros activos, o si se eliminan etiquetas, se recalcula dinámicamente.
   */
  aplicarFiltrosCoincidencias(): void {
    const filtrosActivos = this.filtrosCoincidencias.filter((f) => f.activo);

    if (filtrosActivos.length === 0) {
      this.resultadosArchivoCentral = [...this.todosResultadosArchivoCentral];
      return;
    }

    const limpiarTexto = (t: string) =>
      (t || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, ' ')
        .trim();

    // Filtro progresivo / coincidencia
    this.resultadosArchivoCentral = this.todosResultadosArchivoCentral.filter((exp) => {
      // Texto completo del expediente para búsqueda amplia
      const textoPartes = (exp.partes || []).map((p) => `${p.tipo_parte} ${p.nombre_parte}`).join(' ');
      const textoExp = `${exp.nro_formateado} ${exp.desc_instan} ${exp.codg_expdte} ${exp.codg_expdte_origen} ${textoPartes}`;
      const textoLimpio = limpiarTexto(textoExp);

      // Comprobamos si cumple con los filtros activos
      // Una coincidencia es positiva si al menos una palabra clave significativa (>3 letras) del filtro está en el expediente
      return filtrosActivos.some((f) => {
        const palabras = limpiarTexto(f.valor)
          .split(/\s+/)
          .filter((p) => p.length >= 3 && !['sede', 'juzgado', 'sala', 'civil', 'penal', 'paz', 'letrado', 'del', 'los', 'las', 'por', 'con'].includes(p));

        if (palabras.length === 0) {
          return textoLimpio.includes(limpiarTexto(f.valor));
        }

        // Si contiene alguna palabra clave del demandante, demandado o juzgado
        return palabras.some((palabra) => textoLimpio.includes(palabra));
      });
    });

    // Si después de filtrar no queda ninguno, mostramos todos para no bloquear al usuario pero dejamos las etiquetas
    if (this.resultadosArchivoCentral.length === 0 && this.todosResultadosArchivoCentral.length > 0) {
      this.resultadosArchivoCentral = [...this.todosResultadosArchivoCentral];
    }
  }

  eliminarFiltroCoincidencia(filtro: { clave: string; valor: string; activo: boolean }): void {
    filtro.activo = false;
    this.aplicarFiltrosCoincidencias();
  }

  restaurarTodosLosFiltros(): void {
    this.filtrosCoincidencias.forEach((f) => (f.activo = true));
    this.aplicarFiltrosCoincidencias();
  }

  seleccionarExpedienteArchivo(item: ExpedienteArchivoCentral): void {
    this.ubicacionForm.ubicacion = item.desc_instan ? `${item.desc_instan} (Local ${item.codg_local || ''})`.trim() : (item.codg_local ? `Local ${item.codg_local}` : '');
    this.ubicacionForm.anaquel = item.codg_anaqul || '';
    this.ubicacionForm.fila = item.codg_fila || '';
    this.ubicacionForm.columna = item.codg_column || '';
    this.ubicacionForm.paquete = item.codg_paquet || '';
    this.expedienteSeleccionadoDetalle = item;

    if (this.solicitudActiva) {
      if (item.nro_formateado) {
        this.solicitudActiva.codigoCompletoExpediente = item.nro_formateado;
      }
      const infoQuipuscan = this.obtenerQuipuscan(item);
      if (infoQuipuscan) {
        this.solicitudTieneQuipuscan = true;
        this.guardarVinculoQuipuscan(this.solicitudActiva.idSolicitud, infoQuipuscan.nro_expediente, infoQuipuscan, item);
      }
    }

    // Desplazamiento suave hacia el formulario para que el usuario verifique y guarde cuando lo desee
    setTimeout(() => {
      const formEl = document.getElementById('seccion-formulario-ubicacion');
      if (formEl) {
        formEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 100);
  }

  verDetalleExpediente(item: ExpedienteArchivoCentral): void {
    if (this.expedienteSeleccionadoDetalle === item) {
      this.expedienteSeleccionadoDetalle = null;
    } else {
      this.expedienteSeleccionadoDetalle = item;
      setTimeout(() => {
        const el = document.querySelector('.expediente-detalle-completo');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);
    }
  }

  async guardarUbicacionExpediente(): Promise<void> {
    if (!this.solicitudActiva) return;

    this.solicitudActiva.ubicacion = (this.ubicacionForm.ubicacion || '').trim().toUpperCase();
    this.solicitudActiva.anaquel = (this.ubicacionForm.anaquel || '').trim().toUpperCase();
    this.solicitudActiva.fila = (this.ubicacionForm.fila || '').trim().toUpperCase();
    this.solicitudActiva.columna = (this.ubicacionForm.columna || '').trim().toUpperCase();
    this.solicitudActiva.paquete = (this.ubicacionForm.paquete || '').trim().toUpperCase();

    // Si se seleccionó un expediente de los resultados, asegurar la vinculación permanente de Quipuscan
    if (this.expedienteSeleccionadoDetalle) {
      if (this.expedienteSeleccionadoDetalle.nro_formateado) {
        this.solicitudActiva.codigoCompletoExpediente = this.expedienteSeleccionadoDetalle.nro_formateado;
      }
      const infoQuipuscan = this.obtenerQuipuscan(this.expedienteSeleccionadoDetalle);
      if (infoQuipuscan) {
        this.solicitudTieneQuipuscan = true;
        this.guardarVinculoQuipuscan(
          this.solicitudActiva.idSolicitud,
          infoQuipuscan.nro_expediente,
          infoQuipuscan,
          this.expedienteSeleccionadoDetalle
        );
      }
    }

    await this.archivoService.actualizarUbicacion(this.solicitudActiva.idSolicitud, this.ubicacionForm);
    this.mostrarModalUbicacion = false;
    this.mostrarAlertaVerde('UBICACIÓN REGISTRADA');
  }

  // =========================================================================
  // INTEGRACIÓN QUIPUSCAN (Digitalización de Expedientes)
  // =========================================================================
  async consultarQuipuscanParaResultados(expedientes: ExpedienteArchivoCentral[]): Promise<void> {
    const promesas = (expedientes || []).map(async (exp) => {
      const nro = (exp.nro_formateado || exp.codg_expdte || '').trim();
      if (nro) {
        const res = await this.quipuscanService.obtenerDetalleExpediente(nro);
        if (res && res.length > 0) {
          this.quipuscanMap.set(nro, res[0]);
        }
      }
    });
    await Promise.all(promesas);
  }

  tieneQuipuscan(item: ExpedienteArchivoCentral | null | undefined): boolean {
    if (!item) return false;
    const nroFormateado = (item.nro_formateado || '').trim();
    const nroExpdte = (item.codg_expdte || '').trim();
    return Boolean(
      (nroFormateado && this.quipuscanMap.has(nroFormateado)) ||
      (nroExpdte && this.quipuscanMap.has(nroExpdte))
    );
  }

  obtenerQuipuscan(item: ExpedienteArchivoCentral | null | undefined): QuipuscanExpediente | undefined {
    if (!item) return undefined;
    const nroFormateado = (item.nro_formateado || '').trim();
    const nroExpdte = (item.codg_expdte || '').trim();
    if (nroFormateado && this.quipuscanMap.has(nroFormateado)) {
      return this.quipuscanMap.get(nroFormateado);
    }
    if (nroExpdte && this.quipuscanMap.has(nroExpdte)) {
      return this.quipuscanMap.get(nroExpdte);
    }
    return undefined;
  }

  esParteDemandado(tipoParte: string): boolean {
    const t = (tipoParte || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return t.includes('DEMANDAD') || t.includes('INCULPAD') || t.includes('IMPUTAD');
  }

  tieneParteDemandado(partes: { tipo_parte: string }[] | undefined): boolean {
    if (!partes || partes.length === 0) return false;
    return partes.some((p) => this.esParteDemandado(p.tipo_parte));
  }

  abrirModalQuipuscan(item: ExpedienteArchivoCentral, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    const info = this.obtenerQuipuscan(item);
    const nro = (item.nro_formateado || item.codg_expdte || '').trim();

    if (info) {
      this.expedienteQuipuscanActivo = info;
      this.expedienteArchivoActivo = item;
      const urlPortada = this.quipuscanService.obtenerUrlPortada(info.nro_expediente, info.codigo || '');
      this.urlPortadaQuipuscanSegura = this.sanitizer.bypassSecurityTrustResourceUrl(urlPortada);
      this.mostrarModalQuipuscan = true;
    } else if (nro) {
      this.quipuscanService.obtenerDetalleExpediente(nro).then((res) => {
        if (res && res.length > 0) {
          this.quipuscanMap.set(nro, res[0]);
          this.expedienteQuipuscanActivo = res[0];
          this.expedienteArchivoActivo = item;
          const urlPortada = this.quipuscanService.obtenerUrlPortada(res[0].nro_expediente, res[0].codigo || '');
          this.urlPortadaQuipuscanSegura = this.sanitizer.bypassSecurityTrustResourceUrl(urlPortada);
          this.mostrarModalQuipuscan = true;
        }
      });
    }
  }

  abrirModalQuipuscanDesdeSolicitud(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    if (!this.solicitudActiva) return;
    const nro = (this.solicitudActiva.codigoCompletoExpediente || this.solicitudActiva.nroExpediente || '').trim();
    if (nro && this.quipuscanMap.has(nro)) {
      const info = this.quipuscanMap.get(nro)!;
      this.expedienteQuipuscanActivo = info;
      this.expedienteArchivoActivo = null;
      const urlPortada = this.quipuscanService.obtenerUrlPortada(info.nro_expediente, info.codigo || '');
      this.urlPortadaQuipuscanSegura = this.sanitizer.bypassSecurityTrustResourceUrl(urlPortada);
      this.mostrarModalQuipuscan = true;
    }
  }

  cerrarModalQuipuscan(): void {
    this.mostrarModalQuipuscan = false;
    this.expedienteQuipuscanActivo = null;
    this.expedienteArchivoActivo = null;
    this.urlPortadaQuipuscanSegura = null;
    this.descargandoExpedienteQuipuscan = false;
  }

  async descargarExpedienteCompleto(): Promise<void> {
    if (!this.expedienteQuipuscanActivo) return;
    const info = this.expedienteQuipuscanActivo;
    const nro = info.nro_expediente;
    const dirFtp = info.dir_ftp || `${info.codigo}/EXPEDIENTES`;
    const fileName = nro.endsWith('.pdf') ? nro : `${nro}.pdf`;

    this.descargandoExpedienteQuipuscan = true;
    try {
      const blob = await this.quipuscanService.descargarArchivoFtp(fileName, dirFtp);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      this.mostrarAlertaVerde('EXPEDIENTE DESCARGADO');
    } catch (err) {
      console.error('Error al descargar expediente:', err);
      const urlDirecta = this.quipuscanService.obtenerUrlExpedientePdf(nro, dirFtp);
      window.open(urlDirecta, '_blank');
    } finally {
      this.descargandoExpedienteQuipuscan = false;
    }
  }

  formatearPesoBytes(bytes?: number): string {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // =========================================================================
  // PERSISTENCIA Y ASOCIACIÓN DE QUIPUSCAN CON SOLICITUDES
  // =========================================================================
  private cargarVinculosQuipuscan(): void {
    try {
      const raw = localStorage.getItem('pj_archivo_quipuscan_v1');
      if (raw) {
        const mapa = JSON.parse(raw);
        Object.keys(mapa).forEach((idStr) => {
          const entry = mapa[idStr];
          if (entry && entry.quipuscan) {
            const idSol = Number(idStr);
            this.solicitudesQuipuscanMap.set(idSol, entry.quipuscan);
            this.quipuscanMap.set(entry.quipuscan.nro_expediente, entry.quipuscan);
            if (entry.expedienteArchivo) {
              this.solicitudesExpedienteArchivoMap.set(idSol, entry.expedienteArchivo);
            }
          }
        });
      }
    } catch (e) {
      console.warn('Error cargando vínculos Quipuscan:', e);
    }
  }

  guardarVinculoQuipuscan(
    idSolicitud: number,
    nroExpediente: string,
    quipuscan: QuipuscanExpediente,
    expArchivo?: ExpedienteArchivoCentral
  ): void {
    this.solicitudesQuipuscanMap.set(idSolicitud, quipuscan);
    this.quipuscanMap.set(quipuscan.nro_expediente, quipuscan);
    if (expArchivo) {
      this.solicitudesExpedienteArchivoMap.set(idSolicitud, expArchivo);
    }

    try {
      const raw = localStorage.getItem('pj_archivo_quipuscan_v1');
      const mapa = raw ? JSON.parse(raw) : {};
      mapa[idSolicitud] = {
        nroExpediente,
        quipuscan,
        expedienteArchivo: expArchivo || null
      };
      localStorage.setItem('pj_archivo_quipuscan_v1', JSON.stringify(mapa));
    } catch (e) {
      console.warn('Error guardando vínculo Quipuscan:', e);
    }
  }

  private async verificarQuipuscanParaListaSolicitudes(solicitudes: SolicitudArchivo[]): Promise<void> {
    const sinVerificar = (solicitudes || []).filter(
      (s) => !this.solicitudesQuipuscanMap.has(s.idSolicitud) && (s.codigoCompletoExpediente || s.nroExpediente)
    );
    for (const sol of sinVerificar.slice(0, 15)) {
      const nro = (sol.codigoCompletoExpediente || sol.nroExpediente || '').trim();
      if (nro) {
        const res = await this.quipuscanService.obtenerDetalleExpediente(nro);
        if (res && res.length > 0) {
          this.guardarVinculoQuipuscan(sol.idSolicitud, nro, res[0]);
        }
      }
    }
  }

  tieneQuipuscanSolicitud(sol: SolicitudArchivo): boolean {
    if (!sol) return false;
    if (this.solicitudesQuipuscanMap.has(sol.idSolicitud)) return true;
    const nro = (sol.codigoCompletoExpediente || sol.nroExpediente || '').trim();
    return Boolean(nro && this.quipuscanMap.has(nro));
  }

  abrirModalQuipuscanDesdeTabla(sol: SolicitudArchivo, event?: Event): void {
    if (event) event.stopPropagation();
    this.solicitudActiva = sol;

    if (this.solicitudesQuipuscanMap.has(sol.idSolicitud)) {
      const info = this.solicitudesQuipuscanMap.get(sol.idSolicitud)!;
      const expArchivo = this.solicitudesExpedienteArchivoMap.get(sol.idSolicitud) || null;
      this.expedienteQuipuscanActivo = info;
      this.expedienteArchivoActivo = expArchivo;
      const urlPortada = this.quipuscanService.obtenerUrlPortada(info.nro_expediente, info.codigo || '');
      this.urlPortadaQuipuscanSegura = this.sanitizer.bypassSecurityTrustResourceUrl(urlPortada);
      this.mostrarModalQuipuscan = true;
      return;
    }

    this.abrirModalQuipuscanDesdeSolicitud(event);
  }

  tieneQuipuscanUbicacionActual(): boolean {
    if (this.solicitudActiva && this.solicitudesQuipuscanMap.has(this.solicitudActiva.idSolicitud)) {
      return true;
    }
    if (this.expedienteSeleccionadoDetalle && this.tieneQuipuscan(this.expedienteSeleccionadoDetalle)) {
      return true;
    }
    if (this.solicitudTieneQuipuscan) {
      return true;
    }
    if (this.solicitudActiva) {
      const nro = (this.solicitudActiva.codigoCompletoExpediente || this.solicitudActiva.nroExpediente || '').trim();
      if (nro && this.quipuscanMap.has(nro)) {
        return true;
      }
    }
    return false;
  }

  abrirModalQuipuscanUbicacionActual(): void {
    if (this.solicitudActiva && this.solicitudesQuipuscanMap.has(this.solicitudActiva.idSolicitud)) {
      const info = this.solicitudesQuipuscanMap.get(this.solicitudActiva.idSolicitud)!;
      const expArchivo = this.solicitudesExpedienteArchivoMap.get(this.solicitudActiva.idSolicitud) || null;
      this.expedienteQuipuscanActivo = info;
      this.expedienteArchivoActivo = expArchivo;
      const urlPortada = this.quipuscanService.obtenerUrlPortada(info.nro_expediente, info.codigo || '');
      this.urlPortadaQuipuscanSegura = this.sanitizer.bypassSecurityTrustResourceUrl(urlPortada);
      this.mostrarModalQuipuscan = true;
      return;
    }

    if (this.expedienteSeleccionadoDetalle && this.tieneQuipuscan(this.expedienteSeleccionadoDetalle)) {
      this.abrirModalQuipuscan(this.expedienteSeleccionadoDetalle);
    } else {
      this.abrirModalQuipuscanDesdeSolicitud();
    }
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
