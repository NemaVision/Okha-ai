// Vercel Function to generate and store audit reports using Vercel Blob
import { kv } from '@vercel/kv'
import { put } from '@vercel/blob'

// Generate comprehensive audit report
function generateAuditReportHTML(leadData, auditResults) {
  const { firstName, lastName, businessName, website, businessType } = leadData
  const { healthScore, issues, revenueProjection, performance, mobile, seo, conversion, local } = auditResults

  const getScoreColor = (score) => {
    if (score >= 80) return '#27ae60'
    if (score >= 60) return '#f39c12'
    return '#e74c3c'
  }

  const getScoreGrade = (score) => {
    if (score >= 90) return 'A+'
    if (score >= 80) return 'A'
    if (score >= 70) return 'B'
    if (score >= 60) return 'C'
    if (score >= 50) return 'D'
    return 'F'
  }

  const formatCoreWebVitals = (vitals) => {
    if (!vitals) return '<p>Core Web Vitals data not available</p>'
    
    return `
      <div class="vitals-grid">
        <div class="vital-item">
          <div class="vital-value ${vitals.fcp <= 1800 ? 'good' : vitals.fcp <= 3000 ? 'needs-improvement' : 'poor'}">${vitals.fcp}ms</div>
          <div class="vital-label">First Contentful Paint</div>
        </div>
        <div class="vital-item">
          <div class="vital-value ${vitals.lcp <= 2500 ? 'good' : vitals.lcp <= 4000 ? 'needs-improvement' : 'poor'}">${vitals.lcp}ms</div>
          <div class="vital-label">Largest Contentful Paint</div>
        </div>
        <div class="vital-item">
          <div class="vital-value ${vitals.cls <= 0.1 ? 'good' : vitals.cls <= 0.25 ? 'needs-improvement' : 'poor'}">${vitals.cls}</div>
          <div class="vital-label">Cumulative Layout Shift</div>
        </div>
        <div class="vital-item">
          <div class="vital-value ${vitals.fid <= 100 ? 'good' : vitals.fid <= 300 ? 'needs-improvement' : 'poor'}">${vitals.fid}ms</div>
          <div class="vital-label">First Input Delay</div>
        </div>
      </div>
    `
  }

  const generateIssuesSection = (issueList, severity, title, icon) => {
    if (!issueList || issueList.length === 0) return ''
    
    const severityColors = {
      critical: '#e74c3c',
      high: '#f39c12',
      medium: '#3498db'
    }
    
    return `
      <div class="issues-section">
        <h3 style="color: ${severityColors[severity]}; display: flex; align-items: center; gap: 10px;">
          ${icon} ${title} (${issueList.length})
        </h3>
        ${issueList.map(issue => `
          <div class="issue-card" style="border-left: 4px solid ${severityColors[severity]};">
            <h4>${issue.title}</h4>
            <p class="issue-description">${issue.description}</p>
            <p class="issue-solution"><strong>How to fix:</strong> ${issue.solution}</p>
            <div class="issue-impact">Impact: ${issue.impact}</div>
          </div>
        `).join('')}
      </div>
    `
  }

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Website Audit Report - ${businessName}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
          line-height: 1.6; 
          color: #333;
          background: #f8f9fa;
        }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white; 
          padding: 40px 20px; 
          text-align: center;
          border-radius: 12px;
          margin-bottom: 30px;
        }
        .logo { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
        .report-title { font-size: 28px; margin-bottom: 10px; }
        .report-subtitle { opacity: 0.9; font-size: 16px; }
        
        .score-card {
          background: white;
          padding: 30px;
          border-radius: 12px;
          text-align: center;
          margin-bottom: 30px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        .score-number {
          font-size: 72px;
          font-weight: bold;
          color: ${getScoreColor(healthScore)};
          margin-bottom: 10px;
        }
        .score-grade {
          font-size: 24px;
          color: ${getScoreColor(healthScore)};
          margin-bottom: 15px;
        }
        .score-description { color: #666; font-size: 16px; }
        
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }
        .metric-card {
          background: white;
          padding: 20px;
          border-radius: 12px;
          text-align: center;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .metric-score {
          font-size: 32px;
          font-weight: bold;
          margin-bottom: 5px;
        }
        .metric-label { color: #666; font-size: 14px; }
        
        .vitals-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 15px;
          margin: 20px 0;
        }
        .vital-item {
          background: #f8f9fa;
          padding: 15px;
          border-radius: 8px;
          text-align: center;
        }
        .vital-value {
          font-size: 20px;
          font-weight: bold;
          margin-bottom: 5px;
        }
        .vital-value.good { color: #27ae60; }
        .vital-value.needs-improvement { color: #f39c12; }
        .vital-value.poor { color: #e74c3c; }
        .vital-label { font-size: 12px; color: #666; }
        
        .section {
          background: white;
          padding: 25px;
          border-radius: 12px;
          margin-bottom: 25px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .section h2 {
          color: #2c3e50;
          margin-bottom: 20px;
          font-size: 24px;
          border-bottom: 2px solid #3498db;
          padding-bottom: 10px;
        }
        
        .issues-section { margin-bottom: 25px; }
        .issue-card {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 15px;
        }
        .issue-card h4 { color: #2c3e50; margin-bottom: 10px; }
        .issue-description { margin-bottom: 10px; }
        .issue-solution { 
          background: #e8f5e8;
          padding: 10px;
          border-radius: 6px;
          margin-bottom: 10px;
        }
        .issue-impact {
          font-size: 12px;
          color: #666;
          text-transform: uppercase;
          font-weight: bold;
        }
        
        .revenue-section {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 30px;
          border-radius: 12px;
          text-align: center;
          margin: 30px 0;
        }
        .revenue-amount {
          font-size: 36px;
          font-weight: bold;
          margin: 15px 0;
        }
        
        .cta-section {
          background: #27ae60;
          color: white;
          padding: 30px;
          border-radius: 12px;
          text-align: center;
          margin-top: 30px;
        }
        .cta-button {
          display: inline-block;
          background: white;
          color: #27ae60;
          padding: 15px 30px;
          text-decoration: none;
          border-radius: 8px;
          font-weight: bold;
          margin-top: 15px;
        }
        
        .footer {
          text-align: center;
          color: #666;
          margin-top: 40px;
          padding: 20px;
          border-top: 1px solid #ddd;
        }
        
        @media (max-width: 768px) {
          .metrics-grid { grid-template-columns: 1fr 1fr; }
          .vitals-grid { grid-template-columns: 1fr 1fr; }
          .score-number { font-size: 56px; }
          .container { padding: 15px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">Okha.ai</div>
          <h1 class="report-title">Website Audit Report</h1>
          <p class="report-subtitle">Comprehensive analysis for ${businessName}</p>
          <p style="opacity: 0.8; margin-top: 10px;">${new Date().toLocaleDateString()}</p>
        </div>

        <div class="score-card">
          <div class="score-number">${healthScore}</div>
          <div class="score-grade">Grade: ${getScoreGrade(healthScore)}</div>
          <p class="score-description">
            ${healthScore >= 80 ? 'Excellent! Your website is performing very well.' :
              healthScore >= 60 ? 'Good foundation with room for improvement.' :
              'Significant opportunities to improve your website performance.'}
          </p>
        </div>

        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-score" style="color: ${getScoreColor(performance?.mobile?.score || 50)}">${performance?.mobile?.score || 50}</div>
            <div class="metric-label">Mobile Speed</div>
          </div>
          <div class="metric-card">
            <div class="metric-score" style="color: ${getScoreColor(mobile?.score || 50)}">${mobile?.score || 50}</div>
            <div class="metric-label">Mobile Friendly</div>
          </div>
          <div class="metric-card">
            <div class="metric-score" style="color: ${getScoreColor(seo?.score || 50)}">${seo?.score || 50}</div>
            <div class="metric-label">SEO Score</div>
          </div>
          <div class="metric-card">
            <div class="metric-score" style="color: ${getScoreColor(conversion?.score || 50)}">${conversion?.score || 50}</div>
            <div class="metric-label">Conversion</div>
          </div>
        </div>

        ${performance?.mobile?.coreWebVitals ? `
          <div class="section">
            <h2>🚀 Core Web Vitals</h2>
            <p style="margin-bottom: 20px;">These metrics measure your website's loading performance, interactivity, and visual stability.</p>
            ${formatCoreWebVitals(performance.mobile.coreWebVitals)}
          </div>
        ` : ''}

        <div class="revenue-section">
          <h2 style="margin: 0; color: white;">💰 Revenue Impact</h2>
          <p>Fixing these issues could increase your monthly revenue by:</p>
          <div class="revenue-amount">$${revenueProjection?.min?.toLocaleString()} - $${revenueProjection?.max?.toLocaleString()}</div>
          <p style="opacity: 0.9;">Based on improved conversion rates and customer acquisition</p>
        </div>

        ${generateIssuesSection(issues?.critical, 'critical', '🚨 Critical Issues - Fix These First', '🚨')}
        ${generateIssuesSection(issues?.high, 'high', '⚡ High Priority Issues', '⚡')}
        ${generateIssuesSection(issues?.medium, 'medium', '📝 Medium Priority Issues', '📝')}

        <div class="section">
          <h2>📊 Detailed Analysis</h2>
          
          <h3 style="color: #3498db; margin: 20px 0 10px 0;">Performance Summary</h3>
          <p><strong>Mobile Load Time:</strong> ${performance?.mobile?.loadTime?.toFixed(1) || 'N/A'} seconds</p>
          <p><strong>Desktop Load Time:</strong> ${performance?.desktop?.loadTime?.toFixed(1) || 'N/A'} seconds</p>
          ${performance?.googleInsights ? '<p style="color: #27ae60;"><em>✅ Powered by Google PageSpeed Insights</em></p>' : ''}
          
          <h3 style="color: #3498db; margin: 20px 0 10px 0;">Mobile Optimization</h3>
          <p><strong>Mobile Friendly:</strong> ${mobile?.friendly ? '✅ Yes' : '❌ No'}</p>
          ${mobile?.googleMobileFriendly !== undefined ? 
            `<p style="color: #27ae60;"><em>✅ Verified by Google Mobile-Friendly Test</em></p>` : ''}
          
          <h3 style="color: #3498db; margin: 20px 0 10px 0;">SEO Analysis</h3>
          <p><strong>Page Title:</strong> ${seo?.data?.title ? '✅ Present' : '❌ Missing'}</p>
          <p><strong>Meta Description:</strong> ${seo?.data?.metaDescription ? '✅ Present' : '❌ Missing'}</p>
          <p><strong>H1 Tags:</strong> ${seo?.data?.h1Tags?.length || 0} found</p>
          
          <h3 style="color: #3498db; margin: 20px 0 10px 0;">Conversion Elements</h3>
          <p><strong>Phone Number Visible:</strong> ${conversion?.phoneVisible ? '✅ Yes' : '❌ No'}</p>
          <p><strong>Contact Form:</strong> ${conversion?.contactFormPresent ? '✅ Present' : '❌ Missing'}</p>
          <p><strong>Contact Methods:</strong> ${conversion?.data?.phoneNumbers?.length || 0} phone numbers found</p>
        </div>

        <div class="cta-section">
          <h2 style="margin: 0; color: white;">🎯 Ready to Fix These Issues?</h2>
          <p>Don't let website problems cost you customers every day. Our team can help you implement these fixes and grow your business.</p>
          <a href="mailto:hello@okha.ai?subject=Fix My Website - ${businessName}&body=Hi! I received my audit report and I'm interested in getting help fixing the issues on my website." class="cta-button">
            Get Help Fixing These Issues
          </a>
        </div>

        <div class="footer">
          <p><strong>Report generated by Okha.ai</strong></p>
          <p>Helping small businesses get more customers online</p>
          <p style="margin-top: 10px; font-size: 12px;">
            This report was generated on ${new Date().toLocaleDateString()} for ${website}
          </p>
        </div>
      </div>
    </body>
    </html>
  `
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { leadId, auditId } = req.body

    if (!leadId || !auditId) {
      return res.status(400).json({ error: 'Missing leadId or auditId' })
    }

    // Get lead and audit data
    const [leadData, auditResults] = await Promise.all([
      kv.get(leadId),
      kv.get(auditId)
    ])

    if (!leadData || !auditResults) {
      return res.status(404).json({ error: 'Lead or audit data not found' })
    }

    // Generate HTML report
    const reportHTML = generateAuditReportHTML(leadData, auditResults)

    // Store report in Vercel Blob
    const reportFilename = `audit-report-${leadId}-${Date.now()}.html`
    const blob = await put(reportFilename, reportHTML, {
      access: 'public',
      contentType: 'text/html',
      cacheControlMaxAge: 60 * 60 * 24 * 30 // 30 days
    })

    // Update lead data with report URL
    leadData.reportUrl = blob.url
    leadData.reportGenerated = new Date().toISOString()
    await kv.set(leadId, leadData)

    // Also store report metadata in KV for admin dashboard
    await kv.set(`report_${leadId}`, {
      leadId,
      auditId,
      reportUrl: blob.url,
      filename: reportFilename,
      generated: new Date().toISOString(),
      businessName: leadData.businessName,
      website: leadData.website,
      healthScore: auditResults.healthScore
    })

    res.status(200).json({
      success: true,
      reportUrl: blob.url,
      filename: reportFilename,
      size: reportHTML.length
    })

  } catch (error) {
    console.error('Report generation error:', error)
    res.status(500).json({ 
      success: false, 
      error: 'Report generation failed' 
    })
  }
}