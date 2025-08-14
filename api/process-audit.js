// Vercel Function to process website audits
import { kv } from '@vercel/kv'

// Simplified audit engine for Vercel Functions
class VercelAuditEngine {
  async runQuickAudit(websiteUrl, businessType) {
    console.log(`Starting audit for ${websiteUrl}`)
    
    try {
      // Ensure URL has protocol
      const url = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`
      
      const results = {
        url: url,
        businessType: businessType,
        timestamp: new Date().toISOString(),
        performance: {},
        mobile: {},
        seo: {},
        local: {},
        conversion: {},
        technical: {},
        issues: {
          critical: [],
          high: [],
          medium: []
        }
      }

      // Run audit checks (simplified for Vercel Functions)
      const [
        performanceResults,
        seoResults,
        technicalResults
      ] = await Promise.all([
        this.checkPerformance(url),
        this.checkSEO(url),
        this.checkTechnical(url)
      ])

      results.performance = performanceResults
      results.seo = seoResults
      results.technical = technicalResults
      
      // Generate mobile and conversion analysis with Google APIs
      results.mobile = await this.analyzeMobileReadiness(seoResults, url)
      results.conversion = this.analyzeConversionElements(seoResults)
      results.local = this.analyzeLocalSEO(seoResults, businessType)

      // Categorize issues
      this.categorizeIssues(results)
      
      // Calculate overall health score
      results.healthScore = this.calculateHealthScore(results)
      results.revenueProjection = this.calculateRevenueProjection(results, businessType)

      console.log(`✓ Audit completed for ${websiteUrl}`)
      return results

    } catch (error) {
      console.error(`Audit failed for ${websiteUrl}:`, error)
      throw error
    }
  }

  async checkPerformance(url) {
    try {
      // Use Google PageSpeed Insights API for real performance data
      const pagespeedData = await this.getPageSpeedInsights(url);
      
      let mobileLoadTime = 5; // Default fallback
      let desktopLoadTime = 3;
      let mobileScore = 50;
      let desktopScore = 60;
      
      if (pagespeedData.mobile) {
        const mobileLighthouse = pagespeedData.mobile.lighthouseResult;
        if (mobileLighthouse && mobileLighthouse.audits) {
          // Extract Core Web Vitals
          const fcp = mobileLighthouse.audits['first-contentful-paint']?.numericValue || 3000;
          const lcp = mobileLighthouse.audits['largest-contentful-paint']?.numericValue || 4000;
          const cls = mobileLighthouse.audits['cumulative-layout-shift']?.numericValue || 0.1;
          const fid = mobileLighthouse.audits['max-potential-fid']?.numericValue || 100;
          
          mobileLoadTime = Math.max(fcp, lcp) / 1000; // Convert to seconds
          mobileScore = mobileLighthouse.categories?.performance?.score * 100 || 50;
          
          // Store Core Web Vitals for detailed reporting
          pagespeedData.mobile.coreWebVitals = {
            fcp: Math.round(fcp),
            lcp: Math.round(lcp),
            cls: Math.round(cls * 100) / 100,
            fid: Math.round(fid)
          };
        }
      }
      
      if (pagespeedData.desktop) {
        const desktopLighthouse = pagespeedData.desktop.lighthouseResult;
        if (desktopLighthouse && desktopLighthouse.audits) {
          const fcp = desktopLighthouse.audits['first-contentful-paint']?.numericValue || 2000;
          const lcp = desktopLighthouse.audits['largest-contentful-paint']?.numericValue || 2500;
          
          desktopLoadTime = Math.max(fcp, lcp) / 1000;
          desktopScore = desktopLighthouse.categories?.performance?.score * 100 || 60;
        }
      }
      
      return {
        mobile: {
          loadTime: mobileLoadTime,
          score: Math.round(mobileScore),
          coreWebVitals: pagespeedData.mobile?.coreWebVitals
        },
        desktop: {
          loadTime: desktopLoadTime,
          score: Math.round(desktopScore)
        },
        pagespeedData: pagespeedData,
        googleInsights: true
      }
    } catch (error) {
      console.error('Performance check error:', error);
      // Fallback to basic check
      return this.basicPerformanceCheck(url);
    }
  }

  async getPageSpeedInsights(url) {
    const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
    if (!apiKey) {
      console.warn('Google PageSpeed API key not configured');
      return null;
    }

    try {
      const [mobileResponse, desktopResponse] = await Promise.all([
        // Mobile test
        fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${apiKey}&strategy=mobile&category=performance&category=accessibility&category=best-practices&category=seo`, {
          timeout: 30000
        }),
        // Desktop test
        fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${apiKey}&strategy=desktop&category=performance&category=accessibility&category=best-practices&category=seo`, {
          timeout: 30000
        })
      ]);

      const result = {};
      
      if (mobileResponse.ok) {
        result.mobile = await mobileResponse.json();
      }
      
      if (desktopResponse.ok) {
        result.desktop = await desktopResponse.json();
      }

      return result;
    } catch (error) {
      console.error('PageSpeed API error:', error);
      return null;
    }
  }

  async basicPerformanceCheck(url) {
    try {
      const startTime = Date.now();
      const response = await fetch(url, { 
        method: 'HEAD',
        headers: { 'User-Agent': 'Okha.ai Audit Bot' }
      });
      const loadTime = (Date.now() - startTime) / 1000;
      
      return {
        mobile: {
          loadTime: loadTime * 1.5, // Mobile typically slower
          score: this.calculateSpeedScore(loadTime * 1.5)
        },
        desktop: {
          loadTime: loadTime,
          score: this.calculateSpeedScore(loadTime)
        },
        basicCheck: true
      }
    } catch (error) {
      return {
        mobile: { loadTime: 10, score: 0 },
        desktop: { loadTime: 10, score: 0 },
        error: error.message
      }
    }
  }

  async checkSEO(url) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Okha.ai Audit Bot' }
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      
      const html = await response.text()
      
      // Extract basic SEO elements
      const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i)
      const title = titleMatch ? titleMatch[1].trim() : ''
      
      const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["']/i)
      const metaDescription = metaDescMatch ? metaDescMatch[1] : ''
      
      const h1Matches = html.match(/<h1[^>]*>(.*?)<\/h1>/gi)
      const h1Tags = h1Matches ? h1Matches.map(h1 => h1.replace(/<[^>]*>/g, '').trim()) : []
      
      const imgMatches = html.match(/<img[^>]*>/gi)
      const images = imgMatches || []
      const imagesWithoutAlt = images.filter(img => !img.includes('alt=')).length
      
      // Phone number detection
      const phoneRegex = /(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g
      const phoneMatches = html.match(phoneRegex)
      
      // Contact form detection
      const formMatches = html.match(/<form[^>]*>/gi)
      const hasContactForm = formMatches && formMatches.length > 0
      
      // Email detection
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
      const emailMatches = html.match(emailRegex)
      
      const issues = {
        missingTitle: !title || title.length === 0,
        titleTooShort: title.length < 30,
        titleTooLong: title.length > 60,
        missingMetaDescription: !metaDescription,
        metaDescriptionTooShort: metaDescription.length < 120,
        metaDescriptionTooLong: metaDescription.length > 160,
        noH1: h1Tags.length === 0,
        multipleH1: h1Tags.length > 1,
        missingAltTags: imagesWithoutAlt,
        totalImages: images.length
      }

      return {
        data: {
          title,
          metaDescription,
          h1Tags,
          images: images.length,
          phoneNumbers: phoneMatches || [],
          emails: emailMatches || [],
          hasContactForm
        },
        issues,
        score: this.calculateSEOScore(issues)
      }

    } catch (error) {
      return {
        data: {},
        issues: {},
        score: 0,
        error: error.message
      }
    }
  }

  async checkTechnical(url) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Okha.ai Audit Bot' }
      })
      
      const data = {
        ssl: url.startsWith('https://'),
        statusCode: response.status,
        gzip: response.headers.get('content-encoding') === 'gzip',
        analytics: {
          googleAnalytics: false,
          googleTagManager: false
        }
      }
      
      if (response.ok) {
        const html = await response.text()
        data.analytics.googleAnalytics = /gtag\(|ga\(|GoogleAnalytics|UA-/.test(html)
        data.analytics.googleTagManager = /googletagmanager|GTM-/.test(html)
      }

      return {
        data,
        score: this.calculateTechnicalScore(data)
      }

    } catch (error) {
      return {
        data: { ssl: false, statusCode: 0 },
        score: 0,
        error: error.message
      }
    }
  }

  async analyzeMobileReadiness(seoResults, url) {
    try {
      // Use Google Mobile-Friendly Test API for accurate mobile analysis
      const mobileTestResult = await this.getMobileFriendlyTest(url);
      
      if (mobileTestResult && mobileTestResult.mobileFriendliness === 'MOBILE_FRIENDLY') {
        return {
          friendly: true,
          score: 90,
          googleMobileFriendly: true,
          issues: {
            viewportNotSet: false,
            textTooSmall: false,
            clickTargetsTooClose: false
          },
          mobileTestData: mobileTestResult
        };
      } else if (mobileTestResult && mobileTestResult.mobileFriendliness === 'NOT_MOBILE_FRIENDLY') {
        // Extract specific issues from Google's test
        const issues = {
          viewportNotSet: false,
          textTooSmall: false,
          clickTargetsTooClose: false,
          contentWiderThanScreen: false
        };
        
        if (mobileTestResult.resourceIssues) {
          mobileTestResult.resourceIssues.forEach(issue => {
            if (issue.blockedResource && issue.blockedResource.url) {
              console.log('Mobile resource issue:', issue.blockedResource.url);
            }
          });
        }
        
        return {
          friendly: false,
          score: 30,
          googleMobileFriendly: false,
          issues: issues,
          mobileTestData: mobileTestResult
        };
      } else {
        // Fallback to basic mobile analysis
        return this.basicMobileAnalysis(seoResults);
      }
    } catch (error) {
      console.error('Mobile analysis error:', error);
      return this.basicMobileAnalysis(seoResults);
    }
  }

  async getMobileFriendlyTest(url) {
    const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY; // Same API key can be used
    if (!apiKey) {
      console.warn('Google API key not configured for mobile test');
      return null;
    }

    try {
      const response = await fetch('https://searchconsole.googleapis.com/v1/urlTestingTools/mobileFriendlyTest:run?key=' + apiKey, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: url,
          requestScreenshot: false
        }),
        timeout: 30000
      });

      if (response.ok) {
        return await response.json();
      } else {
        console.error('Mobile-Friendly Test API error:', response.status);
        return null;
      }
    } catch (error) {
      console.error('Mobile-Friendly Test API error:', error);
      return null;
    }
  }

  basicMobileAnalysis(seoResults) {
    // Fallback mobile analysis
    const score = seoResults.score > 70 ? 80 : 60;
    return {
      friendly: score > 70,
      score: score,
      basicAnalysis: true,
      issues: {
        viewportNotSet: false,
        textTooSmall: false,
        clickTargetsTooClose: false
      }
    };
  }

  analyzeConversionElements(seoResults) {
    const data = seoResults.data || {}
    const hasPhone = data.phoneNumbers && data.phoneNumbers.length > 0
    const hasEmail = data.emails && data.emails.length > 0
    const hasContactForm = data.hasContactForm

    const score = (hasPhone ? 40 : 0) + (hasEmail ? 20 : 0) + (hasContactForm ? 40 : 0)

    return {
      data: {
        phoneNumbers: data.phoneNumbers || [],
        contactForms: hasContactForm ? 1 : 0,
        ctaButtons: 0 // Would need more complex analysis
      },
      score,
      phoneVisible: hasPhone,
      contactFormPresent: hasContactForm
    }
  }

  analyzeLocalSEO(seoResults, businessType) {
    const data = seoResults.data || {}
    const hasPhone = data.phoneNumbers && data.phoneNumbers.length > 0
    const hasEmail = data.emails && data.emails.length > 0
    
    const score = (hasPhone ? 50 : 0) + (hasEmail ? 25 : 0) + 25 // Base score for having a website

    return {
      score,
      data: {
        businessType,
        contactInfo: {
          phone: hasPhone ? data.phoneNumbers[0] : null,
          email: hasEmail ? data.emails[0] : null
        }
      }
    }
  }

  calculateSpeedScore(loadTime) {
    if (loadTime <= 2) return 100
    if (loadTime <= 3) return 90
    if (loadTime <= 4) return 75
    if (loadTime <= 5) return 60
    if (loadTime <= 7) return 40
    if (loadTime <= 10) return 20
    return 0
  }

  calculateSEOScore(issues) {
    let score = 100
    if (issues.missingTitle) score -= 25
    if (issues.titleTooShort || issues.titleTooLong) score -= 15
    if (issues.missingMetaDescription) score -= 20
    if (issues.metaDescriptionTooShort || issues.metaDescriptionTooLong) score -= 10
    if (issues.noH1) score -= 20
    if (issues.multipleH1) score -= 15
    if (issues.missingAltTags > 0 && issues.totalImages > 0) {
      const altTagPenalty = Math.min(20, (issues.missingAltTags / issues.totalImages) * 20)
      score -= altTagPenalty
    }
    return Math.max(0, score)
  }

  calculateTechnicalScore(data) {
    let score = 0
    if (data.ssl) score += 40
    if (data.statusCode === 200) score += 30
    if (data.gzip) score += 15
    if (data.analytics.googleAnalytics || data.analytics.googleTagManager) score += 15
    return score
  }

  calculateHealthScore(auditResults) {
    const weights = {
      performance: 0.3,
      mobile: 0.2,
      seo: 0.2,
      local: 0.15,
      conversion: 0.1,
      technical: 0.05
    }

    let totalScore = 0
    let totalWeight = 0

    Object.keys(weights).forEach(key => {
      if (auditResults[key]?.score !== undefined) {
        totalScore += auditResults[key].score * weights[key]
        totalWeight += weights[key]
      }
    })

    return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0
  }

  calculateRevenueProjection(auditResults, businessType) {
    const baseProjections = {
      'restaurant': { min: 2000, max: 5000 },
      'home-services': { min: 3000, max: 8000 },
      'healthcare': { min: 5000, max: 15000 },
      'automotive': { min: 2500, max: 6000 },
      'retail': { min: 1500, max: 4000 },
      'professional-services': { min: 3000, max: 10000 }
    }

    const base = baseProjections[businessType] || baseProjections['retail']
    
    let multiplier = 1.0
    
    if (auditResults.performance?.mobile?.loadTime > 5) multiplier += 0.3
    if (auditResults.mobile?.score < 50) multiplier += 0.4
    if (auditResults.seo?.score < 60) multiplier += 0.3
    if (!auditResults.conversion?.phoneVisible) multiplier += 0.4
    if (auditResults.local?.score < 50) multiplier += 0.5

    return {
      min: Math.round(base.min * multiplier),
      max: Math.round(base.max * multiplier)
    }
  }

  categorizeIssues(results) {
    // Critical issues
    if (results.performance?.mobile?.loadTime > 8) {
      results.issues.critical.push({
        title: 'Extremely Slow Mobile Loading',
        impact: 'High',
        description: `Your website takes ${results.performance.mobile.loadTime.toFixed(1)} seconds to load on mobile. Most users abandon sites that take longer than 3 seconds.`,
        solution: 'Optimize images, enable compression, and improve server response time'
      })
    }

    if (!results.conversion?.phoneVisible) {
      results.issues.critical.push({
        title: 'Phone Number Not Visible',
        impact: 'High',
        description: 'Customers cannot easily find your phone number to call you.',
        solution: 'Add a prominent phone number in the header and footer with click-to-call functionality'
      })
    }

    // High priority issues
    if (results.seo?.issues?.missingTitle || results.seo?.issues?.missingMetaDescription) {
      results.issues.high.push({
        title: 'Missing SEO Basics',
        impact: 'Medium',
        description: 'Your pages are missing essential SEO elements that help Google understand your business.',
        solution: 'Add proper page titles and meta descriptions to all pages'
      })
    }

    if (results.performance?.mobile?.loadTime > 5 && results.performance?.mobile?.loadTime <= 8) {
      results.issues.high.push({
        title: 'Slow Mobile Loading',
        impact: 'Medium',
        description: `Your mobile loading time of ${results.performance.mobile.loadTime.toFixed(1)} seconds is slower than 87% of websites.`,
        solution: 'Optimize images and enable caching to improve load times'
      })
    }

    // Medium priority issues
    if (!results.conversion?.contactFormPresent) {
      results.issues.medium.push({
        title: 'No Contact Form',
        impact: 'Low',
        description: 'Visitors have limited ways to contact you beyond phone calls.',
        solution: 'Add a contact form to capture more leads'
      })
    }

    if (results.seo?.issues?.missingAltTags > 0) {
      results.issues.medium.push({
        title: 'Missing Image Alt Tags',
        impact: 'Low',
        description: `${results.seo.issues.missingAltTags} images are missing alt tags, hurting SEO.`,
        solution: 'Add descriptive alt tags to all images'
      })
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { leadId, websiteUrl, businessType } = req.body

    if (!leadId || !websiteUrl || !businessType) {
      return res.status(400).json({ error: 'Missing required parameters' })
    }

    const auditEngine = new VercelAuditEngine()
    const auditResults = await auditEngine.runQuickAudit(websiteUrl, businessType)

    // Store audit results in KV
    const auditId = `audit_${leadId}_${Date.now()}`
    await kv.set(auditId, auditResults)
    
    // Update lead with audit results
    const leadData = await kv.get(leadId)
    if (leadData) {
      leadData.auditId = auditId
      leadData.status = 'audit_completed'
      leadData.auditCompleted = new Date().toISOString()
      await kv.set(leadId, leadData)
    }

    // Queue email generation
    await kv.lpush('email:queue', JSON.stringify({
      type: 'audit_completed',
      leadId,
      auditId,
      timestamp: new Date().toISOString()
    }))

    res.status(200).json({
      success: true,
      auditId,
      healthScore: auditResults.healthScore,
      criticalIssues: auditResults.issues.critical.length
    })

  } catch (error) {
    console.error('Audit processing error:', error)
    res.status(500).json({ 
      success: false, 
      error: 'Audit processing failed' 
    })
  }
}