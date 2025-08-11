const express = require('express');
const router = express.Router();
const moment = require('moment');

// Get dashboard overview statistics
router.get('/overview', async (req, res) => {
    try {
        const db = req.app.locals.db || require('../database/connection');
        
        // Get lead counts by status
        const statusCounts = await new Promise((resolve, reject) => {
            db.all(`
                SELECT status, COUNT(*) as count
                FROM leads 
                GROUP BY status
            `, (err, rows) => {
                if (err) reject(err);
                else {
                    const counts = { pending: 0, active: 0, converted: 0, archived: 0 };
                    rows.forEach(row => counts[row.status] = row.count);
                    resolve(counts);
                }
            });
        });

        // Get conversion rates
        const totalLeads = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);
        const conversionRates = {
            audit_to_consultation: totalLeads > 0 ? Math.round((statusCounts.active / totalLeads) * 100) : 0,
            consultation_to_client: statusCounts.active > 0 ? Math.round((statusCounts.converted / statusCounts.active) * 100) : 0
        };

        // Get revenue tracking
        const revenueData = await new Promise((resolve, reject) => {
            db.get(`
                SELECT 
                    COUNT(*) as converted_count,
                    AVG(revenue_potential_max) as avg_deal_size,
                    SUM(CASE WHEN converted_at >= date('now', '-30 days') THEN revenue_potential_max ELSE 0 END) as monthly_revenue
                FROM leads 
                WHERE status = 'converted'
            `, (err, row) => {
                if (err) reject(err);
                else resolve({
                    monthly_totals: row.monthly_revenue || 0,
                    average_deal_size: Math.round(row.avg_deal_size || 2497),
                    projected_revenue: (statusCounts.active * 2497) // Active prospects * average deal
                });
            });
        });

        // Get recent activity
        const recentActivity = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    i.type,
                    i.description,
                    i.created_at,
                    l.business_name,
                    l.first_name,
                    l.last_name
                FROM interactions i
                JOIN leads l ON i.lead_id = l.id
                ORDER BY i.created_at DESC
                LIMIT 10
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(row => ({
                    type: row.type,
                    description: row.description,
                    business_name: row.business_name,
                    contact_name: `${row.first_name} ${row.last_name}`,
                    timestamp: moment(row.created_at).fromNow()
                })));
            });
        });

        res.json({
            lead_counts: statusCounts,
            conversion_rates: conversionRates,
            revenue_tracking: revenueData,
            recent_activity: recentActivity
        });

    } catch (error) {
        console.error('Dashboard overview error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get leads by status with filtering and pagination
router.get('/leads/:status', async (req, res) => {
    try {
        const db = req.app.locals.db || require('../database/connection');
        const { status } = req.params;
        const { page = 1, limit = 20, industry, location, date_range, search } = req.query;
        
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        // Build query with filters
        let whereClause = 'WHERE l.status = ?';
        let params = [status];
        
        if (industry) {
            whereClause += ' AND l.business_type = ?';
            params.push(industry);
        }
        
        if (location) {
            whereClause += ' AND (l.city LIKE ? OR l.state LIKE ?)';
            params.push(`%${location}%`, `%${location}%`);
        }
        
        if (search) {
            whereClause += ' AND (l.business_name LIKE ? OR l.first_name LIKE ? OR l.last_name LIKE ? OR l.email LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }
        
        if (date_range) {
            const [startDate, endDate] = date_range.split(',');
            whereClause += ' AND l.created_at BETWEEN ? AND ?';
            params.push(startDate, endDate);
        }

        const leads = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    l.*,
                    ar.desktop_speed_score,
                    ar.mobile_speed_score,
                    ar.mobile_friendly
                FROM leads l
                LEFT JOIN audit_results ar ON l.id = ar.lead_id
                ${whereClause}
                ORDER BY l.created_at DESC
                LIMIT ? OFFSET ?
            `, [...params, parseInt(limit), offset], (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(row => ({
                    id: row.id,
                    uuid: row.uuid,
                    business_name: row.business_name,
                    website_url: row.website_url,
                    contact_name: `${row.first_name} ${row.last_name}`,
                    email: row.email,
                    phone: row.phone,
                    business_type: row.business_type,
                    location: row.city && row.state ? `${row.city}, ${row.state}` : 'N/A',
                    health_score: row.health_score,
                    lead_score: row.lead_score,
                    revenue_potential: row.revenue_potential_min && row.revenue_potential_max 
                        ? `$${row.revenue_potential_min.toLocaleString()}-$${row.revenue_potential_max.toLocaleString()}`
                        : 'N/A',
                    audit_completed: row.audit_completed,
                    report_downloaded: row.report_downloaded,
                    emails_opened: row.emails_opened,
                    links_clicked: row.links_clicked,
                    last_engagement: row.last_engagement_date ? moment(row.last_engagement_date).fromNow() : 'Never',
                    created_at: moment(row.created_at).format('MMM D, YYYY'),
                    audit_summary: {
                        desktop_speed: row.desktop_speed_score,
                        mobile_speed: row.mobile_speed_score,
                        mobile_friendly: row.mobile_friendly
                    }
                })));
            });
        });

        // Get total count for pagination
        const totalCount = await new Promise((resolve, reject) => {
            db.get(`
                SELECT COUNT(*) as total
                FROM leads l
                ${whereClause}
            `, params.slice(0, -2), (err, row) => {
                if (err) reject(err);
                else resolve(row.total);
            });
        });

        res.json({
            leads: leads,
            pagination: {
                current_page: parseInt(page),
                total_pages: Math.ceil(totalCount / parseInt(limit)),
                total_count: totalCount,
                per_page: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Get leads error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get individual lead details
router.get('/lead/:id', async (req, res) => {
    try {
        const db = req.app.locals.db || require('../database/connection');
        const { id } = req.params;
        
        // Get lead data
        const leadData = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM leads WHERE uuid = ? OR id = ?', [id, id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!leadData) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        // Get audit results
        const auditResults = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM audit_results WHERE lead_id = ?', [leadData.id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        // Get interaction history
        const interactions = await new Promise((resolve, reject) => {
            db.all(`
                SELECT * FROM interactions 
                WHERE lead_id = ? 
                ORDER BY created_at DESC
            `, [leadData.id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(row => ({
                    ...row,
                    formatted_date: moment(row.created_at).format('MMM D, YYYY h:mm A'),
                    relative_time: moment(row.created_at).fromNow()
                })));
            });
        });

        // Get notes
        const notes = await new Promise((resolve, reject) => {
            db.all(`
                SELECT * FROM notes 
                WHERE lead_id = ? 
                ORDER BY created_at DESC
            `, [leadData.id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(row => ({
                    ...row,
                    formatted_date: moment(row.created_at).format('MMM D, YYYY h:mm A')
                })));
            });
        });

        // Get email queue status
        const emailStatus = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    et.template_name,
                    eq.status,
                    eq.scheduled_for,
                    eq.sent_at,
                    eq.opened_at,
                    eq.clicked_at
                FROM email_queue eq
                JOIN email_templates et ON eq.template_id = et.id
                WHERE eq.lead_id = ?
                ORDER BY eq.scheduled_for ASC
            `, [leadData.id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(row => ({
                    ...row,
                    scheduled_for_formatted: moment(row.scheduled_for).format('MMM D, YYYY h:mm A'),
                    sent_at_formatted: row.sent_at ? moment(row.sent_at).format('MMM D, YYYY h:mm A') : null
                })));
            });
        });

        const response = {
            lead: {
                ...leadData,
                formatted_created_at: moment(leadData.created_at).format('MMM D, YYYY h:mm A'),
                location: leadData.city && leadData.state ? `${leadData.city}, ${leadData.state}` : 'N/A'
            },
            audit_results: auditResults ? {
                ...auditResults,
                lighthouse_data: auditResults.lighthouse_data ? JSON.parse(auditResults.lighthouse_data) : null
            } : null,
            interactions: interactions,
            notes: notes,
            email_status: emailStatus
        };

        res.json(response);

    } catch (error) {
        console.error('Get lead details error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update lead status
router.put('/lead/:id/status', async (req, res) => {
    try {
        const db = req.app.locals.db || require('../database/connection');
        const { id } = req.params;
        const { status, notes } = req.body;
        
        const validStatuses = ['pending', 'active', 'converted', 'archived'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        // Update lead status
        await new Promise((resolve, reject) => {
            const updateFields = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
            const params = [status];
            
            if (status === 'converted') {
                updateFields.push('converted_at = CURRENT_TIMESTAMP');
            }
            
            params.push(id);
            
            db.run(`
                UPDATE leads 
                SET ${updateFields.join(', ')}
                WHERE uuid = ? OR id = ?
            `, [...params, id], function(err) {
                if (err) reject(err);
                else resolve();
            });
        });

        // Log interaction
        await new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO interactions (lead_id, type, description, performed_by, created_at)
                VALUES (
                    (SELECT id FROM leads WHERE uuid = ? OR id = ?), 
                    'status_changed', 
                    ?, 
                    'admin', 
                    CURRENT_TIMESTAMP
                )
            `, [id, id, `Status changed to ${status}`], function(err) {
                if (err) reject(err);
                else resolve();
            });
        });

        // Add note if provided
        if (notes) {
            await new Promise((resolve, reject) => {
                db.run(`
                    INSERT INTO notes (lead_id, note_text, note_type, created_by, created_at)
                    VALUES (
                        (SELECT id FROM leads WHERE uuid = ? OR id = ?), 
                        ?, 
                        'general', 
                        'admin', 
                        CURRENT_TIMESTAMP
                    )
                `, [id, id, notes], function(err) {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }

        res.json({ success: true, message: 'Lead status updated' });

    } catch (error) {
        console.error('Update lead status error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add note to lead
router.post('/lead/:id/note', async (req, res) => {
    try {
        const db = req.app.locals.db || require('../database/connection');
        const { id } = req.params;
        const { note_text, note_type = 'general', priority = 'normal' } = req.body;
        
        if (!note_text) {
            return res.status(400).json({ error: 'Note text is required' });
        }

        const noteId = await new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO notes (lead_id, note_text, note_type, priority, created_by, created_at)
                VALUES (
                    (SELECT id FROM leads WHERE uuid = ? OR id = ?), 
                    ?, ?, ?, 'admin', CURRENT_TIMESTAMP
                )
            `, [id, id, note_text, note_type, priority], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });

        // Log interaction
        await new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO interactions (lead_id, type, description, performed_by, created_at)
                VALUES (
                    (SELECT id FROM leads WHERE uuid = ? OR id = ?), 
                    'note_added', 
                    ?, 
                    'admin', 
                    CURRENT_TIMESTAMP
                )
            `, [id, id, `Note added: ${note_text.substring(0, 50)}...`], function(err) {
                if (err) reject(err);
                else resolve();
            });
        });

        res.json({ success: true, note_id: noteId });

    } catch (error) {
        console.error('Add note error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Search leads
router.get('/search', async (req, res) => {
    try {
        const db = req.app.locals.db || require('../database/connection');
        const { q, filters } = req.query;
        
        if (!q) {
            return res.status(400).json({ error: 'Search query required' });
        }

        let whereClause = `
            WHERE (
                l.business_name LIKE ? OR 
                l.first_name LIKE ? OR 
                l.last_name LIKE ? OR 
                l.email LIKE ? OR 
                l.business_type LIKE ? OR
                l.city LIKE ? OR
                l.state LIKE ?
            )
        `;
        
        const searchTerm = `%${q}%`;
        let params = [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm];
        
        // Parse additional filters
        if (filters) {
            try {
                const filterObj = JSON.parse(filters);
                
                if (filterObj.industry) {
                    whereClause += ' AND l.business_type = ?';
                    params.push(filterObj.industry);
                }
                
                if (filterObj.status) {
                    whereClause += ' AND l.status = ?';
                    params.push(filterObj.status);
                }
                
                if (filterObj.location) {
                    whereClause += ' AND (l.city LIKE ? OR l.state LIKE ?)';
                    params.push(`%${filterObj.location}%`, `%${filterObj.location}%`);
                }
            } catch (e) {
                console.warn('Invalid filters JSON:', e);
            }
        }

        const results = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    l.id,
                    l.uuid,
                    l.business_name,
                    l.first_name,
                    l.last_name,
                    l.email,
                    l.business_type,
                    l.status,
                    l.city,
                    l.state,
                    l.health_score,
                    l.created_at
                FROM leads l
                ${whereClause}
                ORDER BY l.created_at DESC
                LIMIT 50
            `, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(row => ({
                    id: row.uuid,
                    business_name: row.business_name,
                    contact_name: `${row.first_name} ${row.last_name}`,
                    email: row.email,
                    business_type: row.business_type,
                    status: row.status,
                    location: row.city && row.state ? `${row.city}, ${row.state}` : 'N/A',
                    health_score: row.health_score,
                    created_at: moment(row.created_at).format('MMM D, YYYY')
                })));
            });
        });

        res.json({ results: results });

    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get analytics data
router.get('/analytics', async (req, res) => {
    try {
        const db = req.app.locals.db || require('../database/connection');
        const { period = '30d' } = req.query;
        
        // Calculate date range
        let dateFilter = "date('now', '-30 days')";
        if (period === '7d') dateFilter = "date('now', '-7 days')";
        if (period === '90d') dateFilter = "date('now', '-90 days')";
        if (period === '1y') dateFilter = "date('now', '-1 year')";

        // Lead source analysis
        const leadSources = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    business_type,
                    COUNT(*) as leads,
                    COUNT(CASE WHEN status = 'converted' THEN 1 END) as conversions,
                    ROUND(COUNT(CASE WHEN status = 'converted' THEN 1 END) * 100.0 / COUNT(*), 1) as conversion_rate
                FROM leads 
                WHERE created_at >= ${dateFilter}
                GROUP BY business_type
                ORDER BY leads DESC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Geographic performance
        const geographicData = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    COALESCE(state, 'Unknown') as state,
                    COUNT(*) as leads,
                    COUNT(CASE WHEN status = 'converted' THEN 1 END) as conversions,
                    ROUND(AVG(health_score), 1) as avg_health_score
                FROM leads 
                WHERE created_at >= ${dateFilter}
                GROUP BY state
                HAVING COUNT(*) >= 2
                ORDER BY leads DESC
                LIMIT 10
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Time tracking
        const timeTracking = await new Promise((resolve, reject) => {
            db.get(`
                SELECT 
                    ROUND(AVG(CASE 
                        WHEN converted_at IS NOT NULL 
                        THEN (julianday(converted_at) - julianday(created_at))
                        ELSE NULL 
                    END), 1) as avg_conversion_time_days,
                    MIN(CASE 
                        WHEN converted_at IS NOT NULL 
                        THEN (julianday(converted_at) - julianday(created_at))
                        ELSE NULL 
                    END) as fastest_conversion_days,
                    MAX(CASE 
                        WHEN converted_at IS NOT NULL 
                        THEN (julianday(converted_at) - julianday(created_at))
                        ELSE NULL 
                    END) as slowest_conversion_days
                FROM leads 
                WHERE created_at >= ${dateFilter}
                AND status = 'converted'
            `, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        // Email performance
        const emailPerformance = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    et.template_name,
                    COUNT(*) as sent,
                    COUNT(eq.opened_at) as opens,
                    COUNT(eq.clicked_at) as clicks,
                    ROUND(COUNT(eq.opened_at) * 100.0 / COUNT(*), 1) as open_rate,
                    ROUND(COUNT(eq.clicked_at) * 100.0 / COUNT(*), 1) as click_rate
                FROM email_queue eq
                JOIN email_templates et ON eq.template_id = et.id
                WHERE eq.sent_at >= ${dateFilter}
                GROUP BY et.template_name
                ORDER BY sent DESC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.json({
            lead_sources: leadSources,
            geographic_performance: geographicData,
            time_tracking: timeTracking,
            email_performance: emailPerformance
        });

    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;