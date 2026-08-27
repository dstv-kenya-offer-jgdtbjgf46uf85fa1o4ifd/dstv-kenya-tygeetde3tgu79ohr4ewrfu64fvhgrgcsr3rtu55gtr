const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// ============================================
// SERVE YOUR FRONTEND FROM /public FOLDER
// ============================================
app.use(express.static(path.join(__dirname, 'public')));

// If someone visits the root, send them the payment page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// PAYHERO CONFIG
// ============================================
const PAYHERO_USERNAME = process.env.PAYHERO_USERNAME;
const PAYHERO_PASSWORD = process.env.PAYHERO_PASSWORD;
const PAYHERO_CHANNEL_ID = parseInt(process.env.PAYHERO_CHANNEL_ID, 10);

if (!PAYHERO_USERNAME || !PAYHERO_PASSWORD || !PAYHERO_CHANNEL_ID) {
    console.error('Missing PayHero env vars');
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
    } else if (!(num.startsWith('254') && num.length === 12)) {
        throw new Error('Invalid phone number format.');
    }

    if (!/^254[17]\d{8}$/.test(num)) {
        throw new Error('Invalid Safaricom number.');
    }
    return num;
}

// ============================================
// API ROUTE — your frontend calls this
// ============================================
app.post('/api/payhero/stk-push', async (req, res) => {
    try {
        const { msisdn, amount = 100, reference = 'PAYMENT', customer_name = 'Customer' } = req.body;

        if (!msisdn) {
            return res.status(400).json({ success: false, message: 'MSISDN is required' });
        }

        const normalizedPhone = normalizePhoneNumber(msisdn);

        const payload = {
            amount: parseInt(amount, 10),
            phone_number: normalizedPhone,
            channel_id: PAYHERO_CHANNEL_ID,
            provider: 'm-pesa',
            external_reference: reference,
            customer_name: customer_name,
            callback_url: `${req.protocol}://${req.get('host')}/api/payhero/callback`
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

        return res.json({
            success: true,
            message: 'STK Push initiated successfully',
            data: {
                reference: result.reference,
                checkout_request_id: result.CheckoutRequestID,
                status: result.status
            }
        });

    } catch (error) {
        console.error('STK Push Error:', error.response?.data || error.message);
        return res.status(500).json({
            success: false,
            message: error.response?.data?.message || error.message || 'Failed to initiate payment'
        });
    }
});

// PayHero sends results here
app.post('/api/payhero/callback', (req, res) => {
    console.log('Callback:', req.body);
    res.json({ success: true });
});

// ============================================
// START
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
