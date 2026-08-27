# app.py — Python/Flask backend for PayHero STK Push
# Requirements: flask, requests, python-dotenv

import os
import re
import requests
from flask import Flask, request, jsonify
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# =============================================================================
# CONFIGURATION — Keep these secret, never expose to browser
# =============================================================================
PAYHERO_BASE_URL = 'https://backend.payhero.co.ke/api/v2'
PAYHERO_AUTH_TOKEN = os.getenv('PAYHERO_AUTH_TOKEN')      # Your PayHero API token
PAYHERO_CHANNEL_ID = os.getenv('PAYHERO_CHANNEL_ID')      # Your PayHero payment channel ID
PAYHERO_CALLBACK_URL = os.getenv('PAYHERO_CALLBACK_URL')  # Your public callback endpoint

# =============================================================================
# PHONE NUMBER VALIDATION & NORMALISATION (Kenya)
# =============================================================================
def normalize_phone_number(raw):
    # Remove all non-digits
    digits = re.sub(r'\D', '', raw)

    # Handle common Kenyan formats
    if digits.startswith('0') and len(digits) == 10:
        digits = '254' + digits[1:]
    elif digits.startswith('7') and len(digits) == 9:
        digits = '254' + digits
    elif digits.startswith('1') and len(digits) == 9:
        digits = '254' + digits
    elif digits.startswith('254') and len(digits) == 12:
        pass  # Already normalized
    elif raw.startswith('+'):
        digits = re.sub(r'\D', '', raw)

    # Validate Safaricom/Airtel Kenya format
    is_valid = bool(re.match(r'^254(7\d{8}|1\d{8}|11\d{7})$', digits))
    return digits, is_valid

# =============================================================================
# PAYHERO STK PUSH ENDPOINT
# =============================================================================
@app.route('/api/payhero/stk-push', methods=['POST'])
def stk_push():
    try:
        data = request.get_json()
        msisdn = data.get('msisdn', '').strip()
        smartcard = data.get('smartcard', '')
        amount = data.get('amount', 100)

        # 1. Validate presence
        if not msisdn:
            return jsonify({'success': False, 'message': 'Mobile number is required'}), 400

        # 2. Validate & normalize
        normalized, is_valid = normalize_phone_number(msisdn)
        if not is_valid:
            return jsonify({
                'success': False,
                'message': 'Invalid mobile number. Please enter a valid Kenyan M-Pesa number.'
            }), 400

        # 3. Build PayHero payload
        payload = {
            'amount': amount,
            'phone_number': normalized,
            'channel_id': int(PAYHERO_CHANNEL_ID),
            'provider': 'm-pesa',
            'external_reference': smartcard or f'PAY-{int(time.time())}',
            'customer_name': 'Customer',
            'callback_url': PAYHERO_CALLBACK_URL
        }

        # 4. Call PayHero API (credentials stay on server)
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {PAYHERO_AUTH_TOKEN}'
        }

        response = requests.post(
            f'{PAYHERO_BASE_URL}/payments',
            json=payload,
            headers=headers,
            timeout=30
        )

        payhero_data = response.json()

        # 5. Return result to frontend
        if response.ok:
            return jsonify({
                'success': True,
                'message': 'M-Pesa prompt sent. Please check your phone and enter your PIN.',
                'reference': payhero_data.get('reference') or payhero_data.get('external_reference'),
                'checkout_id': payhero_data.get('checkout_request_id'),
                'raw': payhero_data
            })
        else:
            return jsonify({
                'success': False,
                'message': payhero_data.get('message', 'Payment gateway error. Please try again.'),
                'raw': payhero_data
            }), 502

    except Exception as e:
        app.logger.error(f'Backend STK Push Error: {e}')
        return jsonify({
            'success': False,
            'message': 'Internal server error. Please try again later.'
        }), 500

# =============================================================================
# CALLBACK HANDLER — PayHero sends payment results here
# =============================================================================
@app.route('/api/payhero/callback', methods=['POST'])
def payhero_callback():
    try:
        payload = request.get_json(force=True, silent=True) or {}
        app.logger.info(f'PayHero Callback: {payload}')

        # TODO: Update your database based on callback status
        # payload fields: status, reference, receipt_number, amount, phone_number, etc.

        # Always respond 200 so PayHero knows you received it
        return jsonify({'received': True}), 200
    except Exception as e:
        app.logger.error(f'Callback error: {e}')
        return jsonify({'received': True}), 200

# =============================================================================
# START SERVER
# =============================================================================
if __name__ == '__main__':
    import time
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
