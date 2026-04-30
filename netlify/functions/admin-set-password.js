// Netlify Function: admin-set-password
// POST /.netlify/functions/admin-set-password
// Body: { userId, newPassword, callerToken }
//
// Permite que un admin de la app cambie la contraseña de cualquier usuario
// directamente desde la sección "Gestión de Usuarios", sin tener que entrar
// al dashboard de Supabase.
//
// Requiere las env vars de Netlify:
//   SUPABASE_URL                — ya configurada
//   SUPABASE_ANON_KEY           — ya configurada
//   SUPABASE_SERVICE_KEY        — service_role key (Supabase → Settings → API)

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const { userId, newPassword, callerToken } = body;
  if (!userId || !newPassword || !callerToken) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Faltan parámetros (userId, newPassword, callerToken)' }) };
  }
  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    return { statusCode: 400, body: JSON.stringify({ error: 'La contraseña debe tener al menos 6 caracteres' }) };
  }

  const SB_URL = process.env.SUPABASE_URL;
  const SB_ANON = process.env.SUPABASE_ANON_KEY;
  const SB_SERVICE = process.env.SUPABASE_SERVICE_KEY;

  if (!SB_URL || !SB_ANON || !SB_SERVICE) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Faltan env vars en Netlify (SUPABASE_URL/ANON_KEY/SERVICE_KEY)' })
    };
  }

  try {
    // 1) Verificar que el token del caller es válido y pertenece a un admin
    const sbAnon = createClient(SB_URL, SB_ANON);
    const { data: userData, error: uErr } = await sbAnon.auth.getUser(callerToken);
    if (uErr || !userData?.user) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Token de sesión inválido' }) };
    }

    const sbAdmin = createClient(SB_URL, SB_SERVICE);
    const { data: profile, error: pErr } = await sbAdmin
      .from('user_profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();

    if (pErr || !profile || profile.role !== 'admin') {
      return { statusCode: 403, body: JSON.stringify({ error: 'Solo admins pueden cambiar contraseñas' }) };
    }

    // 2) Cambiar la contraseña con el service_role key
    const { error: updErr } = await sbAdmin.auth.admin.updateUserById(userId, {
      password: newPassword
    });
    if (updErr) {
      return { statusCode: 500, body: JSON.stringify({ error: updErr.message }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message || 'Error desconocido' }) };
  }
};
