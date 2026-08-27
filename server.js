const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

// Helper function to validate and format Kenyan phone numbers into 254XXXXXXXXX
function formatKenyanNumber(phone) {
  let cleaned = phone.replace(/\D/g, ''); // Remove non-digit characters

  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '254' + cleaned.substring(1);
  } else if (cleaned.startsWith('7') || cleaned.startsWith('1')) {
    if (cleaned.length === 9) {
      cleaned = '254' + cleaned;
    }
  } else if (cleaned.startsWith('254') && cleaned.length === 12) {
    // Already in correct format
  } else {
    return null; // Invalid format
  }

  return cleaned;
}

app.post('/api/stkpush', async (req, res) => {
  const { phone_number } = req.body;

  if (!phone_number) {
    return res.status(400).json({ success: false, message: 'Phone number is required.' });
  }

  const normalizedPhone = formatKenyanNumber(phone_number);

  if (!normalizedPhone) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid phone number format. Please enter a valid Safaricom/Airtel number.' 
    });
  }

  try {
    // PayHero STK Push API integration
    const payHeroResponse = await fetch('https://backend.payhero.co.ke/api/v2/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': process.env.PAYHERO_API_KEY // Kept hidden on server
      },
      body: JSON.stringify({
        amount: 1, // Set your target amount or receive dynamically
        phone_number: normalizedPhone,
        channel_id: process.env.PAYHERO_CHANNEL_ID,
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend service running on port ${PORT}`);
});
