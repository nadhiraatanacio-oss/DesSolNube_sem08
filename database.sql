-- =========================================
-- Base de datos: TechStore - Gestión de Inventario
-- =========================================
SET NAMES utf8mb4;
DROP DATABASE IF EXISTS techstore;
CREATE DATABASE techstore CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE techstore;

-- Tiendas de la cadena
CREATE TABLE tiendas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  direccion VARCHAR(150) NOT NULL
);

-- Roles (perfiles de usuario)
CREATE TABLE roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(30) NOT NULL UNIQUE,
  descripcion VARCHAR(150) NOT NULL
);

-- Usuarios
CREATE TABLE usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  password VARCHAR(255) NULL,
  tienda_id INT NOT NULL,
  rol_id INT NOT NULL,
  proveedor VARCHAR(20) NOT NULL DEFAULT 'local',
  proveedor_id VARCHAR(100) NULL,
  intentos_fallidos INT NOT NULL DEFAULT 0,
  bloqueado_hasta DATETIME NULL,
  mfa_secret VARCHAR(100) NULL,
  mfa_activo TINYINT(1) NOT NULL DEFAULT 0,
  mfa_intentos INT NOT NULL DEFAULT 0,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tienda_id) REFERENCES tiendas(id),
  FOREIGN KEY (rol_id) REFERENCES roles(id)
);

-- Productos del inventario
CREATE TABLE productos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  descripcion VARCHAR(255) NULL,
  precio DECIMAL(10,2) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  tienda_id INT NOT NULL,
  actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tienda_id) REFERENCES tiendas(id)
);

-- Auditoría de eventos de seguridad
CREATE TABLE auditoria (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NULL,
  email VARCHAR(120) NULL,
  accion VARCHAR(50) NOT NULL,
  detalle VARCHAR(255) NULL,
  ip VARCHAR(50) NULL,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Datos iniciales
INSERT INTO tiendas (nombre, direccion) VALUES
('TechStore Miraflores', 'Av. Larco 345, Miraflores'),
('TechStore San Isidro', 'Av. Javier Prado 1020, San Isidro'),
('TechStore Arequipa', 'Calle Mercaderes 210, Arequipa');

INSERT INTO roles (nombre, descripcion) VALUES
('ADMIN', 'Administrador del Sistema: acceso total'),
('GERENTE', 'Gerente de Tienda: gestiona productos de su tienda'),
('EMPLEADO', 'Empleado de Ventas: consulta productos y actualiza stock'),
('AUDITOR', 'Auditor: solo lectura y reportes');

INSERT INTO productos (nombre, descripcion, precio, stock, tienda_id) VALUES
('Laptop Lenovo IdeaPad 5', 'Ryzen 7, 16GB RAM, 512GB SSD', 3299.90, 12, 1),
('Mouse Logitech MX Master 3S', 'Mouse inalámbrico ergonómico', 429.00, 30, 1),
('Monitor LG 27"', 'IPS 4K UHD', 1499.00, 4, 1),
('iPhone 15 128GB', 'Color negro', 3999.00, 8, 2),
('Audífonos Sony WH-1000XM5', 'Cancelación de ruido', 1399.00, 3, 2),
('Teclado Redragon Kumara', 'Mecánico, switches rojos', 159.90, 25, 3),
('Tablet Samsung Galaxy Tab S9', '128GB, WiFi', 2799.00, 6, 3);