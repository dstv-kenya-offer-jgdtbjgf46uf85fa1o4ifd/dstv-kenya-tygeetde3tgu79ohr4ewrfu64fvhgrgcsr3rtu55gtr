// server.js — production ready, no dotenv required
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// ── Config (reads from platform environment) ──
const PAYHERO_BASE = 'https://backend.payhero.co.ke/api/v2';
const PAYHERO_TOKEN = process.env.PAYHERO_AUTH_TOKEN || '';
const PAYHERO_CHANNEL = process.env.PAYHERO_CHANNEL_ID || '';
const PORT = process.env.PORT || 3000;

// ── Health check ──
app.get('/health', (req, res) => {
  const ready = !!(PAYHERO_TOKEN && PAYHERO_CHANNEL);
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'not_configured',
    missing: ready ? [] : [
      ...(!PAYHERO_TOKEN ? ['PAYHERO_AUTH_TOKEN'] : []),
      ...(!PAYHERO_CHANNEL ? ['PAYHERO_CHANNEL_ID'] : [])
    ]
  });
});

// ── Phone normalizer ──
function normalizePhone(phone) {
  let num = String(phone).replace(/\s+/g, '').replace(/^\+/, '');
  if (num.startsWith('0')) num = '254' + num.slice(1);
  if (!num.startsWith('254')) num = '254' + num;
  return num;
}

// ── STK Push proxy ──
app.post('/api/payhero/stk-push', async (req, res) => {
  if (!PAYHERO_TOKEN || !PAYHERO_CHANNEL) {
    return res.status(500).json({
      success: false,
      message: 'Server misconfiguration: PayHero credentials not set.'
    });
  }

  try {
    const { phone_number, amount, customer_name, external_reference } = req.body;

    if (!phone_number || !amount) {
      return res.status(400).json({ success: false, message: 'Phone number and amount are required.' });
    }

    const normalizedPhone = normalizePhone(phone_number);
    if (!/^254[172]\d{8}$/.test(normalizedPhone)) {
      return res.status(400).json({ success: false, message: 'Invalid Kenyan phone number.' });
    }

    const payload = {
      amount: Number(amount),
      phone_number: normalizedPhone,
      channel_id: Number(PAYHERO_CHANNEL),
      provider: 'm-pesa',
      customer_name: customer_name || 'Customer',
      external_reference: external_reference || 'REF-' + Date.now(),
      callback_url: process.env.PAYHERO_CALLBACK_URL || ''
    };

    const response = await axios.post(
      `${PAYHERO_BASE}/payments`,
      payload,
      {
        headers: {
          'Authorization': `Basic ${PAYHERO_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );

    return res.status(200).json(response.data);
  } catch (error) {
    console.error('PayHero STK Push Error:', error.response?.data || error.message);
    return res.status(502).json({
      success: false,
      message: error.response?.data?.message || 'Payment gateway error. Please try again.'
    });
  }
});

// ── Optional: receive PayHero callbacks ──
app.post('/webhook/payhero', (req, res) => {
  console.log('PayHero callback:', req.body);
  res.status(200).json({ success: true, message: 'Received' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (!PAYHERO_TOKEN) console.warn('WARN: PAYHERO_AUTH_TOKEN is not set');
  if (!PAYHERO_CHANNEL) console.warn('WARN: PAYHERO_CHANNEL_ID is not set');
});
