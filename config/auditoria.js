const pool = require('./db');

// Registra un evento de seguridad en la tabla auditoria
async function registrar(req, usuarioId, email, accion, detalle) {
  try {
    await pool.query(
      'INSERT INTO auditoria (usuario_id, email, accion, detalle, ip) VALUES (?, ?, ?, ?, ?)',
      [usuarioId || null, email || null, accion, detalle || null, req.ip]
    );
  } catch (err) {
    console.error('Error al registrar auditoría:', err.message);
  }
}

module.exports = { registrar };