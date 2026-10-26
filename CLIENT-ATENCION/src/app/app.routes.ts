import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { AtencionSolicitudesComponent } from './pages/atencion-solicitudes/atencion-solicitudes.component';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'admin/solicitudes', component: AtencionSolicitudesComponent },
  { path: 'lista-solicitudes', component: AtencionSolicitudesComponent },
  { path: '**', redirectTo: 'login' }
];
