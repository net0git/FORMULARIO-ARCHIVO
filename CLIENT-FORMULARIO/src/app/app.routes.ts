import { Routes } from '@angular/router';
import { FormularioSolicitudComponent } from './pages/formulario-solicitud/formulario-solicitud.component';

export const routes: Routes = [
  { path: '', component: FormularioSolicitudComponent },
  { path: 'solicitud', component: FormularioSolicitudComponent },
  { path: '**', redirectTo: '' }
];
