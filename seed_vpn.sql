-- ثبت سرور آلمان
INSERT INTO servers (code, name, ip_address, protocol_default, is_active, sort_order)
VALUES ('49', 'سرور آلمان (VIP)', '192.168.1.50', 'udp', 1, 1);

-- ثبت دو پلن پرفروش
INSERT INTO plans (id, plan_code, name, name_en, quota_gb, duration_days, price_amount, is_active)
VALUES 
('plan_20gb_1m', '20GB_30D', 'اشتراک ۲۰ گیگابایت - ۱ ماهه', '20GB - 1 Month', 20, 30, 150000, 1),
('plan_50gb_1m', '50GB_30D', 'اشتراک ۵۰ گیگابایت - ۱ ماهه', '50GB - 1 Month', 50, 30, 280000, 1);