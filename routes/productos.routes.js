const express = require('express');
const pool = require('../config/db');
const { verificarToken, permitir } = require('../middlewares/auth');
const { registrar } = require('../config/auditoria');

const router = express.Router();
router.use(verificarToken);

// ABAC: ¿el usuario puede modificar un producto de esta tienda?
// ADMIN: cualquier tienda. GERENTE y EMPLEADO: solo su propia tienda.
function esDeSuTienda(user, producto) {
  if (user.rol === 'ADMIN') return true;
  return Number(producto.tienda_id) === Number(user.tienda_id);
}

function denegar(res, mensaje) {
  return res.status(403).render('error', { titulo: 'Acceso denegado (403)', mensaje });
}

async function buscarProducto(id) {
  const [rows] = await pool.query('SELECT * FROM productos WHERE id = ?', [id]);
  return rows[0];
}

// Listar productos (todos los roles pueden consultar)
router.get('/', async (req, res) => {
  const tiendaFiltro = req.query.tienda || '';
  let sql = `SELECT p.*, t.nombre AS tienda FROM productos p
             JOIN tiendas t ON t.id = p.tienda_id`;
  const params = [];
  if (tiendaFiltro) {
    sql += ' WHERE p.tienda_id = ?';
    params.push(tiendaFiltro);
  }
  sql += ' ORDER BY p.tienda_id, p.nombre';
  const [productos] = await pool.query(sql, params);
  const [tiendas] = await pool.query('SELECT * FROM tiendas');
  res.render('productos/lista', {
    productos, tiendas, tiendaFiltro,
    puedeEditar: (p) => ['ADMIN', 'GERENTE'].includes(req.user.rol) && esDeSuTienda(req.user, p),
    puedeStock: (p) => ['ADMIN', 'GERENTE', 'EMPLEADO'].includes(req.user.rol) && esDeSuTienda(req.user, p),
    ok: req.query.ok || null
  });
});

// Formulario nuevo producto (ADMIN y GERENTE)
router.get('/nuevo', permitir('ADMIN', 'GERENTE'), async (req, res) => {
  const [tiendas] = await pool.query('SELECT * FROM tiendas');
  res.render('productos/form', { producto: {}, tiendas, accion: '/productos/nuevo', error: null });
});

router.post('/nuevo', permitir('ADMIN', 'GERENTE'), async (req, res) => {
  const { nombre, descripcion, precio, stock } = req.body;
  // El gerente solo puede crear en su tienda (se ignora lo que envíe el formulario)
  const tienda_id = req.user.rol === 'ADMIN' ? req.body.tienda_id : req.user.tienda_id;

  if (!nombre || precio === '' || stock === '' || Number(precio) < 0 || Number(stock) < 0) {
    const [tiendas] = await pool.query('SELECT * FROM tiendas');
    return res.render('productos/form', {
      producto: req.body, tiendas, accion: '/productos/nuevo',
      error: 'Complete nombre, precio y stock con valores válidos.'
    });
  }
  const [r] = await pool.query(
    'INSERT INTO productos (nombre, descripcion, precio, stock, tienda_id) VALUES (?, ?, ?, ?, ?)',
    [nombre, descripcion, precio, stock, tienda_id]
  );
  await registrar(req, req.user.id, req.user.email, 'PRODUCTO_CREADO', `Producto #${r.insertId} ${nombre}`);
  res.redirect('/productos?ok=Producto creado');
});

// Editar producto completo, incluido el precio (ADMIN y GERENTE de su tienda)
router.get('/:id/editar', permitir('ADMIN', 'GERENTE'), async (req, res) => {
  const producto = await buscarProducto(req.params.id);
  if (!producto) return res.redirect('/productos');
  if (!esDeSuTienda(req.user, producto)) {
    return denegar(res, 'Solo puede editar productos de su propia tienda.');
  }
  const [tiendas] = await pool.query('SELECT * FROM tiendas');
  res.render('productos/form', { producto, tiendas, accion: `/productos/${producto.id}/editar`, error: null });
});

router.post('/:id/editar', permitir('ADMIN', 'GERENTE'), async (req, res) => {
  const producto = await buscarProducto(req.params.id);
  if (!producto) return res.redirect('/productos');
  if (!esDeSuTienda(req.user, producto)) {
    return denegar(res, 'Solo puede editar productos de su propia tienda.');
  }
  const { nombre, descripcion, precio, stock } = req.body;
  const tienda_id = req.user.rol === 'ADMIN' ? req.body.tienda_id : producto.tienda_id;
  await pool.query(
    'UPDATE productos SET nombre = ?, descripcion = ?, precio = ?, stock = ?, tienda_id = ? WHERE id = ?',
    [nombre, descripcion, precio, stock, tienda_id, producto.id]
  );
  await registrar(req, req.user.id, req.user.email, 'PRODUCTO_EDITADO',
    `Producto #${producto.id} precio ${producto.precio} -> ${precio}`);
  res.redirect('/productos?ok=Producto actualizado');
});

// Actualizar SOLO el stock (ADMIN, GERENTE y EMPLEADO de su tienda). No toca el precio.
router.post('/:id/stock', permitir('ADMIN', 'GERENTE', 'EMPLEADO'), async (req, res) => {
  const producto = await buscarProducto(req.params.id);
  if (!producto) return res.redirect('/productos');
  if (!esDeSuTienda(req.user, producto)) {
    return denegar(res, 'Solo puede actualizar el stock de productos de su propia tienda.');
  }
  const stock = parseInt(req.body.stock, 10);
  if (isNaN(stock) || stock < 0) {
    return res.redirect('/productos?ok=' + encodeURIComponent('Stock inválido'));
  }
  await pool.query('UPDATE productos SET stock = ? WHERE id = ?', [stock, producto.id]);
  await registrar(req, req.user.id, req.user.email, 'STOCK_ACTUALIZADO',
    `Producto #${producto.id}: ${producto.stock} -> ${stock}`);
  res.redirect('/productos?ok=Stock actualizado');
});

// Eliminar producto (ADMIN, o GERENTE solo de su tienda)
router.post('/:id/eliminar', permitir('ADMIN', 'GERENTE'), async (req, res) => {
  const producto = await buscarProducto(req.params.id);
  if (!producto) return res.redirect('/productos');
  if (!esDeSuTienda(req.user, producto)) {
    await registrar(req, req.user.id, req.user.email, 'ACCESO_DENEGADO',
      `Intentó eliminar producto #${producto.id} de otra tienda`);
    return denegar(res, 'No puede eliminar productos de otras tiendas.');
  }
  await pool.query('DELETE FROM productos WHERE id = ?', [producto.id]);
  await registrar(req, req.user.id, req.user.email, 'PRODUCTO_ELIMINADO', `Producto #${producto.id} ${producto.nombre}`);
  res.redirect('/productos?ok=Producto eliminado');
});

// API JSON del stock (para la actualización en tiempo real de la tabla)
router.get('/api/stock', async (req, res) => {
  const [rows] = await pool.query('SELECT id, stock FROM productos');
  res.json(rows);
});

module.exports = router;