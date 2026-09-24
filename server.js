const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(cors());

// تنظیمات دیتابیس
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'private_app'
});

db.connect(err => {
    if (err) console.error('❌ خطا در اتصال به دیتابیس:', err);
    else console.log('✅ اتصال به دیتابیس برقرار شد.');
});

// حافظه موقت برای ذخیره کدهای ورود (OTP)
const otpStore = {};

// توکن ربات بله خود را اینجا قرار دهید
const BALE_BOT_TOKEN = '2066004760:VxFoPF7EDOfiabeuGlHsRPImUvjY8rEZ3lQ'; 

// ۱. درخواست ارسال کد تایید به بله
app.post('/api/send-otp', (req, res) => {
    const { phone } = req.body;

    if (!phone) {
        return res.status(400).json({ success: false, message: 'شماره موبایل را وارد کنید.' });
    }

    // بررسی وجود شماره در لیست سفید
    const query = 'SELECT * FROM allowed_users WHERE phone = ?';
    db.query(query, [phone], async (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'خطای سرور' });

        if (results.length === 0) {
            return res.status(403).json({ 
                success: false, 
                message: 'دسترسی محدود است! شماره شما در لیست کاربران مجاز ثبت نشده است.' 
            });
        }

        const user = results[0];
        // تولید کد ۶ رقمی
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        otpStore[phone] = otpCode;

        // تعیین شناسه دریافت‌کننده در بله (Chat ID یا شماره تلفن)
        const recipient = user.bale_chat_id || phone;

        try {
            // ارسال پیام حاوی کد تایید از طریق API ربات بله
            await axios.post(`https://tapi.bale.ai/bot${BALE_BOT_TOKEN}/sendMessage`, {
                chat_id: recipient,
                text: `🔒 کد تایید ورود به پیام‌رسان اختصاصی:\n\n🔑 ${otpCode}\n\nاین کد را به هیچ‌کس ندهید.`
            });

            res.json({ success: true, message: 'کد تایید با موفقیت به پیام‌رسان بله ارسال شد.' });
        } catch (error) {
            console.error('خطا در ارسال به بله:', error.response?.data || error.message);
            
            // نمایش کد در کنسول جهت حالت تست و توسعه
            console.log(`\n[کد تست محلی] کد ورود برای ${phone}: ${otpCode}\n`);

            res.json({ 
                success: true, 
                message: 'کد تایید صادر شد (در محیط تست، کد در کنسول سرور نمایش داده شده است).' 
            });
        }
    });
});

// ۲. تایید کد و ورود کاربر
app.post('/api/verify-otp', (req, res) => {
    const { phone, code } = req.body;

    if (otpStore[phone] && otpStore[phone] === code) {
        delete otpStore[phone]; // انقضای کد پس از ورود موفق

        const query = 'SELECT * FROM allowed_users WHERE phone = ?';
        db.query(query, [phone], (err, results) => {
            if (err) return res.status(500).json({ success: false, message: 'خطای سرور' });
            res.json({ success: true, user: results[0] });
        });
    } else {
        res.status(400).json({ success: false, message: 'کد وارد شده اشتباه یا منقضی شده است.' });
    }
});

// ۳. دریافت لیست پیام‌ها
app.get('/api/messages', (req, res) => {
    const query = `
        SELECT messages.*, allowed_users.full_name 
        FROM messages 
        JOIN allowed_users ON messages.sender_phone = allowed_users.phone 
        ORDER BY created_at ASC
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'خطا در دریافت پیام‌ها' });
        res.json(results);
    });
});

// ۴. ارسال پیام جدید
app.post('/api/messages', (req, res) => {
    const { sender_phone, message } = req.body;

    if (!message || !message.trim()) {
        return res.status(400).json({ success: false, message: 'متن پیام نمی‌تواند خالی باشد.' });
    }

    const query = 'INSERT INTO messages (sender_phone, message) VALUES (?, ?)';
    db.query(query, [sender_phone, message], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'خطا در ثبت پیام' });
        res.json({ success: true, id: result.insertId });
    });
});

app.listen(3000, () => {
    console.log('🚀 سرور روی پورت 3000 اجرا شد.');
});