const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const { authenticator } = require('otplib');
const passport = require('../config/passport');
const pool = require('../config/db');
const { registrar } = require('../config/auditoria');

const router = express.Router();

// TOTP: 6 dígitos, cambia cada 30 s, tolera 1 intervalo de desfase del reloj
authenticator.options = { digits: 6, step: 30, window: 1 };

const MAX_INTENTOS_LOGIN = 5;
const MINUTOS_BLOQUEO = 15;
const MAX_INTENTOS_MFA = 3;

// Contraseña: mínimo 8 caracteres, 1 mayúscula, 1 número y 1 carácter especial
const REGEX_PASSWORD = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const opcionesCookie = { httpOnly: true, sameSite: 'lax' };

// Paso intermedio: credenciales correctas -> token temporal solo para hacer MFA
async function emitirPreToken(res, usuario) {
  await pool.query('UPDATE usuarios SET mfa_intentos = 0 WHERE id = ?', [usuario.id]);
  const preToken = jwt.sign(
    { id: usuario.id, etapa: 'mfa' },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );
  res.cookie('pre_token', preToken, { ...opcionesCookie, maxAge: 5 * 60 * 1000 });
  if (usuario.mfa_activo) {
    return res.redirect('/mfa/verificar');
  }
  return res.redirect('/mfa/configurar');
}

// Lee el token temporal de MFA y devuelve el usuario
async function obtenerUsuarioPreToken(req) {
  const preToken = req.cookies.pre_token;
  if (!preToken) return null;
  try {
    const datos = jwt.verify(preToken, process.env.JWT_SECRET);
    if (datos.etapa !== 'mfa') return null;
    const [rows] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [datos.id]);
    return rows[0] || null;
  } catch (err) {
    return null;
  }
}

// ---------- REGISTRO ----------
router.get('/registro', async (req, res) => {
  const [tiendas] = await pool.query('SELECT * FROM tiendas');
  res.render('registro', { tiendas, error: null, datos: {} });
});

router.post('/registro', async (req, res) => {
  const { nombre, email, password, confirmar, tienda_id } = req.body;
  const [tiendas] = await pool.query('SELECT * FROM tiendas');
  const volver = (error) => res.render('registro', { tiendas, error, datos: req.body });

  if (!nombre || !email || !password || !tienda_id) {
    return volver('Todos los campos son obligatorios.');
  }
  if (!REGEX_EMAIL.test(email)) {
    return volver('El email no tiene un formato válido.');
  }
  if (!REGEX_PASSWORD.test(password)) {
    return volver('La contraseña debe tener mínimo 8 caracteres, una mayúscula, un número y un carácter especial.');
  }
  if (password !== confirmar) {
    return volver('Las contraseñas no coinciden.');
  }
  const [existe] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [email]);
  if (existe.length > 0) {
    return volver('Ese email ya está registrado.');
  }

  const hash = await bcrypt.hash(password, 10);
  const [rol] = await pool.query("SELECT id FROM roles WHERE nombre = 'EMPLEADO'");
  const [result] = await pool.query(
    'INSERT INTO usuarios (nombre, email, password, tienda_id, rol_id) VALUES (?, ?, ?, ?, ?)',
    [nombre.trim(), email.trim().toLowerCase(), hash, tienda_id, rol[0].id]
  );
  await registrar(req, result.insertId, email, 'REGISTRO', 'Nuevo usuario registrado');
  res.redirect('/login?ok=Registro exitoso, ahora inicie sesión');
});

// ---------- LOGIN ----------
router.get('/login', (req, res) => {
  res.render('login', {
    error: req.query.msg || null,
    ok: req.query.ok || null,
    google: !!passport._strategy('google'),
    github: !!passport._strategy('github')
  });
});

router.post('/login', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const { password } = req.body;
  const volver = (msg) => res.redirect('/login?msg=' + encodeURIComponent(msg));

  const [rows] = await pool.query(
    'SELECT *, (bloqueado_hasta IS NOT NULL AND bloqueado_hasta > NOW()) AS bloqueado FROM usuarios WHERE email = ?',
    [email]
  );
  const usuario = rows[0];

  if (!usuario) {
    await registrar(req, null, email, 'LOGIN_FALLIDO', 'Email no registrado');
    return volver('Credenciales incorrectas.');
  }
  if (usuario.bloqueado) {
    await registrar(req, usuario.id, email, 'LOGIN_BLOQUEADO', 'Intento con cuenta bloqueada');
    return volver(`Cuenta bloqueada por ${MAX_INTENTOS_LOGIN} intentos fallidos. Intente en ${MINUTOS_BLOQUEO} minutos.`);
  }
  if (!usuario.password) {
    return volver(`Esta cuenta fue creada con ${usuario.proveedor}. Use ese botón para ingresar.`);
  }

  const correcta = await bcrypt.compare(password || '', usuario.password);
  if (!correcta) {
    const intentos = usuario.intentos_fallidos + 1;
    if (intentos >= MAX_INTENTOS_LOGIN) {
      await pool.query(
        'UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?',
        [MINUTOS_BLOQUEO, usuario.id]
      );
      await registrar(req, usuario.id, email, 'CUENTA_BLOQUEADA', `${MAX_INTENTOS_LOGIN} intentos fallidos`);
      return volver(`Cuenta bloqueada por ${MAX_INTENTOS_LOGIN} intentos fallidos. Intente en ${MINUTOS_BLOQUEO} minutos.`);
    }
    await pool.query('UPDATE usuarios SET intentos_fallidos = ? WHERE id = ?', [intentos, usuario.id]);
    await registrar(req, usuario.id, email, 'LOGIN_FALLIDO', `Intento ${intentos} de ${MAX_INTENTOS_LOGIN}`);
    return volver(`Credenciales incorrectas. Le quedan ${MAX_INTENTOS_LOGIN - intentos} intento(s).`);
  }

  await pool.query('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?', [usuario.id]);
  await registrar(req, usuario.id, email, 'LOGIN_PASSWORD_OK', 'Credenciales correctas, pendiente MFA');
  return emitirPreToken(res, usuario);
});

// ---------- LOGIN CON REDES SOCIALES ----------
function redSocialActiva(nombre) {
  return (req, res, next) => {
    if (!passport._strategy(nombre)) {
      return res.redirect('/login?msg=' + encodeURIComponent(`Login con ${nombre} no configurado en .env`));
    }
    next();
  };
}

router.get('/auth/google', redSocialActiva('google'),
  passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

router.get('/auth/google/callback', redSocialActiva('google'),
  passport.authenticate('google', { session: false, failureRedirect: '/login?msg=Error con Google' }),
  async (req, res) => {
    await registrar(req, req.user.id, req.user.email, 'LOGIN_GOOGLE_OK', 'Pendiente MFA');
    return emitirPreToken(res, req.user);
  });

router.get('/auth/github', redSocialActiva('github'),
  passport.authenticate('github', { session: false }));

router.get('/auth/github/callback', redSocialActiva('github'),
  passport.authenticate('github', { session: false, failureRedirect: '/login?msg=Error con GitHub' }),
  async (req, res) => {
    await registrar(req, req.user.id, req.user.email, 'LOGIN_GITHUB_OK', 'Pendiente MFA');
    return emitirPreToken(res, req.user);
  });

// ---------- MFA (TOTP con Google Authenticator) ----------
router.get('/mfa/configurar', async (req, res) => {
  const usuario = await obtenerUsuarioPreToken(req);
  if (!usuario) return res.redirect('/login?msg=Sesión MFA expirada, ingrese nuevamente');
  if (usuario.mfa_activo) return res.redirect('/mfa/verificar');

  let secret = usuario.mfa_secret;
  if (!secret) {
    secret = authenticator.generateSecret();
    await pool.query('UPDATE usuarios SET mfa_secret = ? WHERE id = ?', [secret, usuario.id]);
  }
  const otpauth = authenticator.keyuri(usuario.email, 'TechStore', secret);
  const qr = await QRCode.toDataURL(otpauth);
  res.render('mfa-configurar', { qr, secret, error: req.query.msg || null });
});

router.get('/mfa/verificar', async (req, res) => {
  const usuario = await obtenerUsuarioPreToken(req);
  if (!usuario) return res.redirect('/login?msg=Sesión MFA expirada, ingrese nuevamente');
  if (!usuario.mfa_activo) return res.redirect('/mfa/configurar');
  res.render('mfa-verificar', { email: usuario.email, error: req.query.msg || null });
});

router.post('/mfa/verificar', async (req, res) => {
  const usuario = await obtenerUsuarioPreToken(req);
  if (!usuario) return res.redirect('/login?msg=Sesión MFA expirada, ingrese nuevamente');

  const paginaMfa = usuario.mfa_activo ? '/mfa/verificar' : '/mfa/configurar';
  const codigo = (req.body.codigo || '').trim();
  const valido = /^\d{6}$/.test(codigo) && authenticator.check(codigo, usuario.mfa_secret);

  if (!valido) {
    const intentos = usuario.mfa_intentos + 1;
    if (intentos >= MAX_INTENTOS_MFA) {
      await pool.query('UPDATE usuarios SET mfa_intentos = 0 WHERE id = ?', [usuario.id]);
      await registrar(req, usuario.id, usuario.email, 'MFA_BLOQUEADO', `${MAX_INTENTOS_MFA} códigos incorrectos`);
      res.clearCookie('pre_token');
      return res.redirect('/login?msg=' + encodeURIComponent(`Superó los ${MAX_INTENTOS_MFA} intentos de código MFA. Inicie sesión nuevamente.`));
    }
    await pool.query('UPDATE usuarios SET mfa_intentos = ? WHERE id = ?', [intentos, usuario.id]);
    await registrar(req, usuario.id, usuario.email, 'MFA_FALLIDO', `Intento ${intentos} de ${MAX_INTENTOS_MFA}`);
    return res.redirect(paginaMfa + '?msg=' + encodeURIComponent(`Código incorrecto. Le quedan ${MAX_INTENTOS_MFA - intentos} intento(s).`));
  }

  // Código correcto: se activa MFA (si era la primera vez) y se entrega el JWT completo
  await pool.query('UPDATE usuarios SET mfa_activo = 1, mfa_intentos = 0 WHERE id = ?', [usuario.id]);
  const [rows] = await pool.query(
    `SELECT u.id, u.nombre, u.email, u.tienda_id, r.nombre AS rol, t.nombre AS tienda
     FROM usuarios u
     JOIN roles r ON r.id = u.rol_id
     JOIN tiendas t ON t.id = u.tienda_id
     WHERE u.id = ?`,
    [usuario.id]
  );
  const u = rows[0];
  const token = jwt.sign(
    { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, tienda_id: u.tienda_id, tienda: u.tienda, mfa: true },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES }
  );
  res.clearCookie('pre_token');
  res.cookie('token', token, { ...opcionesCookie, maxAge: 60 * 60 * 1000 });
  await registrar(req, u.id, u.email, 'LOGIN_EXITOSO', 'MFA correcto, JWT emitido');
  res.redirect('/dashboard');
});

// ---------- LOGOUT ----------
router.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.clearCookie('pre_token');
  res.redirect('/login?ok=Sesión cerrada correctamente');
});

module.exports = router;