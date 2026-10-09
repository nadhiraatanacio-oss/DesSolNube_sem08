const jwt = require('jsonwebtoken');

// Verifica que exista un JWT completo (contraseña + MFA superados)
function verificarToken(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    return res.redirect('/login?msg=Debe iniciar sesión');
  }
  try {
    const datos = jwt.verify(token, process.env.JWT_SECRET);
    if (!datos.mfa) {
      return res.redirect('/login?msg=Debe completar la verificación MFA');
    }
    req.user = datos;
    res.locals.user = datos;
    next();
  } catch (err) {
    res.clearCookie('token');
    return res.redirect('/login?msg=Sesión expirada, ingrese nuevamente');
  }
}

// RBAC: permite el acceso solo a los roles indicados
function permitir(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.rol)) {
      return res.status(403).render('error', {
        titulo: 'Acceso denegado (403)',
        mensaje: `Tu rol (${req.user.rol}) no tiene permiso para esta acción.`
      });
    }
    next();
  };
}

module.exports = { verificarToken, permitir };