// Vercel Cron Function to process audit and email queues
import { kv } from '@vercel/kv'

async function processAuditQueue() {
  try {
    // Get next item from audit queue
    const queueItem = await kv.rpop('audit:queue')
    if (!queueItem) {
      return { processed: 0 }
    }

    const { leadId, websiteUrl, businessType, timestamp } = JSON.parse(queueItem)
    
    console.log(`Processing audit for lead ${leadId}`)
    
    // Call the audit processing function
    const auditResponse = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/process-audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        leadId,
        websiteUrl,
        businessType
      })
    })

    if (auditResponse.ok) {
      console.log(`✓ Audit completed for lead ${leadId}`)
      return { processed: 1 }
    } else {
      console.error(`✗ Audit failed for lead ${leadId}`)
      // Put item back in queue for retry (with delay)
      await kv.lpush('audit:queue:retry', JSON.stringify({
        ...JSON.parse(queueItem),
        retryCount: 1,
        retryAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
      }))
      return { processed: 0, errors: 1 }
    }

  } catch (error) {
    console.error('Audit queue processing error:', error)
    return { processed: 0, errors: 1 }
  }
}

async function processEmailQueue() {
  try {
    // Get next item from email queue
    const queueItem = await kv.rpop('email:queue')
    if (!queueItem) {
      return { processed: 0 }
    }

    const { type, leadId, auditId, timestamp } = JSON.parse(queueItem)
    
    console.log(`Processing email for lead ${leadId}, type: ${type}`)
    
    // Call the email sending function
    const emailResponse = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type,
        leadId,
        auditId
      })
    })

    if (emailResponse.ok) {
      const result = await emailResponse.json()
      if (result.success) {
        console.log(`✓ Email sent for lead ${leadId}`)
        return { processed: 1 }
      } else {
        console.error(`✗ Email failed for lead ${leadId}:`, result.error)
        return { processed: 0, errors: 1 }
      }
    } else {
      console.error(`✗ Email API failed for lead ${leadId}`)
      // Put item back in queue for retry
      await kv.lpush('email:queue:retry', JSON.stringify({
        ...JSON.parse(queueItem),
        retryCount: 1,
        retryAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
      }))
      return { processed: 0, errors: 1 }
    }

  } catch (error) {
    console.error('Email queue processing error:', error)
    return { processed: 0, errors: 1 }
  }
}

async function processRetryQueues() {
  const processed = { audits: 0, emails: 0 }
  
  try {
    // Process audit retries
    const auditRetries = await kv.lrange('audit:queue:retry', 0, -1)
    for (const retryItem of auditRetries) {
      const retryData = JSON.parse(retryItem)
      if (new Date(retryData.retryAt) <= new Date()) {
        // Remove from retry queue and add back to main queue
        await kv.lrem('audit:queue:retry', 1, retryItem)
        if ((retryData.retryCount || 0) < 3) {
          await kv.lpush('audit:queue', JSON.stringify({
            leadId: retryData.leadId,
            websiteUrl: retryData.websiteUrl,
            businessType: retryData.businessType,
            timestamp: retryData.timestamp
          }))
          processed.audits++
        }
      }
    }

    // Process email retries
    const emailRetries = await kv.lrange('email:queue:retry', 0, -1)
    for (const retryItem of emailRetries) {
      const retryData = JSON.parse(retryItem)
      if (new Date(retryData.retryAt) <= new Date()) {
        // Remove from retry queue and add back to main queue
        await kv.lrem('email:queue:retry', 1, retryItem)
        if ((retryData.retryCount || 0) < 3) {
          await kv.lpush('email:queue', JSON.stringify({
            type: retryData.type,
            leadId: retryData.leadId,
            auditId: retryData.auditId,
            timestamp: retryData.timestamp
          }))
          processed.emails++
        }
      }
    }

  } catch (error) {
    console.error('Retry queue processing error:', error)
  }

  return processed
}

export default async function handler(req, res) {
  // Only allow cron jobs and internal calls
  const authHeader = req.headers.authorization
  const cronSecret = req.headers['x-vercel-cron-signature']
  
  if (!cronSecret && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const startTime = Date.now()
    
    // Process queues in parallel
    const [auditResult, emailResult, retryResult] = await Promise.all([
      processAuditQueue(),
      processEmailQueue(),
      processRetryQueues()
    ])

    const duration = Date.now() - startTime
    
    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      processed: {
        audits: auditResult.processed || 0,
        emails: emailResult.processed || 0,
        retryAudits: retryResult.audits || 0,
        retryEmails: retryResult.emails || 0
      },
      errors: {
        audits: auditResult.errors || 0,
        emails: emailResult.errors || 0
      }
    }

    console.log('Queue processing completed:', result)
    
    res.status(200).json(result)

  } catch (error) {
    console.error('Queue processing failed:', error)
    res.status(500).json({ 
      success: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    })
  }
}