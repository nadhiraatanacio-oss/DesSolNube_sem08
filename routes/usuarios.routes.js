const express = require('express');
const pool = require('../config/db');
const { verificarToken, permitir } = require('../middlewares/auth');
const { registrar } = require('../config/auditoria');

const router = express.Router();
router.use(verificarToken, permitir('ADMIN'));

// Listar usuarios con su rol y tienda
router.get('/', async (req, res) => {
  const [usuarios] = await pool.query(
    `SELECT u.id, u.nombre, u.email, u.proveedor, u.rol_id, u.tienda_id, u.mfa_activo,
            (u.bloqueado_hasta IS NOT NULL AND u.bloqueado_hasta > NOW()) AS bloqueado,
            r.nombre AS rol, t.nombre AS tienda
     FROM usuarios u
     JOIN roles r ON r.id = u.rol_id
     JOIN tiendas t ON t.id = u.tienda_id
     ORDER BY u.id`
  );
  const [roles] = await pool.query('SELECT * FROM roles');
  const [tiendas] = await pool.query('SELECT * FROM tiendas');
  res.render('usuarios', { usuarios, roles, tiendas, ok: req.query.ok || null });
});

// Cambiar rol y tienda
router.post('/:id/rol', async (req, res) => {
  const { rol_id, tienda_id } = req.body;
  await pool.query('UPDATE usuarios SET rol_id = ?, tienda_id = ? WHERE id = ?', [rol_id, tienda_id, req.params.id]);
  await registrar(req, req.user.id, req.user.email, 'ROL_CAMBIADO', `Usuario #${req.params.id} -> rol ${rol_id}, tienda ${tienda_id}`);
  res.redirect('/usuarios?ok=Rol actualizado (aplica en su próximo inicio de sesión)');
});

// Desbloquear cuenta
router.post('/:id/desbloquear', async (req, res) => {
  await pool.query('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?', [req.params.id]);
  await registrar(req, req.user.id, req.user.email, 'CUENTA_DESBLOQUEADA', `Usuario #${req.params.id}`);
  res.redirect('/usuarios?ok=Cuenta desbloqueada');
});

// Reiniciar MFA (el usuario volverá a escanear el QR)
router.post('/:id/reset-mfa', async (req, res) => {
  await pool.query('UPDATE usuarios SET mfa_secret = NULL, mfa_activo = 0, mfa_intentos = 0 WHERE id = ?', [req.params.id]);
  await registrar(req, req.user.id, req.user.email, 'MFA_REINICIADO', `Usuario #${req.params.id}`);
  res.redirect('/usuarios?ok=MFA reiniciado');
});

module.exports = router;