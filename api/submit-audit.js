// Vercel Function to handle audit form submissions
import { kv } from '@vercel/kv'

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    })
  }

  try {
    const formData = req.body
    
    // Validate required fields
    const requiredFields = ['businessName', 'website', 'firstName', 'lastName', 'email', 'businessType', 'mainGoal']
    const missingFields = requiredFields.filter(field => !formData[field])
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`
      })
    }

    // Clean and validate website URL
    let websiteUrl = formData.website
    if (!websiteUrl.startsWith('http://') && !websiteUrl.startsWith('https://')) {
      websiteUrl = 'https://' + websiteUrl
    }

    // Create lead record
    const leadId = `lead_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const timestamp = new Date().toISOString()
    
    const leadData = {
      id: leadId,
      timestamp,
      status: 'pending',
      businessName: formData.businessName,
      website: websiteUrl,
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      phone: formData.phone || '',
      businessType: formData.businessType,
      mainGoal: formData.mainGoal,
      currentProblem: formData.currentProblem || '',
      monthlyVisitors: formData.monthlyVisitors || '',
      userAgent: formData.userAgent || '',
      referrer: formData.referrer || '',
      ipAddress: req.headers['x-forwarded-for'] || req.connection.remoteAddress
    }

    // Store lead in Vercel KV
    await kv.set(leadId, leadData)
    await kv.lpush('leads:pending', leadId)
    
    // Add to email queue for processing
    await kv.lpush('email:queue', JSON.stringify({
      type: 'audit_request',
      leadId,
      timestamp
    }))

    // Trigger audit processing (async)
    await kv.lpush('audit:queue', JSON.stringify({
      leadId,
      websiteUrl,
      businessType: formData.businessType,
      timestamp
    }))

    res.status(200).json({
      success: true,
      message: 'Audit request submitted successfully',
      leadId
    })

  } catch (error) {
    console.error('Form submission error:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    })
  }
}