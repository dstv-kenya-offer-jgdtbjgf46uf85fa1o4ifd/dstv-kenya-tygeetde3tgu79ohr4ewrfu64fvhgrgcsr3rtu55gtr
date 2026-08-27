const express = require('express');
const axios = require('axios');
const router = express.Router();

// PayHero Configuration
const PAYHERO_BASE_URL = 'https://backend.payhero.co.ke/api/v2';
const PAYHERO_BASIC_AUTH = 'Basic ' + Buffer.from('YOUR_USERNAME:YOUR_PASSWORD').toString('base64');
const PAYHERO_CHANNEL_ID = 133; // Your PayHero channel ID

/**
 * Normalize Kenyan phone numbers to 254XXXXXXXXX format
 */
function normalizePhoneNumber(raw) {
    let num = raw.replace(/\s+/g, '').replace(/-/g, '');

    // Remove leading +
    if (num.startsWith('+')) num = num.substring(1);

    // 07XXXXXXXX -> 2547XXXXXXXX
    if (num.startsWith('07') && num.length === 10) {
        num = '254' + num.substring(1);
    }
    // 7XXXXXXXX -> 2547XXXXXXXX
    else if (num.startsWith('7') && num.length === 9) {
        num = '254' + num;
    }
    // 01XXXXXXXX -> 2541XXXXXXXX
    else if (num.startsWith('01') && num.length === 10) {
        num = '254' + num.substring(1);
    }
    // 1XXXXXXXX -> 2541XXXXXXXX
    else if (num.startsWith('1') && num.length === 9) {
        num = '254' + num;
    }
    // 2547XXXXXXXX or 2541XXXXXXXX (already correct)
    else if (num.startsWith('254') && num.length === 12) {
        // valid
    }
    else {
        throw new Error('Invalid phone number format. Use 07XX, 01XX, 7XX, 1XX, or 254XXX.');
    }

    // Validate: must be 12 digits starting with 254
    if (!/^254[17]\d{8}$/.test(num)) {
        throw new Error('Invalid Safaricom phone number.');
    }

    return num;
}

/**
 * POST /api/payhero/stk-push
 * Frontend calls this endpoint when user clicks Continue
 */
router.post('/payhero/stk-push', async (req, res) => {
    try {
        const { msisdn, amount = 100, reference = 'PAYMENT', customer_name = 'Customer' } = req.body;

        if (!msisdn) {
            return res.status(400).json({ success: false, message: 'MSISDN is required' });
        }

        // 1. VALIDATE & NORMALIZE
        const normalizedPhone = normalizePhoneNumber(msisdn);
        console.log('Normalized phone:', normalizedPhone);

        // 2. CALL PAYHERO STK PUSH API
        // Endpoint: POST https://backend.payhero.co.ke/api/v2/payments
        const payload = {
            amount: parseInt(amount, 10),
            phone_number: normalizedPhone,  // PayHero accepts 2547XXXXXXXX
            channel_id: PAYHERO_CHANNEL_ID,
            provider: 'm-pesa',
            external_reference: reference,
            customer_name: customer_name,
            callback_url: 'https://your-backend.com/api/payhero/callback' // Your webhook
        };

        const payheroResponse = await axios.post(
            `${PAYHERO_BASE_URL}/payments`,
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': PAYHERO_BASIC_AUTH
                },
                timeout: 15000 // 15 seconds
            }
        );

        const result = payheroResponse.data;
        console.log('PayHero response:', result);

        // 3. RETURN SUCCESS TO FRONTEND
        // The frontend will then display "prompt sent"
        return res.status(200).json({
            success: true,
            message: 'STK Push initiated successfully',
            data: {
                reference: result.reference,
                checkout_request_id: result.CheckoutRequestID,
                status: result.status // Usually "QUEUED"
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

/**
 * POST /api/payhero/callback
 * PayHero sends payment results here
 */
router.post('/payhero/callback', express.json(), (req, res) => {
    console.log('PayHero callback received:', req.body);

    // TODO: Update your database with payment status
    // result.status can be: QUEUED | SUCCESS | FAILED

    res.status(200).json({ success: true, message: 'Callback received' });
});

module.exports = router;
