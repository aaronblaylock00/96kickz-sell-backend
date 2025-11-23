// server.js

// 1) Imports
const express = require('express');
const cors = require('cors');
const multer = require('multer');

// If you are using nodemailer for emails, uncomment these lines
// const nodemailer = require('nodemailer');
// require('dotenv').config();

// 2) Create app
const app = express();

// 3) Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4) Multer setup for file uploads (photos)
const upload = multer({
  storage: multer.memoryStorage(), // keep files in memory (good for emailing / forwarding)
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
    files: 10,                  // max 10 images
  },
});

// 5) Test route (optional – can help debug on Render)
app.get('/', (req, res) => {
  res.send('96Kickz Sell-To-Us backend is running.');
});

// 6) Main POST route for the Sell To Us form
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

    console.log('REQ BODY:', req.body);
    console.log('FILES COUNT:', Array.isArray(req.files) ? req.files.length : 0);

    customer_name = (customer_name || '').toString().trim();
    customer_phone = (customer_phone || '').toString().trim();
    customer_email = (customer_email || '').toString().trim();
    customer_instagram = (customer_instagram || '').toString().trim();
    payment_methods = (payment_methods || '').toString().trim();

    let pairs = [];
    try {
      if (pairs_json) {
        pairs = JSON.parse(pairs_json);
      }
    } catch (e) {
      console.error('❌ Failed to parse pairs_json', e);
    }

    console.log('Parsed pairs:', pairs);

    // TODO: put your email / storage logic here.
    // For now we just log and return success so you can verify it's wired up.

    return res.json({
      success: true,
      message: 'Form received by backend.',
      data: {
        customer_name,
        customer_phone,
        customer_email,
        customer_instagram,
        payment_methods,
        pairs_count: pairs.length,
        files_count: Array.isArray(req.files) ? req.files.length : 0,
      },
    });
  } catch (err) {
    console.error('💥 Error in /api/submit handler:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error handling form submission',
    });
  }
});

// 7) Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
