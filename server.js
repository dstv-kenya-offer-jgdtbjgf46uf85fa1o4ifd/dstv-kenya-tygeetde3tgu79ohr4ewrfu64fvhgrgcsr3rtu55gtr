const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', env_check: {
        has_username: !!process.env.PAYHERO_USERNAME,
        has_password: !!process.env.PAYHERO_PASSWORD,
        has_channel: !!process.env.PAYHERO_CHANNEL_ID
    }});
});

// ============================================
// CONFIG
// ============================================
const PAYHERO_USERNAME = process.env.PAYHERO_USERNAME;
const PAYHERO_PASSWORD = process.env.PAYHERO_PASSWORD;
const PAYHERO_CHANNEL_ID = process.env.PAYHERO_CHANNEL_ID;

console.log('=== PAYHERO CONFIG ===');
console.log('Username set:', !!PAYHERO_USERNAME);
console.log('Password set:', !!PAYHERO_PASSWORD);
console.log('Channel ID:', PAYHERO_CHANNEL_ID);

if (!PAYHERO_USERNAME || !PAYHERO_PASSWORD || !PAYHERO_CHANNEL_ID) {
    console.error('FATAL: Missing env vars. Set PAYHERO_USERNAME, PAYHERO_PASSWORD, PAYHERO_CHANNEL_ID');
}

const PAYHERO_BASE_URL = 'https://backend.payhero.co.ke/api/v2';
const PAYHERO_BASIC_AUTH = 'Basic ' + Buffer.from(`${PAYHERO_USERNAME}:${PAYHERO_PASSWORD}`).toString('base64');

// ============================================
// PHONE NORMALIZATION
// ============================================
function normalizePhoneNumber(raw) {
    if (!raw) throw new Error('Phone number is empty');
    let num = String(raw).replace(/\s+/g, '').replace(/-/g, '');
    if (num.startsWith('+')) num = num.substring(1);

    if (num.startsWith('07') && num.length === 10) num = '254' + num.substring(1);
    else if (num.startsWith('7') && num.length === 9) num = '254' + num;
    else if (num.startsWith('01') && num.length === 10) num = '254' + num.substring(1);
    else if (num.startsWith('1') && num.length === 9) num = '254' + num;
    else if (!(num.startsWith('254') && num.length === 12)) {
        throw new Error('Invalid format. Use 07XX, 01XX, 7XX, 1XX, or 254XXX.');
    }

    if (!/^254[17]\d{8}$/.test(num)) {
        throw new Error('Invalid Safaricom number.');
    }
    return num;
}

// ============================================
// STK PUSH
// ============================================
app.post('/api/payhero/stk-push', async (req, res) => {
    try {
        const { msisdn } = req.body;
        console.log('\n=== NEW STK REQUEST ===');
        console.log('Raw MSISDN:', msisdn);

        if (!msisdn) {
            return res.status(400).json({ success: false, message: 'MSISDN is required' });
        }

        const normalizedPhone = normalizePhoneNumber(msisdn);
        console.log('Normalized phone:', normalizedPhone);

        // Build payload — using common PayHero field names
        // If these field names are wrong, PayHero returns 400
        const payload = {
            amount: parseInt(req.body.amount || 100, 10),
            phone_number: normalizedPhone,
            channel_id: parseInt(PAYHERO_CHANNEL_ID, 10),
            provider: "m-pesa",
            external_reference: req.body.reference || 'DSTV-' + Date.now(),
            customer_name: req.body.customer_name || 'Customer',
            callback_url: `${req.protocol}://${req.get('host')}/api/payhero/callback`
        };

        console.log('Payload to PayHero:', JSON.stringify(payload, null, 2));
        console.log('Auth header present:', !!PAYHERO_BASIC_AUTH);

        const payheroResponse = await axios.post(
            `${PAYHERO_BASE_URL}/payments`,
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': PAYHERO_BASIC_AUTH
                },
                timeout: 20000
            }
        );

        console.log('PayHero SUCCESS:', payheroResponse.data);
        return res.json({
            success: true,
            message: 'prompt sent',
            data: payheroResponse.data
        });

    } catch (error) {
        console.error('\n=== STK PUSH ERROR ===');
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);

        // This is the key part — PayHero returns 400 with details here
        if (error.response) {
            console.error('PayHero status:', error.response.status);
            console.error('PayHero headers:', JSON.stringify(error.response.headers, null, 2));
            console.error('PayHero data:', JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error('No response received from PayHero');
        } else {
            console.error('Request setup error:', error.message);
        }

        return res.status(500).json({
            success: false,
            message: error.response?.data?.message 
                || error.response?.data?.error 
                || error.message 
                || 'Payment failed'
        });
    }
});

// Callback
app.post('/api/payhero/callback', (req, res) => {
    console.log('Callback:', req.body);
    res.json({ received: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
