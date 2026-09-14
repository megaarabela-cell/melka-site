# Melka site v3

Arquivos:
- `index.html`: loja completa, produtos clicáveis, guia de tamanhos, carrinho e checkout.
- `api/create-order.js`: endpoint Vercel para Mercado Pago Checkout Pro via Orders API.

Para ativar pagamentos reais no Vercel, configure as Environment Variables:
- `MERCADO_PAGO_ACCESS_TOKEN`
- `MELKA_SHIPPING_FLAT` (valor do frete fixo, ex.: `19.90`)

Observação: para frete calculado de verdade por CEP/transportadora, substituir o frete fixo por integração com Melhor Envio/Correios.
