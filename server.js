require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Serve static files (page2.html, CSS, images) from /public
app.use(express.static(path.join(__dirname, 'public')));

// ROOT ROUTE FIX: Serve page2.html when user visits /
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'page2.html'));
});

/**
 * Normalize Kenyan phone numbers to 254XXXXXXXXX format
 */
function normalizePhoneNumber(raw) {
    if (!raw) return null;
    
    // Remove all non-digits
    let digits = raw.replace(/\D/g, '');
    
    // Handle common Kenyan formats
    if (digits.startsWith('254') && digits.length === 12) {
        return digits;
    }
    if (digits.startsWith('0') && digits.length === 10) {
        return '254' + digits.substring(1);
    }
    if (digits.startsWith('7') || digits.startsWith('1')) {
        // Missing country code, assume Kenya
        return '254' + digits;
    }
    if (digits.length === 9 && (digits.startsWith('7') || digits.startsWith('1'))) {
        return '254' + digits;
    }
    
    return null;
}

/**
 * POST /api/stk-push
 * Receives MSISDN from frontend, validates it, calls PayHero API
 */
app.post('/api/stk-push', async (req, res) => {
    try {
        const { msisdn, smartcard, page_url } = req.body;

        // 1. Validate input
        if (!msisdn) {
            return res.status(400).json({
                success: false,
                message: 'Mobile number is required'
            });
        }

        // 2. Normalize phone number
        const normalizedPhone = normalizePhoneNumber(msisdn);
        if (!normalizedPhone) {
            return res.status(400).json({
                success: false,
                message: 'Invalid mobile number format. Please use 07XX, 01XX, or 254XXX format.'
            });
        }

        // 3. Prepare PayHero API call
        const payheroUrl = 'https://backend.payhero.co.ke/api/v2/payments';
        
        // Basic Auth: Base64(username:password)
        const authString = Buffer.from(
            `${process.env.PAYHERO_USERNAME}:${process.env.PAYHERO_PASSWORD}`
        ).toString('base64');

        const payload = {
            amount: 1, // TODO: Set your actual DStv package amount
            phone_number: normalizedPhone,
            channel_id: parseInt(process.env.PAYHERO_CHANNEL_ID, 10),
            provider: 'm-pesa',
            external_reference: smartcard || `DSTV-${Date.now()}`,
            customer_name: 'DStv Customer',
            callback_url: `${req.protocol}://${req.get('host')}/api/callback`
        };

        // 4. Call PayHero STK Push API (credentials never touch the browser)
        const response = await axios.post(payheroUrl, payload, {
            headers: {
                'Authorization': `Basic ${authString}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        // 5. Return result to frontend
        if (response.data && response.data.success) {
            return res.json({
                success: true,
                message: 'M-Pesa prompt sent. Check your phone to enter PIN.',
                data: response.data.data
            });
        } else {
            return res.status(400).json({
                success: false,
                message: response.data?.message || 'Payment initiation failed'
            });
        }

    } catch (error) {
        console.error('PayHero API Error:', error.response?.data || error.message);
        return res.status(500).json({
            success: false,
            message: error.response?.data?.message || 'Server error while processing payment'
        });
    }
});

/**
 * POST /api/callback
 * PayHero sends payment status updates here
 */
app.post('/api/callback', (req, res) => {
    console.log('PayHero Callback:', JSON.stringify(req.body, null, 2));
    
    // Always acknowledge receipt immediately
    res.json({ success: true, message: 'Callback received' });
    
    // TODO: Update your database, activate subscription, send email, etc.
    // Example:
    // const { status, external_reference, mpesa_receipt_number } = req.body;
    // if (status === 'completed') { ... }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit: http://localhost:${PORT}/`);
});
