require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const passport = require('./config/passport');
const { verificarToken } = require('./middlewares/auth');
const pool = require('./config/db');

const app = express();

// Configuración
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(passport.initialize());

// Cabeceras básicas de seguridad
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.locals.user = null;
  res.locals.ruta = req.originalUrl;
  next();
});

// Rutas
app.get('/', (req, res) => res.redirect('/dashboard'));
app.use('/', require('./routes/auth.routes'));
app.use('/productos', require('./routes/productos.routes'));
app.use('/usuarios', require('./routes/usuarios.routes'));
app.use('/reportes', require('./routes/reportes.routes'));

app.get('/dashboard', verificarToken, async (req, res) => {
  // ADMIN y AUDITOR ven todas las tiendas; GERENTE y EMPLEADO solo la suya
  const global = ['ADMIN', 'AUDITOR'].includes(req.user.rol);
  const filtro = global ? '' : 'WHERE tienda_id = ?';
  const params = global ? [] : [req.user.tienda_id];
  const [[stats]] = await pool.query(
    `SELECT COUNT(*) AS productos,
            COALESCE(SUM(stock), 0) AS unidades,
            COALESCE(SUM(stock < 5), 0) AS bajos,
            COALESCE(SUM(stock * precio), 0) AS valor
     FROM productos ${filtro}`,
    params
  );
  res.render('dashboard', { stats, global });
});

// 404
app.use((req, res) => {
  res.status(404).render('error', { titulo: 'Página no encontrada (404)', mensaje: 'La ruta solicitada no existe.' });
});

// Manejo de errores (no muestra detalles internos al usuario)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { titulo: 'Error interno (500)', mensaje: 'Ocurrió un error. Revise la consola del servidor.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`TechStore corriendo en http://localhost:${PORT}`);
});