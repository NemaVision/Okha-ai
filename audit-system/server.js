const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
require('dotenv').config();

// Import custom modules
const AuditEngine = require('./services/AuditEngine');
const ReportGenerator = require('./services/ReportGenerator');
const EmailService = require('./services/EmailService');
const CRMDashboard = require('./routes/dashboard');
const AdminRoutes = require('./routes/admin');
const LeadRoutes = require('./routes/leads');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/reports', express.static('reports'));

// Database setup
const dbPath = path.join(__dirname, 'database', 'okha_crm.db');
const db = new sqlite3.Database(dbPath);

// Initialize database schema
const initDatabase = () => {
    const schema = fs.readFileSync(path.join(__dirname, 'database', 'schema.sql'), 'utf8');
    db.exec(schema, (err) => {
        if (err) {
            console.error('Error initializing database:', err);
        } else {
            console.log('✓ Database initialized successfully');
        }
    });
};

// Create necessary directories
const createDirectories = async () => {
    const directories = [
        'reports/pending-leads',
        'reports/active-prospects',
        'reports/converted-clients',
        'reports/archive',
        'public/assets',
        'logs'
    ];
    
    for (const dir of directories) {
        await fs.ensureDir(path.join(__dirname, dir));
    }
    console.log('✓ Directory structure created');
};

// API Routes

// Handle audit form submissions from okha.ai
app.post('/api/audit/submit', async (req, res) => {
    try {
        const {
            businessName,
            website,
            firstName,
            lastName,
            email,
            phone,
            businessType,
            mainGoal,
            currentProblem,
            monthlyVisitors
        } = req.body;

        // Validate required fields
        if (!businessName || !website || !firstName || !lastName || !email || !businessType || !mainGoal) {
            return res.status(400).json({ 
                error: 'Missing required fields',
                required: ['businessName', 'website', 'firstName', 'lastName', 'email', 'businessType', 'mainGoal']
            });
        }

        // Generate unique ID for this lead
        const leadUuid = uuidv4();
        
        // Insert lead into database
        const leadId = await new Promise((resolve, reject) => {
            const stmt = db.prepare(`
                INSERT INTO leads (
                    uuid, business_name, website_url, first_name, last_name, email, phone,
                    business_type, main_goal, current_problem, monthly_visitors,
                    status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
            `);
            
            stmt.run([
                leadUuid, businessName, website, firstName, lastName, email, phone,
                businessType, mainGoal, currentProblem, monthlyVisitors
            ], function(err) {
                stmt.finalize();
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });

        // Start automated audit process
        console.log(`Starting audit for ${businessName} (ID: ${leadId})`);
        
        // Run audit in background
        processAuditBackground(leadId, leadUuid, {
            businessName,
            website,
            firstName,
            lastName,
            email,
            businessType
        });

        res.json({
            success: true,
            message: 'Audit started successfully',
            leadId: leadUuid,
            estimatedTime: '2-3 minutes'
        });

    } catch (error) {
        console.error('Error submitting audit:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Background audit processing
const processAuditBackground = async (leadId, leadUuid, leadData) => {
    try {
        console.log(`Processing audit for lead ${leadId}`);
        
        // Initialize audit engine
        const auditEngine = new AuditEngine(db);
        
        // Run comprehensive audit
        const auditResults = await auditEngine.runFullAudit(leadData.website, leadData.businessType);
        
        // Calculate health score and revenue potential
        const healthScore = auditEngine.calculateHealthScore(auditResults);
        const revenueProjection = auditEngine.calculateRevenueProjection(auditResults, leadData.businessType);
        
        // Save audit results to database
        await saveAuditResults(leadId, auditResults, healthScore, revenueProjection);
        
        // Generate professional PDF report
        const reportGenerator = new ReportGenerator(db);
        const reportPath = await reportGenerator.generateReport(leadId, leadData, auditResults);
        
        // Update lead with completion status and file path
        await updateLeadAuditComplete(leadId, healthScore, revenueProjection, reportPath);
        
        // Send automated email with report
        const emailService = new EmailService(db);
        await emailService.sendReportEmail(leadId, leadData, reportPath);
        
        // Schedule follow-up emails
        await emailService.scheduleFollowUpSequence(leadId);
        
        console.log(`✓ Audit completed for ${leadData.businessName}`);
        
    } catch (error) {
        console.error(`Error processing audit for lead ${leadId}:`, error);
        
        // Mark audit as failed
        db.run('UPDATE leads SET audit_completed = FALSE WHERE id = ?', [leadId]);
        
        // Log the error
        db.run(`
            INSERT INTO interactions (lead_id, type, description, performed_by) 
            VALUES (?, 'note_added', ?, 'system')
        `, [leadId, `Audit failed: ${error.message}`]);
    }
};

// Save audit results to database
const saveAuditResults = async (leadId, results, healthScore, revenueProjection) => {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`
            INSERT INTO audit_results (
                lead_id, desktop_speed_score, mobile_speed_score, desktop_load_time, mobile_load_time,
                mobile_friendly, missing_title, missing_meta_description, h1_issues,
                phone_visible, contact_form_present, google_my_business_claimed,
                lighthouse_data, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
        
        stmt.run([
            leadId,
            results.performance?.desktop?.score || 0,
            results.performance?.mobile?.score || 0,
            results.performance?.desktop?.loadTime || 0,
            results.performance?.mobile?.loadTime || 0,
            results.mobile?.friendly || false,
            results.seo?.missingTitle || false,
            results.seo?.missingMetaDescription || false,
            results.seo?.h1Issues || false,
            results.conversion?.phoneVisible || false,
            results.conversion?.contactFormPresent || false,
            results.local?.gmb?.claimed || false,
            JSON.stringify(results)
        ], function(err) {
            stmt.finalize();
            if (err) reject(err);
            else resolve();
        });
    });
};

// Update lead with audit completion
const updateLeadAuditComplete = async (leadId, healthScore, revenueProjection, reportPath) => {
    return new Promise((resolve, reject) => {
        db.run(`
            UPDATE leads 
            SET audit_completed = TRUE, 
                health_score = ?, 
                revenue_potential_min = ?, 
                revenue_potential_max = ?,
                report_file_path = ?,
                audit_completed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            healthScore, 
            revenueProjection.min, 
            revenueProjection.max,
            reportPath,
            leadId
        ], function(err) {
            if (err) reject(err);
            else resolve();
        });
    });
};

// Dashboard and admin routes
app.use('/api/dashboard', CRMDashboard);
app.use('/api/admin', AdminRoutes);
app.use('/api/leads', LeadRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Serve admin dashboard
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API status endpoint
app.get('/api/status', async (req, res) => {
    try {
        // Get system statistics
        const stats = await getSystemStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const getSystemStats = async () => {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT 
                status,
                COUNT(*) as count
            FROM leads 
            GROUP BY status
        `, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                const stats = {
                    total_leads: 0,
                    pending: 0,
                    active: 0,
                    converted: 0,
                    archived: 0
                };
                
                rows.forEach(row => {
                    stats[row.status] = row.count;
                    stats.total_leads += row.count;
                });
                
                resolve(stats);
            }
        });
    });
};

// Automated tasks
// Run every hour to process scheduled emails
cron.schedule('0 * * * *', async () => {
    console.log('Running scheduled email processor...');
    const emailService = new EmailService(db);
    await emailService.processScheduledEmails();
});

// Run daily cleanup tasks
cron.schedule('0 2 * * *', async () => {
    console.log('Running daily maintenance tasks...');
    // Add cleanup tasks here
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Initialize and start server
const startServer = async () => {
    try {
        await createDirectories();
        initDatabase();
        
        app.listen(PORT, () => {
            console.log('🚀 Okha.ai Audit System Started');
            console.log(`📊 Admin Dashboard: http://localhost:${PORT}/admin`);
            console.log(`🔌 API Health Check: http://localhost:${PORT}/api/health`);
            console.log(`📈 System Status: http://localhost:${PORT}/api/status`);
            console.log('');
            console.log('✓ Automated audit engine ready');
            console.log('✓ CRM dashboard active');
            console.log('✓ Email automation enabled');
            console.log('✓ Report generation system online');
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
        } else {
            console.log('Database connection closed.');
        }
        process.exit(0);
    });
});