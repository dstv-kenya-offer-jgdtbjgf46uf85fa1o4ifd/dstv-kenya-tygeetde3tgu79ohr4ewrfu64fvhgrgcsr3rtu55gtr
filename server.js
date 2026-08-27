// Phone normalization: 0712… → 254712…
function normalizePhone(raw) {
  let d = raw.replace(/\D/g,'');
  if (d.startsWith('0') && d.length===10) d = '254'+d.slice(1);
  if ((d.startsWith('7')||d.startsWith('1')) && d.length===9) d = '254'+d;
  return /^254[17]\d{8}$/.test(d) ? {valid:true, phone:d}
                                 : {valid:false, error:'Invalid Kenyan number'};
}

// PayHero STK Push
const auth = Buffer.from(`${username}:${password}`).toString('base64');
await axios.post('https://backend.payhero.co.ke/api/v2/payments', {
  amount, phone_number: normalized.phone, channel_id, provider: 'm-pesa', ...
}, {headers: {Authorization: `Basic ${auth}`}});
