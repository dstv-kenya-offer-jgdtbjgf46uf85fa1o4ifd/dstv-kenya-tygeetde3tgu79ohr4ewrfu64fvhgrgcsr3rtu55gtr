require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Normalize Kenyan mobile numbers to 2547XXXXXXXX or 2541XXXXXXXX
 */
function normalizePhone(rawPhone) {
  if (!rawPhone) return { valid: false, error: 'Phone number is required' };

  let digits = rawPhone.toString().replace(/\D/g, '');

  // 07XX XXX XXX → 2547XX XXX XXX
  if (digits.startsWith('0') && digits.length === 10) {
    digits = '254' + digits.slice(1);
  }

  // 7XX XXX XXX → 2547XX XXX XXX
  if ((digits.startsWith('7') || digits.startsWith('1')) && digits.length === 9) {
    digits = '254' + digits;
  }

  // Must be 254 followed by 7 or 1, then 8 more digits
  const kenyanRegex = /^254[17]\d{8}$/;
  if (!kenyanRegex.test(digits)) {
    return {
      valid: false,
      error: 'Invalid Kenyan mobile number. Use 07XX XXX XXX or 2547XX XXX XXX.'
    };
  }

  return { valid: true, phone: digits };
}

/**
 * POST /api/stk-push
 * Frontend calls this. We validate the number, then call PayHero.
 */
app.post('/api/stk-push', async (req, res) => {
  try {
    const { phone, amount, external_reference } = req.body;

    // 1. Validate & normalize phone
    const normalized = normalizePhone(phone);
    if (!normalized.valid) {
      return res.status(400).json({ success: false, message: normalized.error });
    }

    // 2. Validate amount
    const payAmount = parseFloat(amount);
    if (!payAmount || payAmount < 1) {
      return res.status(400).json({ success: false, message: 'Amount must be at least KES 1' });
    }

    // 3. Load PayHero credentials from environment
    const username = process.env.PAYHERO_USERNAME;
    const password = process.env.PAYHERO_PASSWORD;
    const channelId = process.env.PAYHERO_CHANNEL_ID;

    if (!username || !password || !channelId) {
      console.error('Missing PayHero credentials');
      return res.status(500).json({
        success: false,
        message: 'Server misconfiguration: missing PayHero credentials.'
      });
    }

    // 4. Build Basic Auth header
    const authHeader = Buffer.from(`${username}:${password}`).toString('base64');

    // 5. Build PayHero payload
    const payload = {
      amount: Math.round(payAmount),
      phone_number: normalized.phone,
      channel_id: parseInt(channelId, 10),
      provider: 'm-pesa',
      external_reference: external_reference || `DPP-${Date.now()}`
    };

    // Optional callback URL
    if (process.env.CALLBACK_URL) {
      payload.callback_url = process.env.CALLBACK_URL;
    }

    console.log('→ PayHero STK Push:', {
      phone: payload.phone_number,
      amount: payload.amount,
      channel: payload.channel_id
    });

    // 6. Call PayHero API
    const response = await axios.post(
      'https://backend.payhero.co.ke/api/v2/payments',
      payload,
      {
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    // 7. Return result to frontend
    return res.json({
      success: true,
      message: 'STK Push sent! Check your phone and enter your M-Pesa PIN.',
      data: response.data
    });

  } catch (error) {
    console.error('PayHero API Error:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: error.response?.data?.message || 'Payment request failed. Try again.',
      error: error.response?.data || error.message
    });
  }
});

/**
 * GET /api/health
 * Render health-check + quick browser test
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'dstv-kenya-payhero',
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /webhook/payhero
 * Receive PayHero payment callbacks (optional)
 */
app.post('/webhook/payhero', express.raw({ type: 'application/json' }), (req, res) => {
  console.log('PayHero callback received:', req.body);
  res.json({ received: true });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
