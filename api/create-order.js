const crypto = require('crypto');

const CATALOG = {
  'milk-bar': { title: 'Milk Bar', price: 179 },
  'amor-livre-demanda': { title: 'Amor em Livre Demanda', price: 179 },
  'clube-da-madrugada': { title: 'Clube da Madrugada', price: 179 },
  'florescemos-juntos': { title: 'Florescemos Juntos', price: 179 }
};
const SIZES = new Set(['P','M','G','GG']);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({message:'Método não permitido.'});

  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!token) {
    return res.status(503).json({
      code:'PAYMENT_SETUP_REQUIRED',
      message:'A loja já está pronta para checkout, mas falta conectar a conta Mercado Pago da Melka para cobrar Pix/cartão.'
    });
  }

  const flatShipping = Number(process.env.MELKA_SHIPPING_FLAT || '');
  if (!Number.isFinite(flatShipping) || flatShipping < 0) {
    return res.status(503).json({
      code:'SHIPPING_SETUP_REQUIRED',
      message:'Falta configurar o frete da Melka antes de liberar pagamentos reais.'
    });
  }

  try {
    const { customer = {}, items = [] } = req.body || {};
    if (!Array.isArray(items) || !items.length) return res.status(400).json({message:'Carrinho vazio.'});

    const normalized = [];
    for (const x of items) {
      const p = CATALOG[x.id];
      const qty = Math.max(1, Math.min(10, Number(x.qty)||1));
      if (!p || !SIZES.has(x.size)) return res.status(400).json({message:'Produto ou tamanho inválido.'});
      normalized.push({
        external_code: `${x.id}-${x.size}`,
        title: `${p.title} - Tam. ${x.size}`,
        description: 'Camiseta de amamentação Melka',
        category_id: 'apparel',
        quantity: qty,
        unit_price: p.price.toFixed(2)
      });
    }

    if (flatShipping > 0) {
      normalized.push({
        external_code: 'frete',
        title: 'Frete',
        description: 'Entrega do pedido Melka',
        category_id: 'shipping',
        quantity: 1,
        unit_price: flatShipping.toFixed(2)
      });
    }

    const total = normalized.reduce((s,i)=>s+Number(i.unit_price)*i.quantity,0).toFixed(2);
    const base = 'https://melka-site.vercel.app';
    const cleanPhone = String(customer.phone||'').replace(/\D/g,'');
    const area = cleanPhone.length >= 10 ? cleanPhone.slice(-11,-9) : '';
    const number = cleanPhone.length >= 8 ? cleanPhone.slice(-9) : '';

    const order = {
      type:'online',
      total_amount: total,
      external_reference: `melka_${Date.now()}`,
      processing_mode:'manual',
      capture_mode:'automatic_async',
      payer:{
        email:String(customer.email||'').trim(),
        first_name:String(customer.firstName||'').trim(),
        last_name:String(customer.lastName||'').trim(),
        phone:{ area_code: area, number },
        address:{
          zip_code:String(customer.cep||'').trim(),
          street_name:String(customer.street||'').trim(),
          street_number:String(customer.number||'').trim(),
          neighborhood:String(customer.district||'').trim(),
          city:String(customer.city||'').trim()
        }
      },
      config:{
        statement_descriptor:'MELKA',
        online:{
          success_url:`${base}/?payment=success`,
          failure_url:`${base}/?payment=failure`,
          pending_url:`${base}/?payment=pending`,
          auto_return:'approved'
        },
        payment_method:{ max_installments: 12 }
      },
      items: normalized
    };

    const response = await fetch('https://api.mercadopago.com/v1/orders', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${token}`,
        'X-Idempotency-Key':crypto.randomUUID()
      },
      body:JSON.stringify(order)
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('Mercado Pago error', data);
      return res.status(502).json({message:'Mercado Pago não conseguiu criar o pagamento.', details:data});
    }
    return res.status(200).json({checkout_url:data.checkout_url, order_id:data.id});
  } catch (err) {
    console.error(err);
    return res.status(500).json({message:'Erro interno ao criar o pedido.'});
  }
};
