module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método não permitido.' });
  }

  const token = process.env.MELHOR_ENVIO_ACCESS_TOKEN;

  if (!token) {
    return res.status(500).json({
      message: 'Token do Melhor Envio não configurado.'
    });
  }

  const { postal_code, quantity = 1 } = req.body || {};

  if (!postal_code) {
    return res.status(400).json({
      message: 'CEP de destino obrigatório.'
    });
  }

  const qty = Math.max(1, Number(quantity) || 1);

  try {
    const response = await fetch(
      'https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Melka (MEGAARABELA@GMAIL.COM)'
        },
        body: JSON.stringify({
          from: {
            postal_code: '55595199'
          },
          to: {
            postal_code: String(postal_code).replace(/\D/g, '')
          },
          products: [
            {
              id: 'melka-camiseta',
              width: 20,
              height: 5,
              length: 30,
              weight: 0.3,
              insurance_value: 179,
              quantity: qty
            }
          ],
          options: {
            receipt: false,
            own_hand: false
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // En Sandbox solo aparecem Correios e Jadlog.
    // Mantemos apenas opções válidas e devolvemos as mais úteis ao checkout.
    const options = Array.isArray(data)
      ? data
          .filter(item => !item.error && item.custom_price)
          .map(item => ({
            id: item.id,
            name: item.name,
            company: item.company?.name || '',
            price: Number(item.custom_price),
            delivery_time: item.custom_delivery_time
          }))
      : [];

    return res.status(200).json({ options });
  } catch (error) {
    return res.status(500).json({
      message: 'Erro ao calcular o frete.',
      error: error.message
    });
  }
};
