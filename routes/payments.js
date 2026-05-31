// routes/payments.js
import express from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';

const router = express.Router();

// Plan config
const PLANS = {
  basic: { tokens: 500, durationDays: 30, price: 5000 },
  pro: { tokens: 1500, durationDays: 30, price: 12000 },
  ultra: { tokens: 5000, durationDays: 30, price: 25000 },
};

// ============================================
// USER: Submit payment request
// ============================================
router.post('/submit', authenticate, async (req, res) => {
  try {
    const { plan_id, amount, bank_name, transaction_id, receipt_image } = req.body;
    const userId = req.user.id;

    // Validate plan
    const plan = PLANS[plan_id];
    if (!plan) return res.status(400).json({ error: 'باقة غير صحيحة' });

    // Check for duplicate transaction_id
    const existing = await pool.query(
      'SELECT id FROM payments WHERE transaction_id = $1',
      [transaction_id]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'رقم العملية مستخدم مسبقاً' });
    }

    // Handle receipt image (save to storage in production)
    let receiptUrl = null;
    if (receipt_image) {
      // TODO: Upload to Supabase Storage / S3
      // receiptUrl = await uploadImage(receipt_image);
      receiptUrl = 'receipt_placeholder';
    }

    const result = await pool.query(
      `INSERT INTO payments 
       (user_id, plan_id, amount, bank_name, transaction_id, receipt_image_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [userId, plan_id, amount, bank_name, transaction_id, receiptUrl]
    );

    // TODO: Send notification to admin (Firebase FCM / Email)
    await notifyAdmin(result.rows[0]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ============================================
// USER: Get my payments
// ============================================
router.get('/my', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.name as user_name 
       FROM payments p JOIN users u ON p.user_id = u.id
       WHERE p.user_id = $1 ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ============================================
// ADMIN: Get all payments
// ============================================
router.get('/admin', authenticate, requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const query = status
      ? `SELECT p.*, u.name as user_name, u.email
         FROM payments p JOIN users u ON p.user_id = u.id
         WHERE p.status = $1 ORDER BY p.created_at DESC`
      : `SELECT p.*, u.name as user_name, u.email
         FROM payments p JOIN users u ON p.user_id = u.id
         ORDER BY p.created_at DESC`;

    const result = await pool.query(query, status ? [status] : []);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// ============================================
// ADMIN: Review payment (approve/reject)
// ============================================
router.post('/admin/:id/review', authenticate, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { approved, note } = req.body;
    const paymentId = req.params.id;

    // Get payment details
    const paymentResult = await client.query(
      'SELECT * FROM payments WHERE id = $1 AND status = $2',
      [paymentId, 'pending']
    );

    if (paymentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'الطلب غير موجود أو تم معالجته' });
    }

    const payment = paymentResult.rows[0];
    const newStatus = approved ? 'approved' : 'rejected';

    // Update payment status
    await client.query(
      `UPDATE payments SET 
       status = $1, admin_note = $2, reviewed_by = $3, reviewed_at = NOW()
       WHERE id = $4`,
      [newStatus, note, req.user.id, paymentId]
    );

    // If approved: activate subscription + add tokens
    if (approved) {
      const plan = PLANS[payment.plan_id];
      if (plan) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + plan.durationDays);

        await client.query(
          `UPDATE users SET 
           plan = $1, 
           tokens = tokens + $2,
           plan_expires_at = $3,
           updated_at = NOW()
           WHERE id = $4`,
          [payment.plan_id, plan.tokens, expiresAt, payment.user_id]
        );
      }
    }

    await client.query('COMMIT');

    // TODO: Send push notification to user
    await notifyUser(payment.user_id, approved, payment.plan_id);

    res.json({ success: true, status: newStatus });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'خطأ في الخادم' });
  } finally {
    client.release();
  }
});

// ============================================
// Notification helpers
// ============================================
async function notifyAdmin(payment) {
  // TODO: Implement FCM push or email
  console.log(`📢 New payment from user ${payment.user_id}: ${payment.amount} SDG`);
}

async function notifyUser(userId, approved, planId) {
  const msg = approved
    ? `✅ تم تفعيل باقة ${planId} بنجاح! استمتع بالخدمة.`
    : `❌ تم رفض طلب الدفع. تواصل مع الدعم.`;
  console.log(`📨 Notify user ${userId}: ${msg}`);
  // TODO: FCM push notification
}

export default router;
