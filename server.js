// server.js — Node.js/Express backend for PayHero STK Push
// Requirements: express, node-fetch (or built-in fetch in Node 18+)

const express = require('express');
const app = express();

app.use(express.json());

// =============================================================================
// CONFIGURATION — Keep these secret, never expose to browser
// =============================================================================
const PAYHERO_CONFIG = {
    baseUrl: 'https://backend.payhero.co.ke/api/v2',
    authToken: process.env.PAYHERO_AUTH_TOKEN,   // Set via environment variable
    channelId: process.env.PAYHERO_CHANNEL_ID,   // Your PayHero payment channel ID
    callbackUrl: process.env.PAYHERO_CALLBACK_URL // Your public callback endpoint
};

// =============================================================================
// PHONE NUMBER VALIDATION & NORMALISATION (Kenya)
// =============================================================================
function normalizePhoneNumber(raw) {
    // Remove all non-digits
    let digits = raw.replace(/\D/g, '');

    // Handle common Kenyan formats:
    // 07XXXXXXXX  -> 2547XXXXXXXX
    // 011XXXXXXXX -> 25411XXXXXXX
    // +2547...    -> 2547...
    // 2547...     -> 2547... (already correct)

    if (digits.startsWith('0') && digits.length === 10) {
        digits = '254' + digits.substring(1);
    } else if (digits.startsWith('7') && digits.length === 9) {
        digits = '254' + digits;
    } else if (digits.startsWith('1') && digits.length === 9) {
        digits = '254' + digits;
    } else if (digits.startsWith('254') && digits.length === 12) {
        // Already normalized
    } else if (raw.startsWith('+')) {
        digits = raw.replace(/\D/g, '');
    }

    // Validate Safaricom/Airtel Kenya format
    const kenyaMobileRegex = /^254(7\d{8}|1\d{8}|11\d{7})$/;
    const isValid = kenyaMobileRegex.test(digits);

    return { normalized: digits, isValid };
}

// =============================================================================
// PAYHERO STK PUSH ENDPOINT
// =============================================================================
app.post('/api/payhero/stk-push', async (req, res) => {
    try {
        const { msisdn, smartcard, amount = 100 } = req.body;

        // 1. Validate presence
        if (!msisdn) {
            return res.status(400).json({
                success: false,
                message: 'Mobile number is required'
            });
        }

        // 2. Validate & normalize
        const { normalized, isValid } = normalizePhoneNumber(msisdn);
        if (!isValid) {
            return res.status(400).json({
                success: false,
                message: 'Invalid mobile number. Please enter a valid Kenyan M-Pesa number.'
            });
        }

        // 3. Build PayHero payload
        // Adjust amount and reference based on your business logic
        const payload = {
            amount: amount,
            phone_number: normalized,
            channel_id: parseInt(PAYHERO_CONFIG.channelId, 10),
            provider: 'm-pesa',
            external_reference: smartcard || `PAY-${Date.now()}`,
            customer_name: 'Customer', // Optional: collect from form if available
            callback_url: PAYHERO_CONFIG.callbackUrl
        };

        // 4. Call PayHero API (credentials stay on server)
        const payheroResponse = await fetch(`${PAYHERO_CONFIG.baseUrl}/payments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${PAYHERO_CONFIG.authToken}`
            },
            body: JSON.stringify(payload)
        });

        const payheroData = await payheroResponse.json();

        // 5. Return result to frontend
        if (payheroResponse.ok) {
            return res.json({
                success: true,
                message: 'M-Pesa prompt sent. Please check your phone and enter your PIN.',
                reference: payheroData.reference || payheroData.external_reference,
                checkout_id: payheroData.checkout_request_id || null,
                raw: payheroData  // Optional: remove in production if too verbose
            });
        } else {
            return res.status(502).json({
                success: false,
                message: payheroData.message || 'Payment gateway error. Please try again.',
                raw: payheroData
            });
        }

    } catch (error) {
        console.error('Backend STK Push Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error. Please try again later.'
        });
    }
});

// =============================================================================
// CALLBACK HANDLER — PayHero sends payment results here
// =============================================================================
app.post('/api/payhero/callback', express.raw({ type: 'application/json' }), (req, res) => {
    try {
        const payload = JSON.parse(req.body);
        console.log('PayHero Callback:', payload);

        // TODO: Update your database based on callback status
        // Check payload.status, payload.reference, payload.receipt_number, etc.

        // Always respond 200 so PayHero knows you received it
        res.status(200).json({ received: true });
    } catch (err) {
        console.error('Callback parse error:', err);
        res.status(200).json({ received: true }); // Still 200 to stop retries
    }
});

// =============================================================================
// START SERVER
// =============================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`PayHero STK backend running on port ${PORT}`);
});
