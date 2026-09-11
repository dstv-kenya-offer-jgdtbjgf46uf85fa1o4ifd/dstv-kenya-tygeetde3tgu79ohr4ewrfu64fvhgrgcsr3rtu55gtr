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

  if (digits.startsWith('0') && digits.length === 10) {
    digits = '254' + digits.slice(1);
  } else if ((digits.startsWith('7') || digits.startsWith('1')) && digits.length === 9) {
    digits = '254' + digits;
  }

  const kenyanRegex = /^254[17]\d{8}$/;
  if (!kenyanRegex.test(digits)) {
    return {
      valid: false,
      error: 'Invalid Kenyan mobile number. Use 07XX XXX XXX, 01XX XXX XXX, or 2547XX XXX XXX.'
    };
  }

  return { valid: true, phone: digits };
}

/**
 * POST /api/stk-push
 */
app.post('/api/stk-push', async (req, res) => {
  try {
    const { phone, amount, external_reference } = req.body;

    // 1. Validate phone
    const normalized = normalizePhone(phone);
    if (!normalized.valid) {
      return res.status(400).json({ success: false, message: normalized.error });
    }

    // 2. Validate amount
    const payAmount = parseFloat(amount);
    if (!payAmount || payAmount < 1) {
      return res.status(400).json({ success: false, message: 'Amount must be at least KES 1' });
    }

    // 3. Check credentials
    const apiUsername = process.env.BLUEPAY_USERNAME;
    const apiPassword = process.env.BLUEPAY_PASSWORD;
    const channelId = process.env.BLUEPAY_CHANNEL_ID;

    if (!apiUsername || !apiPassword || !channelId) {
      console.error('❌ Missing BluePay credentials in .env');
      return res.status(500).json({
        success: false,
        message: 'Server misconfiguration: missing BluePay credentials.'
      });
    }

    // 4. Construct payload strictly according to BluePay Docs
    const payload = {
      api_username: apiUsername,
      api_password: apiPassword,
      channel_id: channelId,
      phone: normalized.phone,
      amount: Math.round(payAmount)
    };

    if (external_reference) {
      payload.account_reference = external_reference;
    }

    if (process.env.CALLBACK_URL) {
      payload.callback_url = process.env.CALLBACK_URL;
    }

    console.log('→ Sending STK Push to BluePay:', {
      phone: payload.phone,
      amount: payload.amount,
      channel_id: payload.channel_id
    });

    // 5. Initiate request to BluePay
    const response = await axios.post(
      'https://bluepay.co.ke/api/stk_push.php',
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    // 6. Check response
    if (response.data && response.data.ok) {
      return res.json({
        success: true,
        message: 'STK Push sent! Check your phone and enter your M-Pesa PIN.',
        data: response.data
      });
    }

    return res.status(400).json({
      success: false,
      message: response.data.message || 'Payment initiation failed.',
      data: response.data
    });

  } catch (error) {
    const errorDetails = error.response?.data || error.message;
    console.error('❌ BluePay API Response Error:', errorDetails);

    // Handle 402 Insufficient Prepaid Service Balance
    if (error.response?.status === 402) {
      return res.status(402).json({
        success: false,
        message: 'Top up required: Insufficient BluePay service tokens balance.',
        error: errorDetails
      });
    }

    return res.status(error.response?.status || 500).json({
      success: false,
      message: error.response?.data?.message || 'Payment request failed.',
      error: errorDetails
    });
  }
});

/**
 * POST /api/payment-status
 * Query payment status manually
 */
app.post('/api/payment-status', async (req, res) => {
  try {
    const { checkout_request_id, account_reference } = req.body;

    const payload = {
      api_username: process.env.BLUEPAY_USERNAME,
      api_password: process.env.BLUEPAY_PASSWORD
    };

    if (checkout_request_id) payload.checkout_request_id = checkout_request_id;
    if (account_reference) payload.account_reference = account_reference;

    const response = await axios.post(
      'https://bluepay.co.ke/api/payment_status.php',
      payload,
      { headers: { 'Content-Type': 'application/json' } }
    );

    return res.json(response.data);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

/**
 * POST /webhook/bluepay
 */
app.post('/webhook/bluepay', (req, res) => {
  console.log('📩 BluePay callback received:', req.body);
  res.status(200).json({ received: true });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
