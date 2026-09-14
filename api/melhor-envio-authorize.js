module.exports = async (req, res) => {
  const clientId = process.env.MELHOR_ENVIO_CLIENT_ID;

  if (!clientId) {
    return res.status(500).send('MELHOR_ENVIO_CLIENT_ID não configurado.');
  }

  const redirectUri =
    'https://melka-site.vercel.app/api/melhor-envio/callback';

  const scopes = [
    'shipping-calculate',
    'shipping-companies',
    'ecommerce-shipping'
  ].join(' ');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state: 'melka',
    scope: scopes
  });

  res.redirect(
    `https://sandbox.melhorenvio.com.br/oauth/authorize?${params.toString()}`
  );
};
