// Vercel Function to send emails using Resend or similar service
import { kv } from '@vercel/kv'

// Email service configuration (using Resend as example)
const EMAIL_API_KEY = process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY
const FROM_EMAIL = process.env.FROM_EMAIL || 'hello@okha.ai'

async function sendEmailWithResend(to, subject, html) {
  if (!EMAIL_API_KEY) {
    console.warn('No email API key configured')
    return { success: false, error: 'Email service not configured' }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${EMAIL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject: subject,
        html: html,
      }),
    })

    const result = await response.json()
    
    if (!response.ok) {
      throw new Error(result.message || 'Email sending failed')
    }

    return { success: true, messageId: result.id }
  } catch (error) {
    console.error('Email sending error:', error)
    return { success: false, error: error.message }
  }
}

function generateAuditReportEmail(leadData, auditResults, reportUrl = null) {
  const { firstName, businessName, website } = leadData
  const { healthScore, issues, revenueProjection } = auditResults

  const getScoreColor = (score) => {
    if (score >= 80) return '#27ae60'
    if (score >= 60) return '#f39c12'
    return '#e74c3c'
  }

  const getScoreText = (score) => {
    if (score >= 80) return 'Excellent'
    if (score >= 60) return 'Good'
    if (score >= 40) return 'Needs Improvement'
    return 'Poor'
  }

  const criticalIssuesHtml = issues.critical.map(issue => `
    <div style="background: #fee; border-left: 4px solid #e74c3c; padding: 15px; margin: 10px 0;">
      <h4 style="color: #e74c3c; margin: 0 0 8px 0;">${issue.title}</h4>
      <p style="margin: 0 0 8px 0; color: #333;">${issue.description}</p>
      <p style="margin: 0; color: #666; font-style: italic;">Solution: ${issue.solution}</p>
    </div>
  `).join('')

  const highIssuesHtml = issues.high.slice(0, 3).map(issue => `
    <div style="background: #fff3cd; border-left: 4px solid #f39c12; padding: 15px; margin: 10px 0;">
      <h4 style="color: #f39c12; margin: 0 0 8px 0;">${issue.title}</h4>
      <p style="margin: 0 0 8px 0; color: #333;">${issue.description}</p>
      <p style="margin: 0; color: #666; font-style: italic;">Solution: ${issue.solution}</p>
    </div>
  `).join('')

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Your Website Audit Results</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #2c3e50; margin-bottom: 10px;">Your Website Audit Results</h1>
        <p style="color: #666; font-size: 18px;">For ${businessName}</p>
      </div>

      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px; text-align: center;">
        <h2 style="margin: 0 0 15px 0; color: #2c3e50;">Overall Health Score</h2>
        <div style="font-size: 48px; font-weight: bold; color: ${getScoreColor(healthScore)}; margin-bottom: 10px;">
          ${healthScore}/100
        </div>
        <p style="font-size: 18px; color: ${getScoreColor(healthScore)}; margin: 0; font-weight: bold;">
          ${getScoreText(healthScore)}
        </p>
      </div>

      <div style="margin-bottom: 30px;">
        <h3 style="color: #2c3e50; margin-bottom: 15px;">Hi ${firstName},</h3>
        <p>We've completed a comprehensive audit of your website (${website}) and found several opportunities to help you get more customers.</p>
        
        ${issues.critical.length > 0 ? `
          <p style="color: #e74c3c; font-weight: bold;">
            ⚠️ We found ${issues.critical.length} critical issue${issues.critical.length > 1 ? 's' : ''} that are likely costing you customers right now.
          </p>
        ` : ''}
        
        <p>Based on our analysis, fixing these issues could potentially increase your monthly revenue by <strong>$${revenueProjection.min.toLocaleString()} - $${revenueProjection.max.toLocaleString()}</strong>.</p>
      </div>

      ${issues.critical.length > 0 ? `
        <div style="margin-bottom: 30px;">
          <h3 style="color: #e74c3c; margin-bottom: 15px;">🚨 Critical Issues (Fix These First)</h3>
          ${criticalIssuesHtml}
        </div>
      ` : ''}

      ${issues.high.length > 0 ? `
        <div style="margin-bottom: 30px;">
          <h3 style="color: #f39c12; margin-bottom: 15px;">⚡ High Priority Issues</h3>
          ${highIssuesHtml}
          ${issues.high.length > 3 ? `<p style="color: #666; font-style: italic;">... and ${issues.high.length - 3} more high priority issues.</p>` : ''}
        </div>
      ` : ''}

      ${reportUrl ? `
        <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 30px 0;">
          <h3 style="color: #1976d2; margin: 0 0 15px 0;">📄 Complete Audit Report</h3>
          <p style="margin: 0 0 15px 0;">Your comprehensive audit report includes detailed analysis, Core Web Vitals, and step-by-step solutions.</p>
          
          <div style="text-align: center;">
            <a href="${reportUrl}" 
               style="background: #1976d2; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin-right: 10px;">
              📄 View Full Report
            </a>
          </div>
        </div>
      ` : ''}

      <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 30px 0;">
        <h3 style="color: #27ae60; margin: 0 0 15px 0;">🎯 Ready to Get More Customers?</h3>
        <p style="margin: 0 0 15px 0;">These issues are costing you customers every day. The good news? They're all fixable.</p>
        <p style="margin: 0 0 20px 0;">Want help fixing these problems and turning your website into a customer-generating machine?</p>
        
        <div style="text-align: center;">
          <a href="mailto:${FROM_EMAIL}?subject=Fix My Website - ${businessName}&body=Hi! I received my audit report and I'm interested in getting help fixing the issues on my website. My business is ${businessName} and my website is ${website}." 
             style="background: #27ae60; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
            Get Help Fixing These Issues
          </a>
        </div>
      </div>

      <div style="border-top: 1px solid #ddd; padding-top: 20px; margin-top: 30px; text-align: center; color: #666;">
        <p>Questions about your audit? Reply to this email - we're here to help!</p>
        <p style="font-size: 14px;">
          Okha.ai - Helping Small Businesses Get More Customers Online<br>
          <a href="https://okha.ai" style="color: #2c3e50;">okha.ai</a>
        </p>
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
    const { type, leadId, auditId } = req.body

    if (!type || !leadId) {
      return res.status(400).json({ error: 'Missing required parameters' })
    }

    // Get lead data
    const leadData = await kv.get(leadId)
    if (!leadData) {
      return res.status(404).json({ error: 'Lead not found' })
    }

    let emailResult

    if (type === 'audit_completed' && auditId) {
      // Get audit results
      const auditResults = await kv.get(auditId)
      if (!auditResults) {
        return res.status(404).json({ error: 'Audit results not found' })
      }

      // Generate comprehensive report and store in Vercel Blob
      let reportUrl = leadData.reportUrl;
      if (!reportUrl) {
        try {
          const reportResponse = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/generate-report`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ leadId, auditId })
          });
          
          if (reportResponse.ok) {
            const reportResult = await reportResponse.json();
            reportUrl = reportResult.reportUrl;
          }
        } catch (reportError) {
          console.error('Report generation failed:', reportError);
          // Continue with email even if report generation fails
        }
      }

      // Generate and send audit report email with report link
      const emailHtml = generateAuditReportEmail(leadData, auditResults, reportUrl)
      const subject = `Your Website Audit Results - ${leadData.businessName}`
      
      emailResult = await sendEmailWithResend(leadData.email, subject, emailHtml)

      // Update lead with email status
      leadData.emailSent = emailResult.success
      leadData.emailSentAt = new Date().toISOString()
      if (emailResult.messageId) {
        leadData.emailMessageId = emailResult.messageId
      }
      await kv.set(leadId, leadData)

    } else if (type === 'audit_request') {
      // Send confirmation email
      const confirmationHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2>Thanks for Your Audit Request!</h2>
          <p>Hi ${leadData.firstName},</p>
          <p>We've received your website audit request for <strong>${leadData.businessName}</strong>.</p>
          <p>Our team is now analyzing your website (${leadData.website}) and we'll send you a detailed report within 24 hours.</p>
          <p>The report will include:</p>
          <ul>
            <li>Your website's overall health score</li>
            <li>Specific issues that are costing you customers</li>
            <li>Clear solutions to fix each problem</li>
            <li>Revenue projection after improvements</li>
          </ul>
          <p>Questions? Just reply to this email.</p>
          <p>Best regards,<br>The Okha.ai Team</p>
        </div>
      `
      
      emailResult = await sendEmailWithResend(
        leadData.email, 
        `Audit Request Received - ${leadData.businessName}`,
        confirmationHtml
      )
    }

    res.status(200).json({
      success: emailResult?.success || false,
      messageId: emailResult?.messageId,
      error: emailResult?.error
    })

  } catch (error) {
    console.error('Email sending error:', error)
    res.status(500).json({ 
      success: false, 
      error: 'Email sending failed' 
    })
  }
}