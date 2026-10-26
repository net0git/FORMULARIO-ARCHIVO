import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ArchivoService } from '../../services/archivo.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="login-page-bg">
      <div class="login-card-outer fade-in">
        <!-- Franja superior guinda con insignia blanca flotante -->
        <div class="login-guinda-banner">
          <div class="login-brand-box">
            <div class="brand-icon">
              <i class="fa-solid fa-file-signature"></i>
            </div>
            <div class="brand-lines">
              <span>SISTEMA</span>
              <span>DE GESTIÓN</span>
              <span>DE ARCHIVO <small>v1.0.0</small></span>
            </div>
          </div>
        </div>

        <form class="login-form-body" (ngSubmit)="ingresar()">
          <p class="login-subtitle">Ingrese sus datos para iniciar sesión</p>

          <div class="login-input-group">
            <input
              type="text"
              name="usuario"
              [(ngModel)]="usuario"
              placeholder="Usuario"
              required
              autocomplete="username"
            />
            <span class="input-icon"><i class="fa-solid fa-user"></i></span>
          </div>

          <div class="login-input-group">
            <input
              type="password"
              name="password"
              [(ngModel)]="password"
              placeholder="Password"
              required
              autocomplete="current-password"
            />
            <span class="input-icon"><i class="fa-solid fa-lock"></i></span>
          </div>

          <!-- Captcha visual igual a la página 11 del manual -->
          <div class="captcha-canvas-box" (click)="generarCaptcha()" title="Haga clic para recargar el captcha">
            <div class="captcha-grid-lines"></div>
            <span class="captcha-chars">{{ codigoCaptcha }}</span>
            <button type="button" class="captcha-refresh" (click)="generarCaptcha(); $event.stopPropagation()">
              <i class="fa-solid fa-rotate"></i>
            </button>
          </div>

          <div class="login-input-group">
            <input
              type="text"
              name="captcha"
              [(ngModel)]="captchaIngresado"
              placeholder="captcha"
              required
              autocomplete="off"
            />
          </div>

          <div class="login-error" *ngIf="mensajeError">
            <i class="fa-solid fa-triangle-exclamation"></i> {{ mensajeError }}
          </div>

          <button type="submit" class="btn-ingresar" [disabled]="validando">
            {{ validando ? 'VALIDANDO...' : 'INGRESAR' }}
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .login-page-bg {
      min-height: 100vh;
      background: #d2d6de;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      position: relative;
    }
    .login-card-outer {
      width: 100%;
      max-width: 360px;
      background: #ffffff;
      border-radius: 4px;
      overflow: hidden;
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);
    }
    .login-guinda-banner {
      background: #7b1e22;
      height: 54px;
      position: relative;
      display: flex;
      justify-content: center;
      margin-bottom: 42px;
    }
    .login-brand-box {
      background: #ffffff;
      border: 2px solid #222;
      border-radius: 4px;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      position: absolute;
      top: 10px;
      box-shadow: 0 3px 10px rgba(0, 0, 0, 0.18);
    }
    .brand-icon {
      font-size: 34px;
      color: #111;
    }
    .brand-lines {
      display: flex;
      flex-direction: column;
      font-weight: 800;
      font-size: 14px;
      line-height: 1.12;
      color: #111;
    }
    .brand-lines small {
      color: #7b1e22;
      font-size: 10.5px;
    }
    .login-form-body {
      padding: 12px 24px 24px;
    }
    .login-subtitle {
      text-align: center;
      color: #666;
      font-size: 13px;
      margin-bottom: 16px;
    }
    .login-input-group {
      position: relative;
      margin-bottom: 14px;
    }
    .login-input-group input {
      width: 100%;
      padding: 9px 34px 9px 12px;
      border: 1px solid #d2d6de;
      border-radius: 2px;
      font-size: 13.5px;
      color: #333;
    }
    .login-input-group input:focus {
      outline: none;
      border-color: #7b1e22;
    }
    .input-icon {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      color: #555;
      font-size: 13px;
    }
    .captcha-canvas-box {
      position: relative;
      height: 58px;
      background: linear-gradient(135deg, #d7fbe8 0%, #c6f6d5 50%, #e6fffa 100%);
      border: 1px solid #b2f5ea;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      cursor: pointer;
      user-select: none;
    }
    .captcha-grid-lines {
      position: absolute;
      inset: 0;
      background-image:
        repeating-linear-gradient(25deg, rgba(45, 106, 79, 0.18) 0px, rgba(45, 106, 79, 0.18) 1px, transparent 1px, transparent 12px),
        repeating-linear-gradient(-25deg, rgba(45, 106, 79, 0.18) 0px, rgba(45, 106, 79, 0.18) 1px, transparent 1px, transparent 12px);
    }
    .captcha-chars {
      position: relative;
      font-family: 'Courier New', monospace;
      font-size: 26px;
      font-weight: 800;
      letter-spacing: 8px;
      color: #2c5e43;
      transform: skewX(-12deg) rotate(-2deg);
      text-shadow: 1px 1px 0 rgba(255, 255, 255, 0.8);
    }
    .captcha-refresh {
      position: absolute;
      right: 6px;
      bottom: 6px;
      background: rgba(255, 255, 255, 0.75);
      border: 1px solid #999;
      border-radius: 3px;
      padding: 2px 6px;
      font-size: 11px;
      color: #333;
    }
    .login-error {
      background: #f8d7da;
      color: #842029;
      border: 1px solid #f5c2c7;
      padding: 8px 10px;
      border-radius: 3px;
      font-size: 12px;
      margin-bottom: 12px;
    }
    .btn-ingresar {
      width: 100%;
      background: #6c757d;
      color: #ffffff;
      border: none;
      padding: 10px;
      font-weight: 600;
      font-size: 13px;
      letter-spacing: 0.5px;
      border-radius: 2px;
    }
    .btn-ingresar:hover {
      background: #5a6268;
    }
  `]
})
export class LoginComponent implements OnInit {
  usuario = '';
  password = '';
  codigoCaptcha = '';
  captchaIngresado = '';
  mensajeError = '';
  validando = false;

  constructor(
    private archivoService: ArchivoService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.generarCaptcha();
  }

  generarCaptcha(): void {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let res = '';
    for (let i = 0; i < 5; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    this.codigoCaptcha = res;
    this.captchaIngresado = '';
  }

  async ingresar(): Promise<void> {
    this.mensajeError = '';
    if (this.captchaIngresado.trim().toLowerCase() !== this.codigoCaptcha.toLowerCase()) {
      this.mensajeError = 'El código captcha ingresado no coincide.';
      this.generarCaptcha();
      return;
    }

    this.validando = true;
    const res = await this.archivoService.iniciarSesion(this.usuario, this.password);
    this.validando = false;

    if (res.ok) {
      this.router.navigate(['/admin/solicitudes']);
    } else {
      this.mensajeError = res.error || 'Usuario o contraseña incorrectos.';
      this.generarCaptcha();
    }
  }
}
