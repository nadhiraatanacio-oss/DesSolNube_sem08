// Crea un usuario de prueba por cada perfil (ejecutar: npm run seed)
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./config/db');

const PASSWORD = 'TechStore2026!';

const usuarios = [
  { nombre: 'Administrador General', email: 'admin@techstore.com', rol: 'ADMIN', tienda: 1 },
  { nombre: 'Gerente Miraflores', email: 'gerente1@techstore.com', rol: 'GERENTE', tienda: 1 },
  { nombre: 'Gerente San Isidro', email: 'gerente2@techstore.com', rol: 'GERENTE', tienda: 2 },
  { nombre: 'Empleado Miraflores', email: 'empleado@techstore.com', rol: 'EMPLEADO', tienda: 1 },
  { nombre: 'Auditor Interno', email: 'auditor@techstore.com', rol: 'AUDITOR', tienda: 1 }
];

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);
  for (const u of usuarios) {
    const [rol] = await pool.query('SELECT id FROM roles WHERE nombre = ?', [u.rol]);
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password, tienda_id, rol_id) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE password = VALUES(password), rol_id = VALUES(rol_id), tienda_id = VALUES(tienda_id)`,
      [u.nombre, u.email, hash, u.tienda, rol[0].id]
    );
    console.log(`OK  ${u.rol.padEnd(9)} ${u.email}`);
  }
  console.log(`\nContraseña de todos: ${PASSWORD}`);
  await pool.end();
}

main().catch((err) => {
  console.error('Error en seed:', err.message);
  process.exit(1);
});