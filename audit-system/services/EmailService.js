const nodemailer = require('nodemailer');
const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');

class EmailService {
    constructor(database) {
        this.db = database;
        this.transporter = null;
        this.initializeTransporter();
    }

    async initializeTransporter() {
        try {
            // Get SMTP settings from database
            const settings = await this.getSystemSettings();
            
            if (settings.smtp_host && settings.smtp_username && settings.smtp_password) {
                this.transporter = nodemailer.createTransporter({
                    host: settings.smtp_host,
                    port: parseInt(settings.smtp_port) || 587,
                    secure: parseInt(settings.smtp_port) === 465,
                    auth: {
                        user: settings.smtp_username,
                        pass: settings.smtp_password
                    }
                });

                // Verify connection
                await this.transporter.verify();
                console.log('✓ Email service initialized successfully');
            } else {
                console.warn('⚠ Email service not configured - missing SMTP settings');
            }
        } catch (error) {
            console.error('Email service initialization failed:', error.message);
        }
    }

    async sendReportEmail(leadId, leadData, reportPath) {
        console.log(`Sending report email to ${leadData.email}`);
        
        try {
            if (!this.transporter) {
                throw new Error('Email service not configured');
            }

            // Get email template
            const template = await this.getEmailTemplate('report_delivery');
            if (!template) {
                throw new Error('Report delivery template not found');
            }

            // Get audit data for personalization
            const auditData = await this.getAuditData(leadId);
            
            // Personalize email content
            const personalizedSubject = this.personalizeContent(template.subject_line, leadData, auditData);
            const personalizedBody = this.personalizeContent(template.email_body, leadData, auditData);

            // Prepare email
            const mailOptions = {
                from: `${await this.getSetting('email_from_name')} <${await this.getSetting('email_from_address')}>`,
                to: leadData.email,
                subject: personalizedSubject,
                html: this.convertTextToHTML(personalizedBody),
                attachments: [{
                    filename: `${leadData.businessName}-Website-Audit.pdf`,
                    path: reportPath
                }]
            };

            // Send email
            const result = await this.transporter.sendMail(mailOptions);
            
            // Log interaction
            await this.logInteraction(leadId, 'email_sent', 'Report delivery email sent', {
                template_id: template.id,
                subject: personalizedSubject,
                message_id: result.messageId
            });

            console.log(`✓ Report email sent to ${leadData.email}`);
            return result;

        } catch (error) {
            console.error(`Failed to send report email to ${leadData.email}:`, error);
            
            // Log failed attempt
            await this.logInteraction(leadId, 'note_added', `Email sending failed: ${error.message}`, {
                error: error.message
            });
            
            throw error;
        }
    }

    async scheduleFollowUpSequence(leadId) {
        console.log(`Scheduling follow-up sequence for lead ${leadId}`);
        
        try {
            const followUpTemplates = [
                { template: 'follow_up_1', delay_hours: 72 },   // 3 days
                { template: 'follow_up_2', delay_hours: 168 },  // 7 days  
                { template: 'follow_up_3', delay_hours: 336 }   // 14 days
            ];

            for (const followUp of followUpTemplates) {
                const template = await this.getEmailTemplate(followUp.template);
                if (!template) continue;

                const scheduledFor = moment().add(followUp.delay_hours, 'hours').toISOString();
                
                // Get lead data
                const leadData = await this.getLeadData(leadId);
                const auditData = await this.getAuditData(leadId);
                
                // Personalize content
                const personalizedSubject = this.personalizeContent(template.subject_line, leadData, auditData);
                const personalizedBody = this.personalizeContent(template.email_body, leadData, auditData);

                // Add to email queue
                await this.queueEmail(leadId, template.id, leadData.email, personalizedSubject, personalizedBody, scheduledFor);
            }

            console.log(`✓ Follow-up sequence scheduled for lead ${leadId}`);

        } catch (error) {
            console.error(`Failed to schedule follow-up sequence for lead ${leadId}:`, error);
        }
    }

    async processScheduledEmails() {
        console.log('Processing scheduled emails...');
        
        try {
            const pendingEmails = await this.getPendingEmails();
            
            for (const email of pendingEmails) {
                try {
                    await this.sendScheduledEmail(email);
                } catch (error) {
                    console.error(`Failed to send scheduled email ${email.id}:`, error);
                    
                    // Mark email as failed
                    await this.markEmailFailed(email.id, error.message);
                }
            }

            if (pendingEmails.length > 0) {
                console.log(`✓ Processed ${pendingEmails.length} scheduled emails`);
            }

        } catch (error) {
            console.error('Error processing scheduled emails:', error);
        }
    }

    async sendScheduledEmail(emailData) {
        if (!this.transporter) {
            throw new Error('Email service not configured');
        }

        const mailOptions = {
            from: `${await this.getSetting('email_from_name')} <${await this.getSetting('email_from_address')}>`,
            to: emailData.recipient_email,
            subject: emailData.subject_line,
            html: this.convertTextToHTML(emailData.email_body)
        };

        const result = await this.transporter.sendMail(mailOptions);
        
        // Mark email as sent
        await this.markEmailSent(emailData.id, result.messageId);
        
        // Log interaction
        await this.logInteraction(emailData.lead_id, 'email_sent', 'Follow-up email sent', {
            template_id: emailData.template_id,
            subject: emailData.subject_line,
            message_id: result.messageId
        });

        return result;
    }

    async trackEmailOpen(leadId, emailId) {
        try {
            // Update email queue record
            await new Promise((resolve, reject) => {
                this.db.run(
                    'UPDATE email_queue SET opened_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [emailId],
                    function(err) {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            // Update lead engagement
            await new Promise((resolve, reject) => {
                this.db.run(`
                    UPDATE leads 
                    SET emails_opened = emails_opened + 1, 
                        last_engagement_date = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [leadId], function(err) {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Log interaction
            await this.logInteraction(leadId, 'email_opened', 'Email opened');

        } catch (error) {
            console.error('Error tracking email open:', error);
        }
    }

    async trackEmailClick(leadId, emailId, clickUrl) {
        try {
            // Update email queue record
            await new Promise((resolve, reject) => {
                this.db.run(
                    'UPDATE email_queue SET clicked_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [emailId],
                    function(err) {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            // Update lead engagement
            await new Promise((resolve, reject) => {
                this.db.run(`
                    UPDATE leads 
                    SET links_clicked = links_clicked + 1, 
                        last_engagement_date = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [leadId], function(err) {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Log interaction
            await this.logInteraction(leadId, 'email_clicked', 'Email link clicked', {
                click_url: clickUrl
            });

        } catch (error) {
            console.error('Error tracking email click:', error);
        }
    }

    async trackReportDownload(leadId) {
        try {
            // Update lead record
            await new Promise((resolve, reject) => {
                this.db.run(`
                    UPDATE leads 
                    SET report_downloaded = TRUE,
                        report_download_count = report_download_count + 1,
                        last_engagement_date = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [leadId], function(err) {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Log interaction
            await this.logInteraction(leadId, 'report_downloaded', 'Audit report downloaded');

        } catch (error) {
            console.error('Error tracking report download:', error);
        }
    }

    personalizeContent(content, leadData, auditData = {}) {
        const personalizations = {
            '{{business_name}}': leadData.businessName || '',
            '{{website_url}}': leadData.website || '',
            '{{first_name}}': leadData.firstName || '',
            '{{last_name}}': leadData.lastName || '',
            '{{business_type}}': this.formatBusinessType(leadData.businessType) || '',
            '{{health_score}}': auditData.health_score || 'N/A',
            '{{critical_issues}}': auditData.critical_issues || 0,
            '{{high_issues}}': auditData.high_issues || 0,
            '{{revenue_potential_min}}': auditData.revenue_potential_min ? `$${auditData.revenue_potential_min.toLocaleString()}` : '$0',
            '{{revenue_potential_max}}': auditData.revenue_potential_max ? `$${auditData.revenue_potential_max.toLocaleString()}` : '$0'
        };

        let personalizedContent = content;
        
        Object.keys(personalizations).forEach(placeholder => {
            const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            personalizedContent = personalizedContent.replace(regex, personalizations[placeholder]);
        });

        return personalizedContent;
    }

    convertTextToHTML(text) {
        // Convert plain text to HTML with basic formatting
        return text
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>')
            .replace(/^/, '<p>')
            .replace(/$/, '</p>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>');
    }

    formatBusinessType(businessType) {
        const types = {
            'restaurant': 'restaurant',
            'retail': 'retail store',
            'professional-services': 'professional service',
            'healthcare': 'healthcare practice',
            'home-services': 'home service',
            'beauty-wellness': 'beauty/wellness',
            'fitness': 'fitness',
            'real-estate': 'real estate',
            'automotive': 'automotive',
            'education': 'education',
            'nonprofit': 'non-profit'
        };
        
        return types[businessType] || 'business';
    }

    // Database helper methods
    async getSystemSettings() {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT setting_key, setting_value FROM system_settings', (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const settings = {};
                    rows.forEach(row => {
                        settings[row.setting_key] = row.setting_value;
                    });
                    resolve(settings);
                }
            });
        });
    }

    async getSetting(key) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT setting_value FROM system_settings WHERE setting_key = ?', [key], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row ? row.setting_value : null);
                }
            });
        });
    }

    async getEmailTemplate(templateName) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM email_templates WHERE template_name = ? AND active = TRUE', [templateName], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async getLeadData(leadId) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM leads WHERE id = ?', [leadId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async getAuditData(leadId) {
        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT l.health_score, l.revenue_potential_min, l.revenue_potential_max,
                       ar.critical_issues, ar.high_issues
                FROM leads l
                LEFT JOIN audit_results ar ON l.id = ar.lead_id
                WHERE l.id = ?
            `, [leadId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row || {});
                }
            });
        });
    }

    async queueEmail(leadId, templateId, recipientEmail, subject, body, scheduledFor) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO email_queue (
                    lead_id, template_id, recipient_email, subject_line, email_body, 
                    scheduled_for, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
            `);
            
            stmt.run([leadId, templateId, recipientEmail, subject, body, scheduledFor], function(err) {
                stmt.finalize();
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    }

    async getPendingEmails() {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT * FROM email_queue 
                WHERE status = 'pending' 
                AND datetime(scheduled_for) <= datetime('now')
                ORDER BY scheduled_for ASC
                LIMIT 50
            `, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async markEmailSent(emailId, messageId) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                UPDATE email_queue 
                SET status = 'sent', sent_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `, [emailId], function(err) {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    async markEmailFailed(emailId, errorMessage) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                UPDATE email_queue 
                SET status = 'failed', error_message = ? 
                WHERE id = ?
            `, [errorMessage, emailId], function(err) {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    async logInteraction(leadId, type, description, details = {}) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO interactions (
                    lead_id, type, description, details, performed_by, created_at
                ) VALUES (?, ?, ?, ?, 'system', CURRENT_TIMESTAMP)
            `);
            
            stmt.run([leadId, type, description, JSON.stringify(details)], function(err) {
                stmt.finalize();
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    }
}

module.exports = EmailService;