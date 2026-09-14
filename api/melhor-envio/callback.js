module.exports = async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('Código de autorização não recebido.');
  }

  const clientId = process.env.MELHOR_ENVIO_CLIENT_ID;
  const clientSecret = process.env.MELHOR_ENVIO_CLIENT_SECRET;

  const redirectUri =
    'https://melka-site.vercel.app/api/melhor-envio/callback';

  try {
    const response = await fetch(
      'https://sandbox.melhorenvio.com.br/oauth/token',
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Melka (melka@gmail.com.)'
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json({
      message: 'Melhor Envio autorizado com sucesso.',
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Erro ao conectar com o Melhor Envio.',
      error: error.message
    });
  }
};
