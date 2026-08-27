const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Enable CORS for frontend requests
app.use(cors());
app.use(express.json());

// Dynamic payment amount from environment, fallback to 1000
const PAYMENT_AMOUNT = Number(process.env.PAYMENT_AMOUNT) || 1000;

// Helper function to validate and format Kenyan phone numbers into 254XXXXXXXXX
function formatKenyanNumber(phone) {
  if (!phone) return null;
  let cleaned = phone.toString().replace(/\D/g, ''); // Remove non-digit characters

  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '254' + cleaned.substring(1);
  } else if (cleaned.startsWith('7') || cleaned.startsWith('1')) {
    if (cleaned.length === 9) {
      cleaned = '254' + cleaned;
    }
  } else if (cleaned.startsWith('254') && cleaned.length === 12) {
    // Already valid format
  } else {
    return null; // Invalid format
  }

  return cleaned;
}

// 1. Root route handler (Fixes "Cannot GET /")
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'online',
    message: 'DSTV Kenya Payment Backend Service is active.',
    current_amount: PAYMENT_AMOUNT
  });
});

// 2. STK Push Route
app.post('/api/stkpush', async (req, res) => {
  const { phone_number } = req.body;

  if (!phone_number) {
    return res.status(400).json({ 
      success: false, 
      message: 'Phone number is required.' 
    });
  }

  const normalizedPhone = formatKenyanNumber(phone_number);

  if (!normalizedPhone) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid phone number format. Please enter a valid Safaricom/Airtel number.' 
    });
  }

  try {
    const payHeroResponse = await fetch('https://backend.payhero.co.ke/api/v2/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': process.env.PAYHERO_API_KEY
      },
      body: JSON.stringify({
        amount: PAYMENT_AMOUNT,
        phone_number: normalizedPhone,
        channel_id: Number(process.env.PAYHERO_CHANNEL_ID),
        provider: 'm-pesa',
        external_reference: `DSTV_${Date.now()}`,
        callback_url: process.env.PAYHERO_CALLBACK_URL || 'https://your-render-service.onrender.com/api/callback'
      })
    });

    const result = await payHeroResponse.json();

    if (payHeroResponse.ok && (result.status === 'Success' || result.success)) {
      return res.status(200).json({
        success: true,
        message: 'STK Push initiated successfully.',
        data: result
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message || 'Failed to trigger STK Push from PayHero.'
      });
    }
  } catch (error) {
    console.error('PayHero API Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while processing payment.'
    });
  }
});

// 3. Catch-all for undefined routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found. Make sure your request method and endpoint path are correct.'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend service running on port ${PORT} with active price KES ${PAYMENT_AMOUNT}`);
});
