const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(cors()); // Allows your frontend to call this backend

// ============================================
// CONFIGURATION (Set these in Render Dashboard)
// ============================================
const PAYHERO_USERNAME = process.env.PAYHERO_USERNAME;
const PAYHERO_PASSWORD = process.env.PAYHERO_PASSWORD;
const PAYHERO_CHANNEL_ID = parseInt(process.env.PAYHERO_CHANNEL_ID, 10);
const CALLBACK_BASE_URL = process.env.CALLBACK_BASE_URL; // Your Render service URL

if (!PAYHERO_USERNAME || !PAYHERO_PASSWORD || !PAYHERO_CHANNEL_ID) {
    console.error('ERROR: Missing PayHero environment variables. Check Render dashboard.');
    process.exit(1);
}

const PAYHERO_BASE_URL = 'https://backend.payhero.co.ke/api/v2';
const PAYHERO_BASIC_AUTH = 'Basic ' + Buffer.from(`${PAYHERO_USERNAME}:${PAYHERO_PASSWORD}`).toString('base64');

// ============================================
// PHONE NORMALIZATION
// ============================================
function normalizePhoneNumber(raw) {
    let num = raw.replace(/\s+/g, '').replace(/-/g, '');
    if (num.startsWith('+')) num = num.substring(1);

    if (num.startsWith('07') && num.length === 10) {
        num = '254' + num.substring(1);
    } else if (num.startsWith('7') && num.length === 9) {
        num = '254' + num;
    } else if (num.startsWith('01') && num.length === 10) {
        num = '254' + num.substring(1);
    } else if (num.startsWith('1') && num.length === 9) {
        num = '254' + num;
    } else if (num.startsWith('254') && num.length === 12) {
        // already correct
    } else {
        throw new Error('Invalid phone number format. Use 07XX, 01XX, 7XX, 1XX, or 254XXX.');
    }

    if (!/^254[17]\d{8}$/.test(num)) {
        throw new Error('Invalid Safaricom phone number.');
    }
    return num;
}

// ============================================
// ROUTES
// ============================================

// Health check
app.get('/', (req, res) => {
    res.json({ status: 'PayHero STK Backend is running', timestamp: new Date().toISOString() });
});

// Main STK Push endpoint — your frontend calls this
app.post('/api/payhero/stk-push', async (req, res) => {
    try {
        const { msisdn, amount = 100, reference = 'PAYMENT', customer_name = 'Customer' } = req.body;

        if (!msisdn) {
            return res.status(400).json({ success: false, message: 'MSISDN is required' });
        }

        // 1. Validate & Normalize
        const normalizedPhone = normalizePhoneNumber(msisdn);
        console.log(`[STK Push] Normalized: ${normalizedPhone} | Amount: ${amount}`);

        // 2. Call PayHero API
        const payload = {
            amount: parseInt(amount, 10),
            phone_number: normalizedPhone,
            channel_id: PAYHERO_CHANNEL_ID,
            provider: 'm-pesa',
            external_reference: reference,
            customer_name: customer_name,
            callback_url: `${CALLBACK_BASE_URL}/api/payhero/callback`
        };

        const payheroResponse = await axios.post(
            `${PAYHERO_BASE_URL}/payments`,
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': PAYHERO_BASIC_AUTH
                },
                timeout: 15000
            }
        );

        const result = payheroResponse.data;
        console.log(`[STK Push] PayHero response:`, result);

        // 3. Return success to frontend → triggers "prompt sent"
        return res.status(200).json({
            success: true,
            message: 'STK Push initiated successfully',
            data: {
                reference: result.reference,
                checkout_request_id: result.CheckoutRequestID,
                status: result.status
            }
        });

    } catch (error) {
        console.error('[STK Push Error]', error.response?.data || error.message);
        return res.status(500).json({
            success: false,
            message: error.response?.data?.message || error.message || 'Failed to initiate payment'
        });
    }
});

// PayHero sends payment results here
app.post('/api/payhero/callback', (req, res) => {
    console.log('[PayHero Callback] Received:', JSON.stringify(req.body, null, 2));
    
    // TODO: Update your database with payment status
    // Possible statuses: QUEUED | SUCCESS | FAILED
    
    res.status(200).json({ success: true, message: 'Callback received' });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/`);
});
