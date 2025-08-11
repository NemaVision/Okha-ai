const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');

// Move lead between workflow folders
router.post('/lead/:id/move', async (req, res) => {
    try {
        const db = req.app.locals.db || require('../database/connection');
        const { id } = req.params;
        const { from_status, to_status, notes } = req.body;
        
        const validStatuses = ['pending', 'active', 'converted', 'archived'];
        if (!validStatuses.includes(to_status)) {
            return res.status(400).json({ error: 'Invalid target status' });
        }

        // Get current lead data
        const leadData = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM leads WHERE uuid = ? OR id = ?', [id, id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!leadData) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        // Move report file if exists
        if (leadData.report_file_path) {
            const oldPath = leadData.report_file_path;
            const fileName = path.basename(oldPath);
            
            const statusFolders = {
                'pending': 'pending-leads',
                'active': 'active-prospects', 
                'converted': 'converted-clients',
                'archived': 'archive'
            };
            
            const newPath = path.join(
                path.dirname(path.dirname(oldPath)), 
                statusFolders[to_status], 
                fileName
            );
            
            try {
                await fs.ensureDir(path.dirname(newPath));
                if (await fs.pathExists(oldPath)) {
                    await fs.move(oldPath, newPath);
                    
                    // Update file path in database
                    await new Promise((resolve, reject) => {
                        db.run('UPDATE leads SET report_file_path = ? WHERE id = ?', [newPath, leadData.id], (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                }
            } catch (fileError) {
                console.warn('Failed to move report file:', fileError);
            }
        }

        // Update lead status
        await new Promise((resolve, reject) => {
            const updateFields = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
            const params = [to_status];
            
            if (to_status === 'converted' && from_status !== 'converted') {
                updateFields.push('converted_at = CURRENT_TIMESTAMP');
            }
            
            params.push(leadData.id);
            
            db.run(`UPDATE leads SET ${updateFields.join(', ')} WHERE id = ?`, params, function(err) {
                if (err) reject(err);
                else resolve();
            });
        });

        // Log interaction
        await new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO interactions (lead_id, type, description, performed_by, created_at)
                VALUES (?, 'status_changed', ?, 'admin', CURRENT_TIMESTAMP)
            `, [leadData.id, `Moved from ${from_status} to ${to_status}`], function(err) {
                if (err) reject(err);
                else resolve();
            });
        });

        // Add note if provided
        if (notes) {
            await new Promise((resolve, reject) => {
                db.run(`
                    INSERT INTO notes (lead_id, note_text, note_type, created_by, created_at)
                    VALUES (?, ?, 'general', 'admin', CURRENT_TIMESTAMP)
                `, [leadData.id, notes], function(err) {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }

        res.json({ 
            success: true, 
            message: `Lead moved to ${to_status}`,
            new_file_path: leadData.report_file_path 
        });

    } catch (error) {
        console.error('Move lead error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Download/regenerate report
router.get('/lead/:id/report', async (req, res) => {
    try {
        const db = req.app.locals.db || require('../database/connection');
        const { id } = req.params;
        const { regenerate = false } = req.query;

        const leadData = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM leads WHERE uuid = ? OR id = ?', [id, id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!leadData) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        let reportPath = leadData.report_file_path;

        // Regenerate report if requested or if file doesn't exist
        if (regenerate || !reportPath || !await fs.pathExists(reportPath)) {
            console.log(`Regenerating report for lead ${leadData.id}`);
            
            // Get audit results
            const auditResults = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM audit_results WHERE lead_id = ?', [leadData.id], (err, row) => {
                    if (err) reject(err);
                    else {
                        if (row && row.lighthouse_data) {
                            row.lighthouse_data = JSON.parse(row.lighthouse_data);
                        }
                        resolve(row);
                    }
                });
            });

            if (auditResults) {
                const ReportGenerator = require('../services/ReportGenerator');
                const reportGenerator = new ReportGenerator(db);
                
                reportPath = await reportGenerator.generateReport(leadData.id, {
                    businessName: leadData.business_name,
                    website: leadData.website_url,
                    firstName: leadData.first_name,
                    lastName: leadData.last_name,
                    email: leadData.email,
                    businessType: leadData.business_type
                }, auditResults);

                // Update file path in database
                await new Promise((resolve, reject) => {
                    db.run('UPDATE leads SET report_file_path = ? WHERE id = ?', [reportPath, leadData.id], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            }
        }

        if (!reportPath || !await fs.pathExists(reportPath)) {
            return res.status(404).json({ error: 'Report not found' });
        }

        // Log download
        await new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO interactions (lead_id, type, description, performed_by, created_at)
                VALUES (?, 'report_downloaded', 'Report downloaded by admin', 'admin', CURRENT_TIMESTAMP)
            `, [leadData.id], function(err) {
                if (err) reject(err);
                else resolve();
            });
        });

        // Send file
        res.download(reportPath, `${leadData.business_name}-Website-Audit.pdf`);

    } catch (error) {
        console.error('Download report error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Send custom email
router.post('/lead/:id/email', async (req, res) => {
    try {
        const db = req.app.locals.db || require('../database/connection');
        const { id } = req.params;
        const { subject, message, schedule_for } = req.body;

        if (!subject || !message) {
            return res.status(400).json({ error: 'Subject and message are required' });
        }

        const leadData = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM leads WHERE uuid = ? OR id = ?', [id, id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!leadData) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        const EmailService = require('../services/EmailService');
        const emailService = new EmailService(db);

        if (schedule_for) {
            // Schedule email for later
            await emailService.queueEmail(
                leadData.id,
                null, // No template ID for custom emails
                leadData.email,
                subject,
                message,
                schedule_for
            );

            res.json({ success: true, message: 'Email scheduled successfully' });
        } else {
            // Send immediately
            const mailOptions = {
                from: `${await emailService.getSetting('email_from_name')} <${await emailService.getSetting('email_from_address')}>`,
                to: leadData.email,
                subject: subject,
                html: emailService.convertTextToHTML(message)
            };

            if (emailService.transporter) {
                const result = await emailService.transporter.sendMail(mailOptions);
                
                // Log interaction
                await emailService.logInteraction(leadData.id, 'email_sent', 'Custom email sent by admin', {
                    subject: subject,
                    message_id: result.messageId
                });

                res.json({ success: true, message: 'Email sent successfully' });
            } else {
                res.status(500).json({ error: 'Email service not configured' });
            }
        }

    } catch (error) {
        console.error('Send email error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Schedule follow-up reminder
router.post('/lead/:id/reminder', async (req, res) => {
    try {
        const db = req.app.locals.db || require('../database/connection');
        const { id } = req.params;
        const { reminder_date, reminder_text, priority = 'normal' } = req.body;

        if (!reminder_date || !reminder_text) {
            return res.status(400).json({ error: 'Reminder date and text are required' });
        }

        const leadData = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM leads WHERE uuid = ? OR id = ?', [id, id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!leadData) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        // Add reminder as a high-priority note
        const noteId = await new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO notes (lead_id, note_text, note_type, priority, created_by, created_at)
                VALUES (?, ?, 'followup', ?, 'admin', CURRENT_TIMESTAMP)
            `, [leadData.id, `REMINDER (${moment(reminder_date).format('MMM D, YYYY')}): ${reminder_text}`, priority], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });

        // Log interaction
        await new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO interactions (lead_id, type, description, performed_by, created_at)
                VALUES (?, 'note_added', ?, 'admin', CURRENT_TIMESTAMP)
            `, [leadData.id, `Follow-up reminder set for ${moment(reminder_date).format('MMM D, YYYY')}`], function(err) {
                if (err) reject(err);
                else resolve();
            });
        });

        res.json({ success: true, note_id: noteId });

    } catch (error) {
        console.error('Schedule reminder error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Export data
router.get('/export/:format', async (req, res) => {
    try {
        const db = req.app.locals.db || require('../database/connection');
        const { format } = req.params;
        const { status, date_range, include_audit_data = false } = req.query;

        if (!['csv', 'json'].includes(format)) {
            return res.status(400).json({ error: 'Format must be csv or json' });
        }

        // Build query
        let whereClause = 'WHERE 1=1';
        let params = [];

        if (status) {
            whereClause += ' AND l.status = ?';
            params.push(status);
        }

        if (date_range) {
            const [startDate, endDate] = date_range.split(',');
            whereClause += ' AND l.created_at BETWEEN ? AND ?';
            params.push(startDate, endDate);
        }

        const query = include_audit_data ? `
            SELECT 
                l.*,
                ar.desktop_speed_score,
                ar.mobile_speed_score,
                ar.mobile_friendly,
                ar.missing_title,
                ar.missing_meta_description,
                ar.phone_visible,
                ar.contact_form_present
            FROM leads l
            LEFT JOIN audit_results ar ON l.id = ar.lead_id
            ${whereClause}
            ORDER BY l.created_at DESC
        ` : `
            SELECT * FROM leads l
            ${whereClause}
            ORDER BY l.created_at DESC
        `;

        const data = await new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        if (format === 'csv') {
            if (data.length === 0) {
                return res.status(404).json({ error: 'No data to export' });
            }

            // Convert to CSV
            const headers = Object.keys(data[0]).join(',');
            const csvRows = data.map(row => 
                Object.values(row).map(value => 
                    typeof value === 'string' && value.includes(',') ? `"${value}"` : value
                ).join(',')
            );
            
            const csv = [headers, ...csvRows].join('\n');
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=leads-export-${moment().format('YYYY-MM-DD')}.csv`);
            res.send(csv);
        } else {
            // JSON format
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename=leads-export-${moment().format('YYYY-MM-DD')}.json`);
            res.json({
                exported_at: new Date().toISOString(),
                total_records: data.length,
                filters_applied: { status, date_range, include_audit_data },
                data: data
            });
        }

    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: error.message });
    }
});

// System settings management
router.get('/settings', async (req, res) => {
    try {
        const db = req.app.locals.db || require('../database/connection');
        
        const settings = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM system_settings ORDER BY setting_key', (err, rows) => {
                if (err) reject(err);
                else resolve(rows.reduce((acc, row) => {
                    acc[row.setting_key] = {
                        value: row.setting_value,
                        type: row.setting_type,
                        description: row.description
                    };
                    return acc;
                }, {}));
            });
        });

        res.json({ settings });

    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.put('/settings', async (req, res) => {
    try {
        const db = req.app.locals.db || require('../database/connection');
        const { settings } = req.body;

        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({ error: 'Settings object required' });
        }

        // Update each setting
        for (const [key, value] of Object.entries(settings)) {
            await new Promise((resolve, reject) => {
                db.run(`
                    UPDATE system_settings 
                    SET setting_value = ?, updated_at = CURRENT_TIMESTAMP 
                    WHERE setting_key = ?
                `, [value, key], function(err) {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }

        res.json({ success: true, message: 'Settings updated successfully' });

    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

// System statistics
router.get('/stats', async (req, res) => {
    try {
        const db = req.app.locals.db || require('../database/connection');
        
        const stats = await Promise.all([
            // Total leads by status
            new Promise((resolve, reject) => {
                db.all(`
                    SELECT status, COUNT(*) as count
                    FROM leads 
                    GROUP BY status
                `, (err, rows) => {
                    if (err) reject(err);
                    else resolve({ leads_by_status: rows });
                });
            }),

            // Audit completion rate
            new Promise((resolve, reject) => {
                db.get(`
                    SELECT 
                        COUNT(*) as total,
                        COUNT(CASE WHEN audit_completed = 1 THEN 1 END) as completed,
                        ROUND(COUNT(CASE WHEN audit_completed = 1 THEN 1 END) * 100.0 / COUNT(*), 1) as completion_rate
                    FROM leads
                `, (err, row) => {
                    if (err) reject(err);
                    else resolve({ audit_stats: row });
                });
            }),

            // Email performance
            new Promise((resolve, reject) => {
                db.get(`
                    SELECT 
                        COUNT(*) as emails_sent,
                        COUNT(opened_at) as emails_opened,
                        COUNT(clicked_at) as emails_clicked,
                        ROUND(COUNT(opened_at) * 100.0 / COUNT(*), 1) as open_rate,
                        ROUND(COUNT(clicked_at) * 100.0 / COUNT(*), 1) as click_rate
                    FROM email_queue 
                    WHERE status = 'sent'
                `, (err, row) => {
                    if (err) reject(err);
                    else resolve({ email_stats: row });
                });
            }),

            // Recent activity count
            new Promise((resolve, reject) => {
                db.get(`
                    SELECT COUNT(*) as recent_interactions
                    FROM interactions 
                    WHERE created_at >= datetime('now', '-24 hours')
                `, (err, row) => {
                    if (err) reject(err);
                    else resolve({ recent_activity: row });
                });
            })
        ]);

        // Combine all stats
        const combinedStats = stats.reduce((acc, stat) => ({ ...acc, ...stat }), {});
        
        res.json({
            ...combinedStats,
            system_uptime: process.uptime(),
            last_updated: new Date().toISOString()
        });

    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;