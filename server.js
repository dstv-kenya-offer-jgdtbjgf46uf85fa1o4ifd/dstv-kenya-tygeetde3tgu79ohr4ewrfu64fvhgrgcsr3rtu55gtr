const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// ============================================
// SERVE STATIC FRONTEND
// ============================================
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// ============================================
// HEALTH CHECK (test if backend is alive)
// ============================================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// ============================================
// PAYHERO CONFIG
// ============================================
const PAYHERO_USERNAME = process.env.PAYHERO_USERNAME;
const PAYHERO_PASSWORD = process.env.PAYHERO_PASSWORD;
const PAYHERO_CHANNEL_ID = parseInt(process.env.PAYHERO_CHANNEL_ID, 10);

if (!PAYHERO_USERNAME || !PAYHERO_PASSWORD || !PAYHERO_CHANNEL_ID) {
    console.error('FATAL: Missing PayHero environment variables.');
    console.error('Set PAYHERO_USERNAME, PAYHERO_PASSWORD, and PAYHERO_CHANNEL_ID in Render dashboard.');
    // Don't exit — let the server start so you can see the error in logs
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

    if (num.startsWith('07') && num.length === 10) {
        num = '254' + num.substring(1);
    } else if (num.startsWith('7') && num.length === 9) {
        num = '254' + num;
    } else if (num.startsWith('01') && num.length === 10) {
        num = '254' + num.substring(1);
    } else if (num.startsWith('1') && num.length === 9) {
        num = '254' + num;
    } else if (num.startsWith('254') && num.length === 12) {
        // valid
    } else {
        throw new Error('Invalid phone number. Use 07XX, 01XX, 7XX, 1XX, or 254XXX format.');
    }

    if (!/^254[17]\d{8}$/.test(num)) {
        throw new Error('Invalid Safaricom number. Must start with 2547 or 2541.');
    }
    return num;
}

// ============================================
// STK PUSH API
// ============================================
app.post('/api/payhero/stk-push', async (req, res) => {
    try {
        console.log('Received STK request:', req.body);
        
        const { msisdn } = req.body;
        if (!msisdn) {
            return res.status(400).json({ success: false, message: 'MSISDN is required' });
        }

        // Check PayHero config
        if (!PAYHERO_USERNAME || !PAYHERO_PASSWORD) {
            return res.status(500).json({ success: false, message: 'Server config error: PayHero credentials missing' });
        }

        const normalizedPhone = normalizePhoneNumber(msisdn);
        console.log('Normalized phone:', normalizedPhone);

        const payload = {
            amount: 100,
            phone_number: normalizedPhone,
            channel_id: PAYHERO_CHANNEL_ID,
            provider: 'm-pesa',
            external_reference: 'DSTV-' + Date.now(),
            customer_name: 'Customer',
            callback_url: `${req.protocol}://${req.get('host')}/api/payhero/callback`
        };

        console.log('Calling PayHero...');
        
        const payheroResponse = await axios.post(
            `${PAYHERO_BASE_URL}/payments`,
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': PAYHERO_BASIC_AUTH
                },
                timeout: 20000 // 20 seconds
            }
        );

        console.log('PayHero response:', payheroResponse.data);

        return res.json({
            success: true,
            message: 'prompt sent',
            data: payheroResponse.data
        });

    } catch (error) {
        console.error('STK Push Error:', error.message);
        if (error.response) {
            console.error('PayHero error response:', error.response.data);
        }
        
        return res.status(500).json({
            success: false,
            message: error.response?.data?.message || error.message || 'Payment initiation failed'
        });
    }
});

// PayHero callback
app.post('/api/payhero/callback', (req, res) => {
    console.log('Callback received:', req.body);
    res.json({ received: true });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📄 Frontend: http://localhost:${PORT}/`);
    console.log(`🔍 Health check: http://localhost:${PORT}/health`);
    console.log(`💳 API: http://localhost:${PORT}/api/payhero/stk-push`);
});
