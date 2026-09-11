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
 * Frontend calls this. We validate input, then call BluePay API.
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

    // 3. Load BluePay credentials from environment
    const apiUsername = process.env.BLUEPAY_USERNAME;
    const apiPassword = process.env.BLUEPAY_PASSWORD;
    const channelId = process.env.BLUEPAY_CHANNEL_ID;

    if (!apiUsername || !apiPassword || !channelId) {
      console.error('Missing BluePay credentials');
      return res.status(500).json({
        success: false,
        message: 'Server misconfiguration: missing BluePay credentials.'
      });
    }

    // 4. Build BluePay payload based on cURL structure
    const payload = {
      api_username: apiUsername,
      api_password: apiPassword,
      channel_id: channelId,
      phone: normalized.phone,
      amount: Math.round(payAmount)
    };

    if (external_reference) {
      payload.reference = external_reference;
    }

    if (process.env.CALLBACK_URL) {
      payload.callback_url = process.env.CALLBACK_URL;
    }

    console.log('→ BluePay STK Push Request:', {
      phone: payload.phone,
      amount: payload.amount,
      channel_id: payload.channel_id
    });

    // 5. Call BluePay API
    const response = await axios.post(
      'https://bluepay.co.ke/api/stk_push.php',
      payload,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    // 6. Return result to frontend
    return res.json({
      success: true,
      message: 'STK Push sent! Check your phone and enter your M-Pesa PIN.',
      data: response.data
    });

  } catch (error) {
    console.error('BluePay API Error:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: error.response?.data?.message || 'Payment request failed. Try again.',
      error: error.response?.data || error.message
    });
  }
});

/**
 * GET /api/health
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'dstv-kenya-bluepay',
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /webhook/bluepay
 * Receive transaction status callbacks
 */
app.post('/webhook/bluepay', (req, res) => {
  console.log('BluePay callback received:', req.body);
  
  const { status, reference, mpesa_receipt, phone } = req.body;

  if (status === 'SUCCESS' || status === 'COMPLETED') {
    console.log(`✅ Payment Successful | Phone: ${phone} | Ref: ${reference} | Receipt: ${mpesa_receipt}`);
  } else {
    console.log(`❌ Payment Failed or Cancelled | Ref: ${reference}`);
  }

  // Reply immediately with 200 OK
  res.status(200).json({ received: true });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
