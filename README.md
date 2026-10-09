# TechStore - Sistema de Gestión de Inventario

Laboratorio 08 - Desarrollo de Soluciones en la Nube (Tecsup)

Aplicación web con autenticación segura: registro con contraseña robusta, JWT,
bloqueo tras 5 intentos fallidos, MFA con TOTP (Google Authenticator),
login con Google y GitHub, y control de acceso por rol y por tienda.

## Tecnologías
Node.js, Express 5, EJS, MySQL, bcryptjs, jsonwebtoken, passport, otplib, qrcode.

## Perfiles
| Rol | Permisos |
|---|---|
| ADMIN | Gestiona usuarios, roles y todos los productos |
| GERENTE | Gestiona productos solo de su tienda |
| EMPLEADO | Consulta productos y actualiza stock de su tienda |
| AUDITOR | Solo lectura, reportes y auditoría |

## Ejecución
1. Importar `database.sql` en MySQL.
2. Copiar `.env.example` como `.env` y completar las claves.
3. `npm install`
4. `npm run seed` (crea usuarios de prueba, contraseña `TechStore2026!`)
5. `npm run dev` y abrir http://localhost:3000