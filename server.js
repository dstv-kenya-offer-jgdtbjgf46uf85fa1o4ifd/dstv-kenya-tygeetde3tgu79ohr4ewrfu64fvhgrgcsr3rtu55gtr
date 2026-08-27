const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());

// ============================================
// SERVE STATIC FILES (if public/ exists)
// ============================================
const publicPath = path.join(__dirname, 'public');
const hasPublicFolder = fs.existsSync(publicPath);

if (hasPublicFolder) {
    app.use(express.static(publicPath));
    console.log('Serving static files from /public');
} else {
    console.log('WARNING: /public folder not found. Creating it is recommended.');
}

app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.send(`
            <h1>Backend is running</h1>
            <p>Put your index.html inside a /public folder and redeploy.</p>
            <p>API endpoint: POST /api/payhero/stk-push</p>
        `);
    }
});

// ============================================
// PAYHERO CONFIG
// ============================================
const PAYHERO_USERNAME = process.env.PAYHERO_USERNAME || '';
const PAYHERO_PASSWORD = process.env.PAYHERO_PASSWORD || '';
const PAYHERO_CHANNEL_ID = parseInt(process.env.PAYHERO_CHANNEL_ID || '0', 10);

console.log('Config check:', {
    has_username: !!PAYHERO_USERNAME,
    has_password: !!PAYHERO_PASSWORD,
    channel_id: PAYHERO_CHANNEL_ID
});

const PAYHERO_BASE_URL = 'https://backend.payhero.co.ke/api/v2';
const PAYHERO_BASIC_AUTH = (PAYHERO_USERNAME && PAYHERO_PASSWORD)
    ? 'Basic ' + Buffer.from(`${PAYHERO_USERNAME}:${PAYHERO_PASSWORD}`).toString('base64')
    : null;

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
// STK PUSH API
// ============================================
app.post('/api/payhero/stk-push', async (req, res) => {
    try {
        const { msisdn, amount = 100, reference = 'PAYMENT', customer_name = 'Customer' } = req.body;

        if (!msisdn) {
            return res.status(400).json({ success: false, message: 'MSISDN is required' });
        }

        if (!PAYHERO_BASIC_AUTH) {
            return res.status(500).json({ success: false, message: 'Server not configured: missing PayHero credentials' });
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
                timeout: 20000
            }
        );

        return res.json({
            success: true,
            message: 'prompt sent',
            data: payheroResponse.data
        });

    } catch (error) {
        console.error('STK Push Error:', error.response?.data || error.message);
        return res.status(500).json({
            success: false,
            message: error.response?.data?.message || error.message || 'Payment failed'
        });
    }
});

// Callback from PayHero
app.post('/api/payhero/callback', (req, res) => {
    console.log('Callback received:', req.body);
    res.json({ received: true });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
