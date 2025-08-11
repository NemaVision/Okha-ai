-- Okha.ai Complete CRM and Audit System Database Schema
-- Tracks leads from initial audit through $2,497 client conversion

-- Main leads table - stores all prospect information
CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    
    -- Contact Information
    business_name TEXT NOT NULL,
    website_url TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    
    -- Business Details
    business_type TEXT NOT NULL,
    monthly_visitors TEXT,
    main_goal TEXT NOT NULL,
    current_problem TEXT,
    
    -- Location Data
    city TEXT,
    state TEXT,
    country TEXT DEFAULT 'USA',
    detected_location TEXT,
    
    -- Lead Management
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'converted', 'archived')),
    lead_score INTEGER DEFAULT 0,
    source TEXT DEFAULT 'audit_form',
    
    -- Audit Results
    audit_completed BOOLEAN DEFAULT FALSE,
    health_score INTEGER,
    critical_issues INTEGER DEFAULT 0,
    high_issues INTEGER DEFAULT 0,
    medium_issues INTEGER DEFAULT 0,
    revenue_potential_min INTEGER,
    revenue_potential_max INTEGER,
    
    -- Engagement Tracking
    report_downloaded BOOLEAN DEFAULT FALSE,
    report_download_count INTEGER DEFAULT 0,
    emails_opened INTEGER DEFAULT 0,
    links_clicked INTEGER DEFAULT 0,
    last_engagement_date DATETIME,
    
    -- File Paths
    report_file_path TEXT,
    backup_file_path TEXT,
    
    -- Timeline
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    audit_completed_at DATETIME,
    converted_at DATETIME,
    last_contact_date DATETIME
);

-- Audit results table - detailed technical findings
CREATE TABLE IF NOT EXISTS audit_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    
    -- Performance Metrics
    desktop_speed_score INTEGER,
    mobile_speed_score INTEGER,
    desktop_load_time REAL,
    mobile_load_time REAL,
    largest_contentful_paint REAL,
    cumulative_layout_shift REAL,
    first_input_delay REAL,
    
    -- Mobile Usability
    mobile_friendly BOOLEAN,
    text_size_issues BOOLEAN DEFAULT FALSE,
    tap_targets_issues BOOLEAN DEFAULT FALSE,
    viewport_issues BOOLEAN DEFAULT FALSE,
    
    -- SEO Issues
    missing_title BOOLEAN DEFAULT FALSE,
    missing_meta_description BOOLEAN DEFAULT FALSE,
    duplicate_titles BOOLEAN DEFAULT FALSE,
    h1_issues BOOLEAN DEFAULT FALSE,
    missing_alt_tags INTEGER DEFAULT 0,
    
    -- Local SEO
    google_my_business_claimed BOOLEAN,
    nap_consistency_score INTEGER,
    local_keywords_found INTEGER DEFAULT 0,
    local_citations_found INTEGER DEFAULT 0,
    
    -- Conversion Issues
    phone_visible BOOLEAN DEFAULT FALSE,
    contact_form_present BOOLEAN DEFAULT FALSE,
    cta_buttons_count INTEGER DEFAULT 0,
    contact_info_accessible BOOLEAN DEFAULT FALSE,
    
    -- Technical Issues
    ssl_certificate BOOLEAN DEFAULT TRUE,
    broken_links_count INTEGER DEFAULT 0,
    missing_structured_data BOOLEAN DEFAULT FALSE,
    
    -- Raw Data Storage
    lighthouse_data TEXT, -- JSON storage
    pagespeed_data TEXT,   -- JSON storage
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads (id)
);

-- Interaction history - tracks all touchpoints
CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    
    -- Interaction Details
    type TEXT NOT NULL CHECK (type IN ('email_sent', 'email_opened', 'email_clicked', 'report_downloaded', 'phone_call', 'meeting_scheduled', 'note_added', 'status_changed')),
    description TEXT,
    details TEXT, -- JSON for additional data
    
    -- Email Tracking
    email_subject TEXT,
    email_campaign TEXT,
    click_url TEXT,
    
    -- User/Admin who performed action
    performed_by TEXT DEFAULT 'system',
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads (id)
);

-- Notes table - admin notes and observations
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    
    note_text TEXT NOT NULL,
    note_type TEXT DEFAULT 'general' CHECK (note_type IN ('general', 'call', 'email', 'meeting', 'followup')),
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    
    created_by TEXT DEFAULT 'admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (lead_id) REFERENCES leads (id)
);

-- Email campaigns and templates
CREATE TABLE IF NOT EXISTS email_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    template_name TEXT UNIQUE NOT NULL,
    subject_line TEXT NOT NULL,
    email_body TEXT NOT NULL,
    template_type TEXT NOT NULL CHECK (template_type IN ('welcome', 'report_delivery', 'follow_up_1', 'follow_up_2', 'follow_up_3', 'consultation_offer', 'custom')),
    
    -- Personalization fields available
    personalization_fields TEXT, -- JSON array
    
    active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Email queue for automated sending
CREATE TABLE IF NOT EXISTS email_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    template_id INTEGER NOT NULL,
    
    recipient_email TEXT NOT NULL,
    subject_line TEXT NOT NULL,
    email_body TEXT NOT NULL,
    
    -- Scheduling
    scheduled_for DATETIME NOT NULL,
    sent_at DATETIME,
    
    -- Status tracking
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
    error_message TEXT,
    
    -- Tracking
    opened_at DATETIME,
    clicked_at DATETIME,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads (id),
    FOREIGN KEY (template_id) REFERENCES email_templates (id)
);

-- System settings and configuration
CREATE TABLE IF NOT EXISTS system_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_key TEXT UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    setting_type TEXT DEFAULT 'string' CHECK (setting_type IN ('string', 'integer', 'boolean', 'json')),
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Admin users for dashboard access
CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin' CHECK (role IN ('admin', 'manager', 'viewer')),
    active BOOLEAN DEFAULT TRUE,
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_business_type ON leads(business_type);
CREATE INDEX IF NOT EXISTS idx_interactions_lead_id ON interactions(lead_id);
CREATE INDEX IF NOT EXISTS idx_interactions_type ON interactions(type);
CREATE INDEX IF NOT EXISTS idx_interactions_created_at ON interactions(created_at);
CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_scheduled ON email_queue(scheduled_for);

-- Insert default email templates
INSERT OR IGNORE INTO email_templates (template_name, subject_line, email_body, template_type) VALUES 
('welcome_report', 'Your Website Audit Results Are Ready - {{business_name}}', 
'Hi {{first_name}},

Thank you for requesting a website audit for {{business_name}}. I''ve completed a comprehensive analysis of {{website_url}} and have some important findings to share.

Your Website Health Score: {{health_score}}/100

I found {{critical_issues}} critical issues that are likely costing you customers every day, plus {{high_issues}} high-priority problems that should be addressed soon.

Based on my analysis, fixing these issues could potentially bring you {{revenue_potential_min}}-{{revenue_potential_max}} in additional monthly revenue.

You can download your complete audit report here: [DOWNLOAD LINK]

The report includes:
- Detailed problem identification with screenshots
- Step-by-step solutions for each issue
- Revenue impact analysis
- Implementation timeline

I''ve helped hundreds of {{business_type}} businesses just like yours get more customers online. If you''d like help implementing these improvements, I offer a complete done-for-you service for $2,497.

Best regards,
The Okha.ai Team', 'report_delivery'),

('follow_up_1', 'Did you get a chance to review your audit? - {{business_name}}', 
'Hi {{first_name}},

I wanted to follow up on the website audit I sent for {{business_name}} a few days ago.

The report identified {{critical_issues}} critical issues that are likely costing you customers right now. Based on the problems I found, you could be missing out on {{revenue_potential_min}}-{{revenue_potential_max}} in additional monthly revenue.

If you haven''t had a chance to download the report yet, you can get it here: [DOWNLOAD LINK]

Many {{business_type}} business owners are surprised by what they discover in their audit. The good news is that every issue I found can be fixed.

If you''d like help implementing these improvements, I''d be happy to discuss how my done-for-you service could help you start getting more customers within 30-60 days.

Would you be interested in a brief call to discuss your specific situation?

Best regards,
The Okha.ai Team', 'follow_up_1');

-- Insert default system settings
INSERT OR IGNORE INTO system_settings (setting_key, setting_value, setting_type, description) VALUES 
('reports_directory', '/reports', 'string', 'Base directory for storing audit reports'),
('max_audit_time_minutes', '5', 'integer', 'Maximum time allowed for audit completion'),
('default_lead_score', '50', 'integer', 'Default lead score for new prospects'),
('email_from_address', 'audit@okha.ai', 'string', 'Default from email address'),
('email_from_name', 'Okha.ai Team', 'string', 'Default from name for emails'),
('google_pagespeed_api_key', '', 'string', 'Google PageSpeed Insights API key'),
('smtp_host', '', 'string', 'SMTP server for sending emails'),
('smtp_port', '587', 'integer', 'SMTP port'),
('smtp_username', '', 'string', 'SMTP username'),
('smtp_password', '', 'string', 'SMTP password'),
('dashboard_refresh_interval', '30', 'integer', 'Dashboard auto-refresh interval in seconds');