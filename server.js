app.post('/api/submit', upload.array('photos'), async (req, res) => {
  console.log('📩 Received /api/submit');

  try {
    let {
      customer_name,
      customer_phone,
      customer_email,
      customer_instagram,
      payment_methods,
      pairs_json,
    } = req.body;                                               

    // Debug: see exactly what’s coming from the frontend
    console.log('REQ BODY:', req.body);
    console.log('FILES COUNT:', Array.isArray(req.files) ? req.files.length : 0);

    // Make sure everything is a string before trimming
    customer_name = (customer_name || '').toString().trim();
    customer_phone = (customer_phone || '').toString().trim();
    customer_email = (customer_email || '').toString().trim();
    customer_instagram = (customer_instagram || '').toString().trim();
    payment_methods = (payment_methods || '').toString().trim();

    // Parse the pairs JSON from the frontend
    let pairs = [];
    try {
      if (pairs_json) {
        pairs = JSON.parse(pairs_json);
      }
    } catch (e) {
      console.error('❌ Failed to parse pairs_json:', e);
      return res.status(400).json({ ok: false, error: 'Invalid pairs_json' });
    }

    // Build the email body text
    let emailText = `New Sell-To-Us submission\n\n`;

    emailText += `Name: ${customer_name}\n`;
    emailText += `Phone: ${customer_phone}\n`;
    emailText += `Email: ${customer_email}\n`;
    emailText += `Instagram: ${customer_instagram}\n`;
    emailText += `Payment methods: ${payment_methods}\n\n`;

    pairs.forEach((p, i) => {
      emailText += `--- Pair #${i + 1} ---\n`;
      emailText += `Brand/Model: ${p.brand_model || ''}\n`;
      emailText += `Size (US): ${p.size_us || ''}\n`;
      emailText += `Condition: ${p.condition || ''}\n`;
      emailText += `Has Box: ${p.has_box || ''}\n`;
      emailText += `Desired Price: ${p.desired_price || ''}\n`;
      emailText += `Notes: ${p.notes || ''}\n\n`;
    });

    console.log('EMAIL TEXT:\n', emailText);

    // ----- STORE EMAIL (sanitized + logged) -----
    const rawStoreEmail = process.env.STORE_EMAIL;
    const storeEmail = (rawStoreEmail || '').toString().trim();

    console.log('RAW STORE_EMAIL env:', JSON.stringify(rawStoreEmail));
    console.log('TRIMMED storeEmail:', JSON.stringify(storeEmail));

    if (!storeEmail) {
      console.error('❌ STORE_EMAIL env var is empty or missing');
      return res
        .status(500)
        .json({ ok: false, error: 'Store email not configured' });
    }

    console.log('📧 Sending store email to:', storeEmail);

    // ----- ATTACH PHOTOS FROM req.files -----
    const attachments = [];
    if (Array.isArray(req.files) && req.files.length > 0) {
      console.log(`📎 Attaching ${req.files.length} photo(s) to store email`);
      req.files.forEach((file, idx) => {
        attachments.push({
          filename: file.originalname || `photo-${idx + 1}.jpg`,
          content: file.buffer,
        });
      });
    } else {
      console.log('ℹ️ No files received in req.files');
    }

    // ---- Send email to store ----
    await transporter.sendMail({
      from: `"96Kickz Sell Form" <${process.env.SMTP_USER}>`,
      to: storeEmail,
      subject: `New Sell Submission from ${customer_name || 'Unknown'}`,
      text: emailText,
      attachments, // ✅ photos now attached
    });

    // ---- Send confirmation email to customer ----
    const customerEmailClean = customer_email.trim();
    if (customerEmailClean) {
      console.log('📧 Sending confirmation email to customer:', customerEmailClean);

      await transporter.sendMail({
        from: `"96Kickz" <${process.env.SMTP_USER}>`,
        to: customerEmailClean,
        subject: 'We received your 96Kickz sell submission',
        text:
          'Thanks for submitting your pairs to 96Kickz.\n\n' +
          'We’ll review everything and send your cash offer within 24 hours.\n\n' +
          'If you didn’t make this request, you can ignore this email.',
      });
    } else {
      console.log('ℹ️ No valid customer email supplied, skipping confirmation email');
    }

    console.log('✅ Emails sent successfully');
    return res.json({ ok: true });
  } catch (err) {
    console.error('❌ Error in /api/submit:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});
