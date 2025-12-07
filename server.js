// server.js

// 1) Imports
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const nodemailer = require('nodemailer');

// 2) Create app
const app = express();

// 3) Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4) Multer setup for file uploads (photos)
const upload = multer({
  storage: multer.memoryStorage(), // keep files in memory (for emailing)
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
    files: 10, // max 10 images
  },
});

// 5) Nodemailer transporter (using Render env vars)
let transporter = null;

if (
  process.env.SMTP_HOST &&
  process.env.SMTP_PORT &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS
) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false for 587 etc
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  // Verify SMTP on startup so errors show in logs
  transporter.verify((err, success) => {
    if (err) {
      console.error('❌ SMTP verify failed:', err);
    } else {
      console.log('✅ SMTP server is ready to take our messages');
    }
  });
} else {
  console.warn(
    '⚠️ SMTP env vars not fully set. Emails will NOT be sent. ' +
      'Expected SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.',
  );
}

// 6) Test route
app.get('/', (req, res) => {
  res.send('96Kickz Sell-To-Us backend is running.');
});

// 7) Main POST route for Sell To Us form
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
      // NEW FIELDS
      customer_location,
      dropoff_method,
    } = req.body;

    console.log('REQ BODY:', req.body);
    console.log(
      'FILES COUNT:',
      Array.isArray(req.files) ? req.files.length : 0,
    );

    customer_name = (customer_name || '').toString().trim();
    customer_phone = (customer_phone || '').toString().trim();
    customer_email = (customer_email || '').toString().trim();
    customer_instagram = (customer_instagram || '').toString().trim();
    payment_methods = (payment_methods || '').toString().trim();
    // NEW NORMALIZATION
    customer_location = (customer_location || '').toString().trim();
    dropoff_method = (dropoff_method || '').toString().trim();

    let pairs = [];
    try {
      if (pairs_json) {
        pairs = JSON.parse(pairs_json);
      }
    } catch (e) {
      console.error('❌ Failed to parse pairs_json', e);
    }

    console.log('Parsed pairs:', pairs);

    // Email config (matches your Render env vars)
    const toEmail =
      process.env.STORE_EMAIL || // you already have this set
      process.env.TO_EMAIL ||
      'buys@96kickz.com';

    const fromEmail =
      process.env.FROM_EMAIL ||
      process.env.SMTP_USER ||
      'no-reply@96kickz.com';

    console.log('📧 Email config:', {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      user: process.env.SMTP_USER,
      toEmail,
      fromEmail,
    });

    // Build HTML table for pairs
    const pairsHtml = pairs
      .map(
        (p) => `
          <tr>
            <td>${p.index || ''}</td>
            <td>${p.brand_model || ''}</td>
            <td>${p.size_us || ''}</td>
            <td>${p.condition || ''}</td>
            <td>${p.desired_price || ''}</td>
            <td>${p.has_box || ''}</td>
            <td>${p.notes || ''}</td>
          </tr>
        `,
      )
      .join('');

    const htmlBody = `
      <h2>New Sell-To-Us Submission</h2>
      <h3>Customer Info</h3>
      <ul>
        <li><strong>Name:</strong> ${customer_name || ''}</li>
        <li><strong>Phone:</strong> ${customer_phone || ''}</li>
        <li><strong>Email:</strong> ${customer_email || ''}</li>
        <li><strong>Instagram:</strong> ${customer_instagram || ''}</li>
        <li><strong>Location:</strong> ${customer_location || ''}</li>
        <li><strong>How they'll get them to us:</strong> ${dropoff_method || ''}</li>
        <li><strong>Payment Methods:</strong> ${payment_methods || ''}</li>
      </ul>

      <h3>Pairs</h3>
      <table border="1" cellspacing="0" cellpadding="4">
        <thead>
          <tr>
            <th>#</th>
            <th>Brand/Model</th>
            <th>Size US</th>
            <th>Condition</th>
            <th>Desired Price</th>
            <th>Box?</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${pairsHtml || '<tr><td colspan="7">No pairs parsed</td></tr>'}
        </tbody>
      </table>
    `;

    const textBody = `
New Sell-To-Us Submission

Customer:
- Name: ${customer_name || ''}
- Phone: ${customer_phone || ''}
- Email: ${customer_email || ''}
- Instagram: ${customer_instagram || ''}
- Location: ${customer_location || ''}
- How they'll get them to us: ${dropoff_method || ''}
- Payment methods: ${payment_methods || ''}

Pairs:
${pairs
  .map(
    (p) =>
      `#${p.index || ''} - ${p.brand_model || ''}, Size ${
        p.size_us || ''
      }, Condition: ${p.condition || ''}, Price: ${
        p.desired_price || ''
      }, Box: ${p.has_box || ''}, Notes: ${p.notes || ''}`,
  )
  .join('\n')}
    `;

    // Attach photos if any
    const attachments =
      Array.isArray(req.files) && req.files.length > 0
        ? req.files.map((file, i) => ({
            filename: file.originalname || `photo-${i + 1}.jpg`,
            content: file.buffer,
          }))
        : [];

    if (attachments.length) {
      console.log(
        '📎 Preparing attachments:',
        attachments.map((a) => a.filename),
      );
    }

    // Send email(s)
    if (transporter) {
      try {
        const info = await transporter.sendMail({
          from: `"96Kickz Sell To Us" <${fromEmail}>`,
          to: toEmail,
          subject: `New Sell-To-Us form from ${customer_name || 'Customer'}`,
          text: textBody,
          html: htmlBody,
          attachments,
        });
        console.log(
          '✅ Email sent to store:',
          toEmail,
          'MessageID:',
          info.messageId,
        );
      } catch (emailErr) {
        console.error('❌ Failed to send email to store:', emailErr);
      }

      // Optional: confirmation email to customer
      if (customer_email) {
        try {
          const confirmInfo = await transporter.sendMail({
            from: `"96Kickz" <${fromEmail}>`,
            to: customer_email,
            subject: 'We received your Sell-To-Us submission',
            text:
              'Thanks for submitting your pairs to 96Kickz. Our team will review your info and get back to you.',
          });
          console.log(
            '✅ Confirmation email sent to customer:',
            customer_email,
            'MessageID:',
            confirmInfo.messageId,
          );
        } catch (confirmErr) {
          console.error(
            '❌ Failed to send confirmation email:',
            confirmErr,
          );
        }
      }
    } else {
      console.warn('⚠️ Transporter not configured, skipping email send.');
    }

    // Response back to frontend
    return res.json({
      success: true,
      message: 'Form received by backend.',
      data: {
        customer_name,
        customer_phone,
        customer_email,
        customer_instagram,
        customer_location,
        dropoff_method,
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

// 8) Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
