const express = require('express');
const pool = require('../config/db');
const { verificarToken, permitir } = require('../middlewares/auth');

const router = express.Router();
router.use(verificarToken);

// Reporte de inventario: ADMIN y AUDITOR ven todas las tiendas, GERENTE solo la suya
router.get('/', permitir('ADMIN', 'AUDITOR', 'GERENTE'), async (req, res) => {
  const soloSuTienda = req.user.rol === 'GERENTE';
  const filtro = soloSuTienda ? 'WHERE t.id = ?' : '';
  const params = soloSuTienda ? [req.user.tienda_id] : [];

  const [resumen] = await pool.query(
    `SELECT t.nombre AS tienda, COUNT(p.id) AS productos,
            COALESCE(SUM(p.stock), 0) AS unidades,
            COALESCE(SUM(p.stock * p.precio), 0) AS valor
     FROM tiendas t
     LEFT JOIN productos p ON p.tienda_id = t.id
     ${filtro}
     GROUP BY t.id, t.nombre
     ORDER BY t.id`,
    params
  );
  const [stockBajo] = await pool.query(
    `SELECT p.nombre, p.stock, t.nombre AS tienda
     FROM productos p JOIN tiendas t ON t.id = p.tienda_id
     ${filtro ? filtro + ' AND' : 'WHERE'} p.stock < 5
     ORDER BY p.stock`,
    params
  );
  res.render('reportes', { resumen, stockBajo, soloSuTienda });
});

// Bitácora de auditoría: ADMIN y AUDITOR
router.get('/auditoria', permitir('ADMIN', 'AUDITOR'), async (req, res) => {
  const [eventos] = await pool.query('SELECT * FROM auditoria ORDER BY id DESC LIMIT 100');
  res.render('auditoria', { eventos });
});

module.exports = router;