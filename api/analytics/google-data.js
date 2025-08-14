// Vercel Function to fetch Google Analytics data for admin dashboard
import { kv } from '@vercel/kv'

// Simple authentication for analytics data
function authenticateAdmin(req) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false
  }
  
  const credentials = Buffer.from(authHeader.substring(6), 'base64').toString()
  const [username, password] = credentials.split(':')
  
  return username === 'admin' && password === (process.env.ADMIN_PASSWORD || 'okha2024admin')
}

// Calculate website performance metrics from our audit data
async function getWebsitePerformanceMetrics() {
  try {
    // Get all audit results from the last 30 days
    const auditKeys = await kv.keys('audit_*')
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    
    const auditResults = await Promise.all(
      auditKeys.map(async (key) => {
        const audit = await kv.get(key)
        if (audit && new Date(audit.timestamp) > last30Days) {
          return audit
        }
        return null
      })
    ).then(results => results.filter(Boolean))

    // Calculate average performance metrics
    const totalAudits = auditResults.length
    if (totalAudits === 0) {
      return {
        averageHealthScore: 0,
        averageLoadTime: 0,
        mobileScoreAvg: 0,
        seoScoreAvg: 0,
        conversionScoreAvg: 0,
        totalAudits: 0
      }
    }

    const avgHealthScore = auditResults.reduce((sum, audit) => sum + (audit.healthScore || 0), 0) / totalAudits
    const avgLoadTime = auditResults.reduce((sum, audit) => sum + (audit.performance?.mobile?.loadTime || 0), 0) / totalAudits
    const avgMobileScore = auditResults.reduce((sum, audit) => sum + (audit.mobile?.score || 0), 0) / totalAudits
    const avgSeoScore = auditResults.reduce((sum, audit) => sum + (audit.seo?.score || 0), 0) / totalAudits
    const avgConversionScore = auditResults.reduce((sum, audit) => sum + (audit.conversion?.score || 0), 0) / totalAudits

    // Analyze trends
    const businessTypeBreakdown = {}
    const issueFrequency = {
      critical: {},
      high: {},
      medium: {}
    }

    auditResults.forEach(audit => {
      // Business type analysis
      const bizType = audit.businessType || 'unknown'
      businessTypeBreakdown[bizType] = (businessTypeBreakdown[bizType] || 0) + 1

      // Issue frequency analysis
      Object.keys(issueFrequency).forEach(severity => {
        if (audit.issues && audit.issues[severity]) {
          audit.issues[severity].forEach(issue => {
            const title = issue.title || 'Unknown Issue'
            issueFrequency[severity][title] = (issueFrequency[severity][title] || 0) + 1
          })
        }
      })
    })

    return {
      averageHealthScore: Math.round(avgHealthScore),
      averageLoadTime: Math.round(avgLoadTime * 10) / 10,
      mobileScoreAvg: Math.round(avgMobileScore),
      seoScoreAvg: Math.round(avgSeoScore),
      conversionScoreAvg: Math.round(avgConversionScore),
      totalAudits,
      businessTypeBreakdown,
      issueFrequency,
      trends: {
        improvementOpportunities: calculateImprovementOpportunities(auditResults),
        revenueImpact: calculateRevenueImpact(auditResults)
      }
    }
  } catch (error) {
    console.error('Error calculating website metrics:', error)
    return null
  }
}

function calculateImprovementOpportunities(auditResults) {
  const opportunities = {
    speed: 0,
    mobile: 0,
    seo: 0,
    conversion: 0
  }

  auditResults.forEach(audit => {
    if (audit.performance?.mobile?.score < 70) opportunities.speed++
    if (audit.mobile?.score < 70) opportunities.mobile++
    if (audit.seo?.score < 70) opportunities.seo++
    if (audit.conversion?.score < 70) opportunities.conversion++
  })

  return opportunities
}

function calculateRevenueImpact(auditResults) {
  let totalPotentialRevenue = 0
  
  auditResults.forEach(audit => {
    if (audit.revenueProjection) {
      const avgProjection = (audit.revenueProjection.min + audit.revenueProjection.max) / 2
      totalPotentialRevenue += avgProjection
    }
  })

  return Math.round(totalPotentialRevenue)
}

// Get lead conversion analytics
async function getLeadConversionMetrics() {
  try {
    const leadKeys = await kv.keys('lead_*')
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    
    const leads = await Promise.all(
      leadKeys.map(async (key) => {
        const lead = await kv.get(key)
        if (lead && new Date(lead.timestamp) > last30Days) {
          return lead
        }
        return null
      })
    ).then(results => results.filter(Boolean))

    const totalLeads = leads.length
    const completedAudits = leads.filter(lead => lead.status === 'audit_completed').length
    const emailsSent = leads.filter(lead => lead.emailSent).length
    
    // Calculate conversion funnel
    const conversionFunnel = {
      formSubmissions: totalLeads,
      auditsCompleted: completedAudits,
      emailsDelivered: emailsSent,
      conversionRate: totalLeads > 0 ? Math.round((emailsSent / totalLeads) * 100) : 0
    }

    // Business type performance
    const businessTypePerformance = {}
    leads.forEach(lead => {
      const bizType = lead.businessType || 'unknown'
      if (!businessTypePerformance[bizType]) {
        businessTypePerformance[bizType] = {
          total: 0,
          completed: 0,
          emailsSent: 0
        }
      }
      businessTypePerformance[bizType].total++
      if (lead.status === 'audit_completed') businessTypePerformance[bizType].completed++
      if (lead.emailSent) businessTypePerformance[bizType].emailsSent++
    })

    // Calculate conversion rates for each business type
    Object.keys(businessTypePerformance).forEach(bizType => {
      const data = businessTypePerformance[bizType]
      data.conversionRate = data.total > 0 ? Math.round((data.emailsSent / data.total) * 100) : 0
    })

    return {
      conversionFunnel,
      businessTypePerformance,
      totalLeads,
      revenueMetrics: {
        projectedRevenue: calculateProjectedRevenue(leads),
        averageLeadValue: calculateAverageLeadValue(leads)
      }
    }
  } catch (error) {
    console.error('Error calculating conversion metrics:', error)
    return null
  }
}

function calculateProjectedRevenue(leads) {
  const completedLeads = leads.filter(lead => lead.emailSent)
  return completedLeads.length * 2497 // Average project value
}

function calculateAverageLeadValue(leads) {
  const businessTypeValues = {
    'restaurant': 2000,
    'healthcare': 5000,
    'professional-services': 3500,
    'home-services': 3000,
    'automotive': 2500,
    'retail': 1500,
    'other': 2497
  }

  const totalValue = leads.reduce((sum, lead) => {
    const value = businessTypeValues[lead.businessType] || businessTypeValues['other']
    return sum + value
  }, 0)

  return leads.length > 0 ? Math.round(totalValue / leads.length) : 0
}

// Mock Google Analytics data (in production, you'd use the GA4 API)
function getMockGoogleAnalyticsData() {
  // This would be replaced with actual GA4 API calls
  // For now, providing realistic mock data
  return {
    pageViews: {
      total: 2847,
      unique: 1923,
      last30Days: [
        { date: '2024-01-15', views: 45, uniqueViews: 32 },
        { date: '2024-01-16', views: 52, uniqueViews: 38 },
        { date: '2024-01-17', views: 38, uniqueViews: 29 },
        // ... more daily data
      ]
    },
    topPages: [
      { page: '/', views: 1245, conversionRate: 3.2 },
      { page: '/how-it-works.html', views: 456, conversionRate: 2.1 },
      { page: '/pricing.html', views: 389, conversionRate: 4.8 },
      { page: '/sample-report.html', views: 287, conversionRate: 5.1 }
    ],
    trafficSources: {
      organic: 45.2,
      direct: 32.1,
      referral: 12.4,
      social: 6.8,
      email: 3.5
    },
    conversionEvents: {
      formStarts: 234,
      formSubmissions: 87,
      conversionRate: 37.2
    },
    audienceInsights: {
      avgSessionDuration: 185, // seconds
      bounceRate: 42.3,
      pagesPerSession: 2.8,
      newVsReturning: {
        new: 78.5,
        returning: 21.5
      }
    }
  }
}

export default async function handler(req, res) {
  // Check authentication
  if (!authenticateAdmin(req)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Analytics Dashboard"')
    return res.status(401).json({ error: 'Authentication required' })
  }

  if (req.method === 'GET') {
    try {
      const { dataType } = req.query

      if (dataType === 'website-performance') {
        const performanceMetrics = await getWebsitePerformanceMetrics()
        return res.status(200).json({
          success: true,
          data: performanceMetrics,
          timestamp: new Date().toISOString()
        })
      }

      if (dataType === 'conversion-metrics') {
        const conversionMetrics = await getLeadConversionMetrics()
        return res.status(200).json({
          success: true,
          data: conversionMetrics,
          timestamp: new Date().toISOString()
        })
      }

      if (dataType === 'google-analytics') {
        // In production, this would fetch real GA4 data
        const analyticsData = getMockGoogleAnalyticsData()
        return res.status(200).json({
          success: true,
          data: analyticsData,
          timestamp: new Date().toISOString(),
          note: 'Mock data - replace with GA4 API integration'
        })
      }

      // Return all analytics data
      const [performanceMetrics, conversionMetrics, analyticsData] = await Promise.all([
        getWebsitePerformanceMetrics(),
        getLeadConversionMetrics(),
        Promise.resolve(getMockGoogleAnalyticsData())
      ])

      return res.status(200).json({
        success: true,
        data: {
          websitePerformance: performanceMetrics,
          conversionMetrics: conversionMetrics,
          googleAnalytics: analyticsData
        },
        timestamp: new Date().toISOString()
      })

    } catch (error) {
      console.error('Analytics data error:', error)
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to load analytics data' 
      })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}