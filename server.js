// server.js
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const nodemailer = require('nodemailer');

const app = express();

// Multer for multipart/form-data (photos)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB per file
});

// Basic parsing for non-file fields
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ENV vars
const SHOP = process.env.SHOPIFY_SHOP;
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
const STORE_EMAIL = process.env.STORE_EMAIL;

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS
  }
});

// Upload 1 file to Shopify Files
async function uploadToShopifyFiles(buffer, filename, mimeType) {
  const contentBase64 = buffer.toString('base64');
  const payload = {
    file: {
      attachment: contentBase64,
      filename,
      content_type: mimeType
    }
  };

  const url = `https://${SHOP}/admin/api/2024-04/files.json`;

  const resp = await axios.post(url, payload, {
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': ADMIN_TOKEN
    }
  });

  return resp.data.file;
}

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Main submit endpoint
app.post('/api/submit', upload.any(), async (req, res) => {
  try {
    const { name, phone, email, instagram, body } = req.body;

    let payment_methods = [];
    try {
      payment_methods = JSON.parse(req.body.payment_methods || '[]');
    } catch (e) {
      payment_methods = [];
    }

    const pairs = [];
    for (const key of Object.keys(req.body)) {
      const match = key.match(/^pairs\[(\d+)\]\[(.+)\]$/);
      if (!match) continue;
      const idx = Number(match[1]);
      const field = match[2];
      if (!pairs[idx]) pairs[idx] = {};
      pairs[idx][field] = req.body[key];
    }

    const pairFileUrls = {};
    for (const file of req.files || []) {
      const field = file.fieldname;
      const m = field.match(/^photos_(\d+)/);
      if (!m) continue;
      const idx = Number(m[1]);
      if (!pairFileUrls[idx]) pairFileUrls[idx] = [];

      const shopifyFile = await uploadToShopifyFiles(
        file.buffer,
        file.originalname,
        file.mimetype
      );
      const url = shopifyFile.public_url || shopifyFile.url;
      pairFileUrls[idx].push(url);
    }

    let html = `
      <h2>Sell-to-Us Submission</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Phone:</strong> ${phone}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Instagram:</strong> ${instagram || '-'}</p>
      <p><strong>Payment methods:</strong> ${payment_methods.join(', ') || '-'}</p>
      <hr />
      <h3>Pairs</h3>
    `;

    pairs.forEach((p, idx) => {
      if (!p) return;
      html += `
        <h4>Pair #${idx + 1}</h4>
        <p><strong>Brand/Model:</strong> ${p.brand_model || '-'}</p>
        <p><strong>Size:</strong> ${p.size || '-'}</p>
        <p><strong>Condition:</strong> ${p.condition || '-'}</p>
        <p><strong>Desired Offer:</strong> ${p.desired_offer || '-'}</p>
        <p><strong>Notes:</strong> ${p.notes || '-'}</p>
      `;
      const urls = pairFileUrls[idx] || [];
      if (urls.length) {
        html += `<p><strong>Photos:</strong></p>`;
        urls.forEach(u => {
          html += `<div><a href="${u}" target="_blank">${u}</a></div>`;
        });
      }
      html += `<hr />`;
    });

    await transporter.sendMail({
      from: `"Sell To Us" <${SMTP_USER}>`,
      to: STORE_EMAIL,
      subject: `New Sell Submission from ${name}`,
      html
    });

    await transporter.sendMail({
      from: `"96Kickz" <${SMTP_USER}>`,
      to: email,
      subject: `We received your submission — 96Kickz`,
      html: `
        <p>Thanks ${name},</p>
        <p>We received your submission and will review your pairs within 24 hours.</p>
        <p>If you have any questions, just reply to this email.</p>
      `
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Submission error:', err.response?.data || err.message || err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sell-to-us backend listening on port ${PORT}`);
});
