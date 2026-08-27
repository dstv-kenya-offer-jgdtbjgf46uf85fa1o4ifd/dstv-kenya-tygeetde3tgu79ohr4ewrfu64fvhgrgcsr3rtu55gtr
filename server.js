require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// Secure configuration from environment variables
const PAYHERO_API_KEY = process.env.PAYHERO_API_KEY; // Your PayHero API Key
const PAYHERO_CHANNEL_ID = process.env.PAYHERO_CHANNEL_ID; // Your payment channel ID
const PAYHERO_BASE_URL = 'https://backend.payhero.co.ke/api/v2';

/**
 * Normalizes Kenyan phone numbers to 254XXXXXXXXX format
 */
function normalizePhone(phone) {
    // Remove all non-digits
    let cleaned = phone.replace(/\D/g, '');
    
    // Handle 07... or 01... -> 2547... / 2541...
    if (cleaned.length === 10 && (cleaned.startsWith('07') || cleaned.startsWith('01'))) {
        cleaned = '254' + cleaned.substring(1);
    }
    
    // Handle +254... -> 254...
    if (cleaned.startsWith('254') && cleaned.length === 13) {
        cleaned = cleaned.replace(/^2540/, '254');
    }
    
    // Validate: must be 2547XXXXXXXX or 2541XXXXXXXX (12 digits)
    const kenyanRegex = /^254[17]\d{8}$/;
    if (!kenyanRegex.test(cleaned)) {
        return null;
    }
    
    return cleaned;
}

/**
 * Initiates PayHero STK Push
 */
async function initiatePayHeroSTK(phone, amount, reference, customerName) {
    const url = `${PAYHERO_BASE_URL}/payments`;
    
    const payload = {
        amount: parseInt(amount, 10),
        phone_number: phone,
        channel_id: parseInt(PAYHERO_CHANNEL_ID, 10),
        provider: 'm-pesa',
        external_reference: reference,
        customer_name: customerName || 'Customer',
        callback_url: process.env.CALLBACK_URL || 'https://yourdomain.com/api/payhero-callback'
    };

    const response = await axios.post(url, payload, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${PAYHERO_API_KEY}`
        },
        timeout: 30000
    });

    return response.data;
}

// API Endpoint: Initiate Payment
app.post('/api/initiate-payment', async (req, res) => {
    try {
        const { phone_number, smartcard_number, amount } = req.body;

        // Validation
        if (!phone_number) {
            return res.status(400).json({ 
                success: false, 
                error: 'Phone number is required' 
            });
        }

        if (!amount || isNaN(amount) || parseInt(amount) <= 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Valid amount is required' 
            });
        }

        // Normalize phone
        const normalizedPhone = normalizePhone(phone_number);
        if (!normalizedPhone) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid phone number format. Use 07XXXXXXXX, 01XXXXXXXX, or 254XXXXXXXXX' 
            });
        }

        // Generate unique reference
        const reference = `DPP-${smartcard_number || 'PAY'}-${Date.now()}`;

        // Call PayHero API (credentials never leave the server)
        const result = await initiatePayHeroSTK(
            normalizedPhone,
            amount,
            reference,
            `Customer ${smartcard_number || ''}`
        );

        // Return result to frontend
        return res.json({
            success: true,
            status: result.status || 'QUEUED',
            reference: result.reference || reference,
            CheckoutRequestID: result.CheckoutRequestID || null,
            message: result.message || 'STK Push initiated successfully',
            payhero_response: result
        });

    } catch (error) {
        console.error('PayHero API Error:', error.response?.data || error.message);
        
        // Return safe error message (don't leak internal details)
        return res.status(500).json({
            success: false,
            error: 'Unable to initiate payment at this time. Please try again.',
            details: error.response?.data?.message || error.message
        });
    }
});

// Optional: Callback endpoint for PayHero to notify you of payment status
app.post('/api/payhero-callback', express.raw({ type: 'application/json' }), (req, res) => {
    try {
        const callbackData = JSON.parse(req.body);
        console.log('PayHero Callback received:', callbackData);
        
        // TODO: Update your database, mark order as paid, etc.
        // Verify signature if PayHero provides one
        
        res.json({ status: 'received' });
    } catch (err) {
        console.error('Callback processing error:', err);
        res.status(400).json({ status: 'error' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Payment backend running on port ${PORT}`);
});
