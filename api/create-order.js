const crypto = require('crypto');

const CATALOG = {
  'milk-bar': { title: 'Milk Bar', price: 179 },
  'amor-livre-demanda': { title: 'Amor em Livre Demanda', price: 179 },
  'clube-da-madrugada': { title: 'Clube da Madrugada', price: 179 },
  'florescemos-juntos': { title: 'Florescemos Juntos', price: 179 }
};
const SIZES = new Set(['P','M','G','GG']);

async function quoteShipping(token, cep, items, serviceId) {
  const products = items.map((x) => ({
    id: `${x.id}-${x.size}`,
    width: 20,
    height: 5,
    length: 30,
    weight: 0.3,
    insurance_value: CATALOG[x.id].price,
    quantity: x.qty
  }));

  const response = await fetch('https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Melka (MEGAARABELA@GMAIL.COM)'
    },
    body: JSON.stringify({
      from: { postal_code: '55595199' },
      to: { postal_code: String(cep || '').replace(/\D/g, '') },
      products,
      options: { receipt: false, own_hand: false },
      services: String(serviceId)
    })
  });

  const data = await response.json();
  if (!response.ok) {
    console.error('Melhor Envio quote error', data);
    throw new Error('Não foi possível validar o frete selecionado.');
  }

  const options = Array.isArray(data) ? data : [];
  const quote = options.find((o) => String(o.id) === String(serviceId) && !o.error && o.custom_price != null);
  if (!quote) throw new Error('A opção de frete selecionada não está mais disponível.');

  return {
    id: quote.id,
    name: quote.name,
    company: quote.company?.name || '',
    price: Number(quote.custom_price),
    delivery_time: quote.custom_delivery_time
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Método não permitido.' });

  const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!mpToken) {
    return res.status(503).json({
      code: 'PAYMENT_SETUP_REQUIRED',
      message: 'Falta configurar o Mercado Pago da Melka.'
    });
  }

  const shippingToken = process.env.MELHOR_ENVIO_ACCESS_TOKEN;
  if (!shippingToken) {
    return res.status(503).json({
      code: 'SHIPPING_SETUP_REQUIRED',
      message: 'Falta configurar o Melhor Envio da Melka.'
    });
  }

  try {
    const { customer = {}, items = [], shipping = {} } = req.body || {};
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ message: 'Carrinho vazio.' });
    if (!shipping.id) return res.status(400).json({ message: 'Escolha uma opção de frete.' });

    const cep = String(customer.cep || '').replace(/\D/g, '');
    if (cep.length !== 8) return res.status(400).json({ message: 'CEP inválido.' });

    const normalizedInput = [];
    const normalized = [];
    for (const x of items) {
      const p = CATALOG[x.id];
      const qty = Math.max(1, Math.min(10, Number(x.qty) || 1));
      if (!p || !SIZES.has(x.size)) return res.status(400).json({ message: 'Produto ou tamanho inválido.' });
      normalizedInput.push({ id: x.id, size: x.size, qty });
      normalized.push({
        external_code: `${x.id}-${x.size}`,
        title: `${p.title} - Tam. ${x.size}`,
        description: 'Camiseta de amamentação Melka',
        category_id: 'apparel',
        quantity: qty,
        unit_price: p.price.toFixed(2)
      });
    }

    // Recalcula o frete no servidor para não confiar no preço enviado pelo navegador.
    const verifiedShipping = await quoteShipping(shippingToken, cep, normalizedInput, shipping.id);
    if (!Number.isFinite(verifiedShipping.price) || verifiedShipping.price < 0) {
      return res.status(400).json({ message: 'Frete inválido.' });
    }

    if (verifiedShipping.price > 0) {
      normalized.push({
        external_code: `frete-${verifiedShipping.id}`,
        title: `Frete - ${verifiedShipping.company} ${verifiedShipping.name}`.trim(),
        description: 'Entrega do pedido Melka',
        category_id: 'shipping',
        quantity: 1,
        unit_price: verifiedShipping.price.toFixed(2)
      });
    }

    const total = normalized.reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0).toFixed(2);
    const base = 'https://melka-site.vercel.app';
    const cleanPhone = String(customer.phone || '').replace(/\D/g, '');
    const area = cleanPhone.length >= 10 ? cleanPhone.slice(-11, -9) : '';
    const number = cleanPhone.length >= 8 ? cleanPhone.slice(-9) : '';

    const order = {
      type: 'online',
      total_amount: total,
      external_reference: `melka_${Date.now()}`,
      processing_mode: 'manual',
      capture_mode: 'automatic_async',
      payer: {
        email: String(customer.email || '').trim(),
        first_name: String(customer.firstName || '').trim(),
        last_name: String(customer.lastName || '').trim(),
        phone: { area_code: area, number },
        address: {
          zip_code: String(customer.cep || '').trim(),
          street_name: String(customer.street || '').trim(),
          street_number: String(customer.number || '').trim(),
          neighborhood: String(customer.district || '').trim(),
          city: String(customer.city || '').trim()
        }
      },
      config: {
        statement_descriptor: 'MELKA',
        online: {
          success_url: `${base}/?payment=success`,
          failure_url: `${base}/?payment=failure`,
          pending_url: `${base}/?payment=pending`,
          auto_return: 'approved'
        },
        payment_method: { max_installments: 12 }
      },
      items: normalized
    };

    const response = await fetch('https://api.mercadopago.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mpToken}`,
        'X-Idempotency-Key': crypto.randomUUID()
      },
      body: JSON.stringify(order)
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Mercado Pago error', data);
      return res.status(502).json({ message: 'Mercado Pago não conseguiu criar o pagamento.', details: data });
    }

    return res.status(200).json({
      checkout_url: data.checkout_url,
      order_id: data.id,
      shipping: verifiedShipping
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message || 'Erro interno ao criar o pedido.' });
  }
};
