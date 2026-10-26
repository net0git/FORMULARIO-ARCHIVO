import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import { SolicitudArchivo } from '../models/archivo.models';

@Injectable({
  providedIn: 'root'
})
export class PdfConstanciaService {

  generarDocumentoPdf(sol: SolicitudArchivo): jsPDF {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.3);
    doc.rect(12, 12, 186, 273);

    this.dibujarLogoPJ(doc, 20, 20);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(35, 35, 35);
    doc.text(`SOLICITUD DE ARCHIVO - NRO: ${sol.nroSolicitud}`, 74, 28);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(95, 95, 95);
    doc.text(
      '"Recuerde que el plazo de atención es de 5 a 7 días hábiles contabilizados a partir de verificada y admitida su solicitud.',
      20,
      42
    );
    doc.text(
      'El plazo puede tardar más días si se trata de una búsqueda crítica"',
      20,
      46.5
    );

    let y = 56;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(155, 42, 38);
    doc.text('Declaración Jurada', 20, y);
    y += 5.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(90, 90, 90);
    const dj1 = doc.splitTextToSize(
      'Para dar inicio al tramite, deberá llenarse los datos del formulario y anexar de manera digital el DNI del solicitante y el documento de pago por derecho de trámite (mediante foto por ambos lados con teléfono celular).',
      162
    );
    doc.text(dj1, 26, y);
    y += dj1.length * 4.2 + 1.5;

    const dj2 = doc.splitTextToSize(
      'La información proporcionada por el solicitante se presume veraz y tiene el valor de declaración jurada; quedando a fiscalización posterior por la institución judicial, bajo responsabilidad administrativa, civil y penal en caso de verificarse la falsedad de lo informado.',
      162
    );
    doc.text(dj2, 26, y);
    y += dj2.length * 4.2 + 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(155, 42, 38);
    doc.text('Datos del Tipo de solicitud', 20, y);
    y += 6;

    y = this.dibujarFilaDato(doc, 'Fecha Registro:', this.formatearFechaCorta(sol.fechaInicio), 26, y);
    y = this.dibujarFilaDato(doc, 'Corte Superior:', sol.corte || '-', 26, y);
    y = this.dibujarFilaDato(doc, 'Tipo de Usuario:', sol.tipoUsuario || '-', 26, y);
    y = this.dibujarFilaDato(doc, 'Solicito:', sol.tipoSolicitud || '-', 26, y);
    if (sol.razonSolicitud || sol.motivoTramite) {
      y = this.dibujarFilaDato(doc, 'Razón:', sol.razonSolicitud || sol.motivoTramite || '-', 26, y);
    }
    y += 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(155, 42, 38);
    doc.text('Datos Básicos', 20, y);
    y += 6;

    y = this.dibujarFilaDato(doc, 'Nro Doc (DNI):', sol.dni || '-', 26, y);
    y = this.dibujarFilaDato(doc, 'Apellidos:', sol.apellidos || '-', 26, y);
    y = this.dibujarFilaDato(doc, 'Nombres:', sol.nombres || '-', 26, y);
    y = this.dibujarFilaDato(doc, 'Correo Electrónico:', sol.email || '-', 26, y);
    y = this.dibujarFilaDato(doc, 'Teléfono Celular:', sol.celular || '-', 26, y);
    y = this.dibujarFilaDato(doc, 'Domicilio Procesal:', sol.domicilioProcesal || '-', 26, y);
    y += 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(155, 42, 38);
    doc.text('Datos del Expediente', 20, y);
    y += 6;

    y = this.dibujarFilaDato(doc, 'Número Expediente:', sol.nroExpediente || '-', 26, y);
    y = this.dibujarFilaDato(doc, 'Demandante/Agraviado:', sol.demandante || '-', 26, y);
    y = this.dibujarFilaDato(doc, 'Demandado/Inculpado:', sol.demandado || '-', 26, y);
    y = this.dibujarFilaDato(doc, 'Materia/Delito:', sol.materiaDelito || '-', 26, y);
    y = this.dibujarFilaDato(doc, 'Juzgado/Instancia:', sol.juzgadoEmisor || '-', 26, y);

    if (sol.ubicacion || sol.anaquel || sol.paquete) {
      y += 2;
      y = this.dibujarFilaDato(
        doc,
        'Ubicación Física:',
        `Ubic: ${sol.ubicacion || '-'} | Anaquel: ${sol.anaquel || '-'} | Fila: ${sol.fila || '-'} | Col: ${sol.columna || '-'} | Paquete: ${sol.paquete || '-'}`,
        26,
        y
      );
    }

    y += 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(155, 42, 38);
    doc.text('Documentos Adjuntos Registrados', 20, y);
    y += 6;

    if (sol.documentos && sol.documentos.length > 0) {
      sol.documentos.forEach((adj, idx) => {
        y = this.dibujarFilaDato(
          doc,
          `Adjunto N° ${idx + 1} (${adj.tipo || 'DOC'}):`,
          `${adj.descripcion || 'Documento'} - [${adj.nombreArchivo}]`,
          26,
          y
        );
      });
    } else {
      y = this.dibujarFilaDato(doc, 'Adjuntos:', 'Sin documentos adjuntos adicionales', 26, y);
    }

    doc.setDrawColor(190, 190, 190);
    doc.line(20, 272, 190, 272);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Sistema de Gestión del Archivo v1.0.0 - Poder Judicial del Perú | Estado actual: ${sol.estado}`,
      20,
      277
    );

    return doc;
  }

  obtenerBlobUrl(sol: SolicitudArchivo): string {
    const doc = this.generarDocumentoPdf(sol);
    const blob = doc.output('blob');
    return URL.createObjectURL(blob);
  }

  obtenerBase64DataUri(sol: SolicitudArchivo): string {
    const doc = this.generarDocumentoPdf(sol);
    return doc.output('datauristring');
  }

  descargarConstanciaPdf(sol: SolicitudArchivo): void {
    const doc = this.generarDocumentoPdf(sol);
    doc.save(`CONSTANCIA_SOLICITUD_NRO_${sol.nroSolicitud}.pdf`);
  }

  obtenerBase64Pdf(sol: SolicitudArchivo): string {
    const doc = this.generarDocumentoPdf(sol);
    return doc.output('datauristring');
  }

  private dibujarFilaDato(doc: jsPDF, etiqueta: string, valor: string, x: number, y: number): number {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(110, 110, 110);
    doc.text(etiqueta, x, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(65, 65, 65);
    const lines = doc.splitTextToSize(String(valor || '-').toUpperCase(), 125);
    doc.text(lines, x + 36, y);
    return y + Math.max(lines.length * 4.5, 5.2);
  }

  private dibujarLogoPJ(doc: jsPDF, x: number, y: number): void {
    doc.setDrawColor(123, 30, 34);
    doc.setFillColor(123, 30, 34);
    doc.setLineWidth(0.7);

    const s = 5.2;
    const gap = 1.4;
    doc.rect(x, y, s, s);
    doc.rect(x + s + gap, y, s, s);
    doc.rect(x, y + s + gap, s, s);
    doc.rect(x + s + gap, y + s + gap, s, s);

    doc.setLineWidth(0.4);
    doc.rect(x + 1.2, y + 1.2, s - 2.4, s - 2.4);
    doc.rect(x + s + gap + 1.2, y + 1.2, s - 2.4, s - 2.4);
    doc.rect(x + 1.2, y + s + gap + 1.2, s - 2.4, s - 2.4);
    doc.rect(x + s + gap + 1.2, y + s + gap + 1.2, s - 2.4, s - 2.4);

    doc.setFont('times', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(95, 95, 95);
    doc.text('PODER', x + 14.5, y + 3.5);
    doc.text('JUDICIAL', x + 14.5, y + 7.2);
    doc.setFont('times', 'normal');
    doc.setFontSize(7.5);
    doc.text('DEL PERÚ', x + 14.5, y + 10.8);
  }

  private formatearFechaCorta(fechaStr: string): string {
    if (!fechaStr) return '';
    const str = String(fechaStr).trim();
    const m1 = str.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
    if (m1) {
      return `${m1[1]}/${m1[2]}/${m1[3]} ${m1[4] || '00'}:${m1[5] || '00'}`;
    }
    const m2 = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]+(\d{2}):(\d{2}))?/);
    if (m2) {
      return `${m2[3]}/${m2[2]}/${m2[1]} ${m2[4] || '00'}:${m2[5] || '00'}`;
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    return str;
  }
}
