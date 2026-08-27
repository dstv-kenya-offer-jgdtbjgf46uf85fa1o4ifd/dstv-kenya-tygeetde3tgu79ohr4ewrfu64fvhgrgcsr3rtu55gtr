require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// ── Config ──
const PAYHERO_BASE = 'https://backend.payhero.co.ke/api/v2';
const PAYHERO_TOKEN = process.env.PAYHERO_AUTH_TOKEN; // Basic YOUR_TOKEN
const PAYHERO_CHANNEL = process.env.PAYHERO_CHANNEL_ID;

if (!PAYHERO_TOKEN || !PAYHERO_CHANNEL) {
  console.error('Missing PAYHERO_AUTH_TOKEN or PAYHERO_CHANNEL_ID in environment');
  process.exit(1);
}

// ── Phone normalizer ──
function normalizePhone(phone) {
  let num = String(phone).replace(/\s+/g, '').replace(/^\+/, '');
  if (num.startsWith('0')) num = '254' + num.slice(1);
  if (!num.startsWith('254')) num = '254' + num;
  return num;
}

// ── Endpoint called by the frontend ──
app.post('/api/payhero/stk-push', async (req, res) => {
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
      callback_url: process.env.PAYHERO_CALLBACK_URL || '' // optional
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

    // Forward PayHero's response to the browser
    return res.status(200).json(response.data);
  } catch (error) {
    console.error('PayHero STK Push Error:', error.response?.data || error.message);
    return res.status(502).json({
      success: false,
      message: error.response?.data?.message || 'Payment gateway error. Please try again.'
    });
  }
});

// Optional: receive PayHero callbacks
app.post('/webhook/payhero', (req, res) => {
  console.log('PayHero callback:', req.body);
  // TODO: update your database / order status here
  res.status(200).json({ success: true, message: 'Received' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
