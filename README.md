# Sistema de Gestión y Atención de Archivo Judicial

Sistema integral para la recepción, trámite, búsqueda física/digital y atención de solicitudes de desarchivo y copias de expedientes judiciales, con módulo avanzado de censura y disociación de datos personales en documentos PDF mediante OCR e Inteligencia Artificial local.

---

## 🏛️ Descripción General

El proyecto está diseñado bajo una arquitectura modular desacoplada con dos aplicaciones web desarrolladas en **Angular 18** y respaldadas por un backend serverless conectado a **Google Sheets / Google Apps Script**:

1. **`CLIENT-FORMULARIO` (Portal Público de Solicitudes)**:
   - Portal web orientado a usuarios, litigantes y mesa de partes.
   - Permite registrar solicitudes de búsqueda, lectura, copias simples/certificadas y desarchivo de expedientes.
   - Emite automáticamente una **Constancia de Solicitud en PDF** con código único y código de barras/QR al momento del registro.

2. **`CLIENT-ATENCION` (Panel Administrativo de Archivo Central)**:
   - Plataforma de administración para el personal del Archivo Central.
   - Gestión integral de solicitudes con filtros avanzados (número de expediente, partes procesales, fechas, estado).
   - Búsqueda y vinculación con la base histórica de expedientes y el sistema **Quipuscan** (datos de carátula, tomos, fojas, ubicación).
   - Registro y actualización de la ubicación física del expediente (estante, cuerpo, fila, caja).
   - Generación y descarga de la **Constancia de Atención Oficial en PDF**.
   - Módulo interactivo de **Censura y Disociación Digital de PDF** (para entrega pública de copias sin vulnerar datos sensibles ni nombres protegidos).
   - Gestión de usuarios del sistema, roles y sedes judiciales.

---

## ✨ Características Principales

### 📋 Módulo de Formulario (`CLIENT-FORMULARIO`)
- Validación en tiempo real del formato de expediente judicial (ej. `01379-2014-0-1001-JR-FT-02`).
- Soporte para diferentes tipos de solicitantes: parte procesal, abogado patrocinante, apoderado o tercero con interés legítimo.
- Carga de documentos de sustento (DNI, carné de abogado, vigencia de poder).
- Generación inmediata de constancia digital en formato PDF con `jsPDF`.
- Envío asíncrono y seguro hacia Google Sheets mediante Apps Script.

### 🛡️ Módulo Administrativo y Censura (`CLIENT-ATENCION`)
- **Gestión de Solicitudes**: Bandeja con paginación dinámica (10, 15, 20, 30, 100, 500, 1000 registros), filtros combinados y control de estados (Pendiente, En Proceso, Atendido, Observado).
- **Vinculación con Quipuscan / Archivo Central**: Cruce automático de metadatos del expediente, visualización de carátula escaneada y consulta de expedientes relacionados.
- **Herramienta Avanzada de Censura de PDF**:
  - Visualizador integrado de documentos con `PDF.js` y controles de zoom y navegación.
  - Detección automática por líneas visuales de sujetos procesales (Demandante, Demandado, Agraviado) y datos personales (DNI, teléfonos, domicilios).
  - Reconocimiento Óptico de Caracteres (**OCR**) con `Tesseract.js` para procesar documentos escaneados o imágenes sin capa de texto nativa.
  - Integración opcional con **IA Local (Ollama / Llama 3.2)** para análisis semántico y extracción de entidades jurídicas protegidas.
  - Herramienta de censura manual (*drag-to-redact*) para trazar áreas rectangulares personalizadas directamente sobre la página.
  - Exclusión puntual de recuadros con un clic (`✕`) sin desmarcar la lista de selección.
  - Aplicación permanente (*quemado irreversible*) de bloques negros usando `pdf-lib` con ajuste adaptativo de márgenes para asegurar cobertura total del 100% del texto.
- **Seguridad y Control de Acceso**: Autenticación con sesión persistente, cambio de contraseña y control de roles por Corte Superior.

---

## 🛠️ Tecnologías Utilizadas

- **Framework**: Angular 18 (Standalone Components, Signals, Reactive Forms).
- **Lenguaje**: TypeScript 5.5, HTML5, CSS3 modular.
- **Manipulación y Renderizado de PDF**:
  - `pdfjs-dist`: Renderizado de páginas en canvas y extracción de texto por coordenadas.
  - `pdf-lib`: Modificación binaria y aplicación permanente de censura en el documento.
  - `jspdf`: Emisión y maquetación de constancias oficiales.
- **Reconocimiento Óptico de Caracteres (OCR)**: `Tesseract.js` v7.
- **Inteligencia Artificial Local**: Integración HTTP con API de `Ollama` (modelo `llama3.2`).
- **Base de Datos y API**: Google Sheets + Google Apps Script Web App.
- **Hojas de Cálculo**: `xlsx` (SheetJS) para lectura y exportación de datos.

---

## 📁 Estructura del Repositorio

```text
FORMULARIO-ARCHIVO/
├── CLIENT-FORMULARIO/          # Aplicación cliente para registro de solicitudes (Puerto 4200)
│   ├── src/
│   │   ├── app/                # Componentes, servicios y modelos del formulario
│   │   ├── assets/             # Logos, íconos y estilos globales
│   │   └── index.html
│   ├── package.json
│   └── angular.json
│
├── CLIENT-ATENCION/            # Panel administrativo y censurador de PDF (Puerto 4201)
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/     # Componentes modales y censurador de PDF
│   │   │   ├── pages/          # Vistas principales (Login, Atención de Solicitudes)
│   │   │   ├── services/       # Servicios (IA, PDF Censura, Quipuscan, Archivo)
│   │   │   └── models/         # Definiciones de tipos e interfaces
│   │   ├── assets/
│   │   └── index.html
│   ├── package.json
│   └── angular.json
│
├── GOOGLE-SHEET/               # Backend en Google Apps Script y manuales de referencia
│   ├── google-apps-script/
│   │   └── Code.gs             # Código del backend web para Apps Script
│   └── manual.pdf              # Manual de usuario del sistema de archivo
│
├── .gitignore
├── GEMINI.md
└── README.md
```

---

## 🚀 Requisitos Previos

Asegúrate de contar con las siguientes herramientas instaladas en tu entorno de desarrollo:

- **Node.js**: Versión 18.x o 20.x LTS recomendada ([Descargar Node.js](https://nodejs.org/)).
- **npm**: Versión 9.x o superior (incluido con Node.js).
- **Angular CLI**: Versión 18 global:
  ```bash
  npm install -g @angular/cli@18
  ```
- *(Opcional)* **Ollama**: Si deseas habilitar el análisis semántico con IA local:
  ```bash
  # Instalar Ollama y descargar el modelo Llama 3.2
  ollama run llama3.2
  ```

---

## 📦 Proceso de Instalación y Ejecución

Sigue estos pasos para clonar, instalar dependencias y levantar ambos clientes en tu equipo local:

### 1. Clonar el Repositorio
```bash
git clone https://github.com/net0git/FORMULARIO-ARCHIVO.git
cd FORMULARIO-ARCHIVO
```

---

### 2. Configurar y Ejecutar `CLIENT-FORMULARIO` (Portal Público)

1. Ingresar a la carpeta del proyecto:
   ```bash
   cd CLIENT-FORMULARIO
   ```

2. Instalar las dependencias de Node:
   ```bash
   npm install
   ```

3. Iniciar el servidor de desarrollo:
   ```bash
   npm start
   ```
   *La aplicación estará accesible en [http://localhost:4200](http://localhost:4200).*

---

### 3. Configurar y Ejecutar `CLIENT-ATENCION` (Panel Administrativo)

1. En una nueva terminal, ingresar a la carpeta administrativa:
   ```bash
   cd CLIENT-ATENCION
   ```

2. Instalar las dependencias de Node:
   ```bash
   npm install
   ```

3. Iniciar el servidor de desarrollo:
   ```bash
   npm start
   ```
   *La aplicación estará accesible en [http://localhost:4201](http://localhost:4201).*

---

## ⚙️ Configuración del Backend (Google Apps Script)

Ambas aplicaciones se comunican con una Google Sheet configurada como base de datos central a través de una API Web desarrollada en **Google Apps Script**:

1. Crea o abre tu hoja de cálculo en Google Drive.
2. Abre la consola de Apps Script desde **Extensiones > Apps Script**.
3. Implementa el código del backend para manejar las solicitudes `doGet` y `doPost`.
4. Publica el proyecto como **Aplicación Web** (*Deploy > New deployment > Web app*) con acceso configurado para *Cualquier persona (Anyone)*.
5. Copia la URL de la aplicación web generada (`https://script.google.com/macros/s/.../exec`).
6. En `CLIENT-ATENCION`, puedes configurar o actualizar la URL directamente desde el modal **Conectar Google Sheet** en la sección de Configuración del menú lateral, o mediante el archivo de configuración local.

---

## 🏗️ Compilación para Producción

Para compilar cualquiera de los dos clientes para su despliegue en un servidor web de producción (Nginx, Apache, IIS o hosting estático):

```bash
# Compilar Formulario de Solicitudes
npm --prefix CLIENT-FORMULARIO run build

# Compilar Panel Administrativo y Censura
npm --prefix CLIENT-ATENCION run build
```

Los artefactos listos para producción se generarán en:
- `CLIENT-FORMULARIO/dist/client-formulario-archivo-pj/browser/`
- `CLIENT-ATENCION/dist/client-atencion-archivo-pj/browser/`

---

## 🔒 Privacidad y Disociación de Datos

El módulo de censura garantiza el cumplimiento de las normativas de transparencia y protección de datos personales en el ámbito judicial:
- Los datos censurados se eliminan visualmente aplicando rectángulos opacos trazados directamente en las capas vectoriales del PDF con `pdf-lib`.
- La información disociada no puede ser revelada seleccionando el texto ni alterando capas visuales en el visor de PDF.

---

## 📄 Licencia

Este proyecto ha sido desarrollado para la optimización de procesos de atención y custodia documental en archivos judiciales. Todos los derechos reservados.
