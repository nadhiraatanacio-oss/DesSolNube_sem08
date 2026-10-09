const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const pool = require('./db');

// Busca o crea el usuario que inició sesión con una red social
async function buscarOCrearUsuario(proveedor, profile) {
  const proveedorId = String(profile.id);
  const email = (profile.emails && profile.emails[0] && profile.emails[0].value)
    || `${profile.username || proveedorId}@${proveedor}.local`;
  const nombre = profile.displayName || profile.username || email;

  // 1. Ya existe con ese proveedor
  let [rows] = await pool.query(
    'SELECT * FROM usuarios WHERE proveedor = ? AND proveedor_id = ?',
    [proveedor, proveedorId]
  );
  if (rows.length > 0) return rows[0];

  // 2. Ya existe con ese email (se vincula la cuenta)
  [rows] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [email]);
  if (rows.length > 0) {
    await pool.query(
      'UPDATE usuarios SET proveedor = ?, proveedor_id = ? WHERE id = ?',
      [proveedor, proveedorId, rows[0].id]
    );
    return rows[0];
  }

  // 3. Usuario nuevo: rol EMPLEADO y tienda 1 por defecto (el admin puede cambiarlo)
  const [rol] = await pool.query("SELECT id FROM roles WHERE nombre = 'EMPLEADO'");
  const [result] = await pool.query(
    'INSERT INTO usuarios (nombre, email, tienda_id, rol_id, proveedor, proveedor_id) VALUES (?, ?, 1, ?, ?, ?)',
    [nombre, email, rol[0].id, proveedor, proveedorId]
  );
  [rows] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [result.insertId]);
  return rows[0];
}

// Solo se activa cada red social si sus claves están en el .env
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.BASE_URL}/auth/google/callback`
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      done(null, await buscarOCrearUsuario('google', profile));
    } catch (err) {
      done(err);
    }
  }));
  console.log('Login con Google: ACTIVADO');
} else {
  console.log('Login con Google: desactivado (faltan claves en .env)');
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: `${process.env.BASE_URL}/auth/github/callback`,
    scope: ['user:email']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      done(null, await buscarOCrearUsuario('github', profile));
    } catch (err) {
      done(err);
    }
  }));
  console.log('Login con GitHub: ACTIVADO');
} else {
  console.log('Login con GitHub: desactivado (faltan claves en .env)');
}

module.exports = passport;