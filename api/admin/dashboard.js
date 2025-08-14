// Vercel Function for admin dashboard
import { kv } from '@vercel/kv'

// Simple authentication (in production, use proper auth)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'okha2024admin'

function authenticateAdmin(req) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false
  }
  
  const credentials = Buffer.from(authHeader.substring(6), 'base64').toString()
  const [username, password] = credentials.split(':')
  
  return username === 'admin' && password === ADMIN_PASSWORD
}

export default async function handler(req, res) {
  // Check authentication
  if (!authenticateAdmin(req)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Dashboard"')
    return res.status(401).json({ error: 'Authentication required' })
  }

  if (req.method === 'GET') {
    try {
      // Get dashboard data
      const [pendingLeads, allLeadIds] = await Promise.all([
        kv.lrange('leads:pending', 0, -1),
        kv.keys('lead_*')
      ])

      // Get recent leads (last 50)
      const recentLeadIds = allLeadIds
        .sort((a, b) => {
          const timeA = parseInt(a.split('_')[1]) || 0
          const timeB = parseInt(b.split('_')[1]) || 0
          return timeB - timeA
        })
        .slice(0, 50)

      const leads = await Promise.all(
        recentLeadIds.map(async (leadId) => {
          const leadData = await kv.get(leadId)
          return leadData ? { id: leadId, ...leadData } : null
        })
      ).then(results => results.filter(Boolean))

      // Calculate stats
      const now = new Date()
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const last7days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

      const last24hLeads = leads.filter(lead => 
        new Date(lead.timestamp) > last24h
      ).length

      const last7daysLeads = leads.filter(lead => 
        new Date(lead.timestamp) > last7days
      ).length

      const completedAudits = leads.filter(lead => 
        lead.status === 'audit_completed'
      ).length

      const emailsSent = leads.filter(lead => 
        lead.emailSent
      ).length

      const stats = {
        totalLeads: leads.length,
        pendingLeads: pendingLeads.length,
        completedAudits,
        emailsSent,
        last24hLeads,
        last7daysLeads,
        conversionRate: leads.length > 0 ? Math.round((emailsSent / leads.length) * 100) : 0
      }

      // Business type breakdown
      const businessTypes = {}
      leads.forEach(lead => {
        const type = lead.businessType || 'unknown'
        businessTypes[type] = (businessTypes[type] || 0) + 1
      })

      return res.status(200).json({
        success: true,
        stats,
        businessTypes,
        leads: leads.slice(0, 20), // Return first 20 for display
        timestamp: new Date().toISOString()
      })

    } catch (error) {
      console.error('Dashboard data error:', error)
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to load dashboard data' 
      })
    }
  }

  if (req.method === 'POST') {
    try {
      const { action, leadId } = req.body

      if (action === 'resend_email' && leadId) {
        const leadData = await kv.get(leadId)
        if (!leadData) {
          return res.status(404).json({ error: 'Lead not found' })
        }

        if (leadData.auditId) {
          // Queue email for resending
          await kv.lpush('email:queue', JSON.stringify({
            type: 'audit_completed',
            leadId,
            auditId: leadData.auditId,
            timestamp: new Date().toISOString(),
            resend: true
          }))

          return res.status(200).json({ 
            success: true, 
            message: 'Email queued for resending' 
          })
        } else {
          return res.status(400).json({ 
            error: 'Audit not completed for this lead' 
          })
        }
      }

      if (action === 'rerun_audit' && leadId) {
        const leadData = await kv.get(leadId)
        if (!leadData) {
          return res.status(404).json({ error: 'Lead not found' })
        }

        // Queue audit for reprocessing
        await kv.lpush('audit:queue', JSON.stringify({
          leadId,
          websiteUrl: leadData.website,
          businessType: leadData.businessType,
          timestamp: new Date().toISOString(),
          rerun: true
        }))

        return res.status(200).json({ 
          success: true, 
          message: 'Audit queued for reprocessing' 
        })
      }

      return res.status(400).json({ error: 'Invalid action' })

    } catch (error) {
      console.error('Dashboard action error:', error)
      return res.status(500).json({ 
        success: false, 
        error: 'Action failed' 
      })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}