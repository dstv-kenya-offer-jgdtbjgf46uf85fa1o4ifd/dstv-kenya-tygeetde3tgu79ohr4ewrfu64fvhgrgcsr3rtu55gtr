(function() {
    function init() {
        const btn = document.querySelector('button');
        const msisdnInput = document.querySelector('input[name="MSISDN"]');
        
        if (!btn || !msisdnInput) return;

        btn.addEventListener('click', async function(e) {
            e.preventDefault();
            e.stopPropagation();

            const rawNumber = msisdnInput.value.trim();
            if (!rawNumber) {
                alert('Please enter your M-Pesa number');
                msisdnInput.focus();
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Sending...';

            try {
                const response = await fetch('/api/payhero/stk-push', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ msisdn: rawNumber })
                });

                const data = await response.json();
                const old = document.getElementById('stk-message');
                if (old) old.remove();

                const msg = document.createElement('div');
                msg.id = 'stk-message';
                msg.style.cssText = 'margin-top:12px;padding:12px;border-radius:6px;text-align:center;font-weight:600;font-size:14px;';

                if (response.ok && data.success) {
                    msg.textContent = 'prompt sent';
                    msg.style.cssText += 'background:#d4edda;color:#155724;border:1px solid #c3e6cb;';
                    btn.textContent = 'Prompt Sent';
                } else {
                    msg.textContent = data.message || 'Failed to send prompt. Please try again.';
                    msg.style.cssText += 'background:#f8d7da;color:#721c24;border:1px solid #f5c6cb;';
                    btn.disabled = false;
                    btn.textContent = 'Continue';
                }

                btn.parentElement.appendChild(msg);

            } catch (error) {
                btn.disabled = false;
                btn.textContent = 'Continue';
                alert('Network error. Please try again.');
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
