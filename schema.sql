-- ============================================
-- AI PLATFORM SUDAN - Database Schema
-- PostgreSQL
-- ============================================

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  password_hash VARCHAR(255) NOT NULL,
  plan VARCHAR(20) DEFAULT 'free',       -- free | basic | pro | ultra
  tokens INTEGER DEFAULT 20,             -- remaining messages
  plan_expires_at TIMESTAMP,
  is_admin BOOLEAN DEFAULT false,
  avatar_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Conversations
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) DEFAULT 'محادثة جديدة',
  model VARCHAR(20) NOT NULL,            -- claude | gpt | gemini
  total_tokens INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,             -- user | assistant | system
  content TEXT NOT NULL,
  model VARCHAR(20),
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Payments
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  plan_id VARCHAR(20) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  bank_name VARCHAR(50) NOT NULL,
  transaction_id VARCHAR(100) NOT NULL,
  receipt_image_url VARCHAR(500),
  status VARCHAR(20) DEFAULT 'pending',  -- pending | approved | rejected
  admin_note TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Usage logs (for analytics + abuse prevention)
CREATE TABLE usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  model VARCHAR(20),
  tokens_used INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_usage_logs_user ON usage_logs(user_id, created_at);

-- ============================================
-- PLANS REFERENCE
-- ============================================
-- free:  20 tokens/day (reset daily)
-- basic: 500 tokens/month - 5,000 SDG
-- pro:   1500 tokens/month - 12,000 SDG
-- ultra: 5000 tokens/month - 25,000 SDG
