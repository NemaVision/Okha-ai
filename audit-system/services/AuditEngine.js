const puppeteer = require('puppeteer');
const axios = require('axios');
const cheerio = require('cheerio');
const lighthouse = require('lighthouse');

class AuditEngine {
    constructor(database) {
        this.db = database;
        this.browser = null;
    }

    async initBrowser() {
        if (!this.browser) {
            this.browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
        }
        return this.browser;
    }

    async runFullAudit(websiteUrl, businessType) {
        console.log(`Starting comprehensive audit for ${websiteUrl}`);
        
        try {
            // Ensure URL has protocol
            const url = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
            
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
            };

            // Run all audit components in parallel for speed
            const [
                performanceResults,
                mobileResults,
                seoResults,
                localResults,
                conversionResults,
                technicalResults
            ] = await Promise.all([
                this.analyzePerformance(url),
                this.analyzeMobile(url),
                this.analyzeSEO(url),
                this.analyzeLocalSEO(url, businessType),
                this.analyzeConversion(url, businessType),
                this.analyzeTechnical(url)
            ]);

            // Combine results
            results.performance = performanceResults;
            results.mobile = mobileResults;
            results.seo = seoResults;
            results.local = localResults;
            results.conversion = conversionResults;
            results.technical = technicalResults;

            // Categorize issues by severity
            this.categorizeIssues(results);

            console.log(`✓ Audit completed for ${websiteUrl}`);
            return results;

        } catch (error) {
            console.error(`Audit failed for ${websiteUrl}:`, error);
            throw error;
        }
    }

    async analyzePerformance(url) {
        console.log('  → Analyzing performance...');
        
        try {
            const browser = await this.initBrowser();
            const page = await browser.newPage();
            
            // Test desktop performance
            await page.setViewport({ width: 1366, height: 768 });
            const startTime = Date.now();
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
            const desktopLoadTime = (Date.now() - startTime) / 1000;
            
            // Test mobile performance
            await page.setViewport({ width: 375, height: 667 });
            const mobileStartTime = Date.now();
            await page.reload({ waitUntil: 'networkidle0' });
            const mobileLoadTime = (Date.now() - mobileStartTime) / 1000;
            
            // Get additional performance metrics
            const performanceMetrics = await page.metrics();
            
            await page.close();

            // Try Google PageSpeed Insights API if available
            let pagespeedData = null;
            try {
                const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
                if (apiKey) {
                    const response = await axios.get(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed`, {
                        params: {
                            url: url,
                            key: apiKey,
                            strategy: 'mobile'
                        },
                        timeout: 15000
                    });
                    pagespeedData = response.data;
                }
            } catch (apiError) {
                console.warn('PageSpeed API unavailable:', apiError.message);
            }

            return {
                desktop: {
                    loadTime: desktopLoadTime,
                    score: this.calculateSpeedScore(desktopLoadTime)
                },
                mobile: {
                    loadTime: mobileLoadTime,
                    score: this.calculateSpeedScore(mobileLoadTime)
                },
                metrics: performanceMetrics,
                pagespeedData: pagespeedData
            };

        } catch (error) {
            console.error('Performance analysis failed:', error);
            return {
                desktop: { loadTime: 0, score: 0 },
                mobile: { loadTime: 0, score: 0 },
                error: error.message
            };
        }
    }

    async analyzeMobile(url) {
        console.log('  → Analyzing mobile usability...');
        
        try {
            const browser = await this.initBrowser();
            const page = await browser.newPage();
            
            // Set mobile viewport
            await page.setViewport({ width: 375, height: 667 });
            await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15');
            
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
            
            // Check mobile-specific issues
            const mobileIssues = await page.evaluate(() => {
                const issues = {
                    textTooSmall: false,
                    clickTargetsTooClose: false,
                    viewportNotSet: false,
                    contentWiderThanScreen: false
                };
                
                // Check text size
                const textElements = document.querySelectorAll('p, span, div, a, li');
                let smallTextCount = 0;
                textElements.forEach(el => {
                    const fontSize = parseInt(window.getComputedStyle(el).fontSize);
                    if (fontSize < 12) smallTextCount++;
                });
                issues.textTooSmall = smallTextCount > textElements.length * 0.1;
                
                // Check viewport meta tag
                const viewportMeta = document.querySelector('meta[name="viewport"]');
                issues.viewportNotSet = !viewportMeta;
                
                // Check content width
                issues.contentWiderThanScreen = document.body.scrollWidth > window.innerWidth;
                
                // Check clickable elements spacing
                const clickables = document.querySelectorAll('a, button, input[type="submit"], input[type="button"]');
                let tooCloseCount = 0;
                for (let i = 0; i < clickables.length - 1; i++) {
                    const rect1 = clickables[i].getBoundingClientRect();
                    const rect2 = clickables[i + 1].getBoundingClientRect();
                    const distance = Math.abs(rect1.bottom - rect2.top);
                    if (distance < 8) tooCloseCount++;
                }
                issues.clickTargetsTooClose = tooCloseCount > 0;
                
                return issues;
            });
            
            await page.close();

            return {
                friendly: !Object.values(mobileIssues).some(issue => issue),
                issues: mobileIssues,
                score: this.calculateMobileScore(mobileIssues)
            };

        } catch (error) {
            console.error('Mobile analysis failed:', error);
            return {
                friendly: false,
                issues: {},
                error: error.message
            };
        }
    }

    async analyzeSEO(url) {
        console.log('  → Analyzing SEO...');
        
        try {
            const browser = await this.initBrowser();
            const page = await browser.newPage();
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
            
            const seoData = await page.evaluate(() => {
                const data = {
                    title: document.title || '',
                    metaDescription: '',
                    h1Tags: [],
                    h2Tags: [],
                    images: [],
                    links: {
                        internal: 0,
                        external: 0,
                        broken: 0
                    }
                };
                
                // Get meta description
                const metaDesc = document.querySelector('meta[name="description"]');
                data.metaDescription = metaDesc ? metaDesc.content : '';
                
                // Get heading tags
                document.querySelectorAll('h1').forEach(h1 => {
                    data.h1Tags.push(h1.textContent.trim());
                });
                
                document.querySelectorAll('h2').forEach(h2 => {
                    data.h2Tags.push(h2.textContent.trim());
                });
                
                // Analyze images
                document.querySelectorAll('img').forEach(img => {
                    data.images.push({
                        src: img.src,
                        alt: img.alt || '',
                        hasAlt: !!img.alt
                    });
                });
                
                // Count links
                document.querySelectorAll('a[href]').forEach(link => {
                    const href = link.href;
                    if (href.startsWith(window.location.origin)) {
                        data.links.internal++;
                    } else if (href.startsWith('http')) {
                        data.links.external++;
                    }
                });
                
                return data;
            });
            
            await page.close();

            // Analyze SEO issues
            const issues = {
                missingTitle: !seoData.title || seoData.title.length === 0,
                titleTooShort: seoData.title.length < 30,
                titleTooLong: seoData.title.length > 60,
                missingMetaDescription: !seoData.metaDescription,
                metaDescriptionTooShort: seoData.metaDescription.length < 120,
                metaDescriptionTooLong: seoData.metaDescription.length > 160,
                noH1: seoData.h1Tags.length === 0,
                multipleH1: seoData.h1Tags.length > 1,
                missingAltTags: seoData.images.filter(img => !img.hasAlt).length,
                totalImages: seoData.images.length
            };

            return {
                data: seoData,
                issues: issues,
                score: this.calculateSEOScore(issues)
            };

        } catch (error) {
            console.error('SEO analysis failed:', error);
            return {
                data: {},
                issues: {},
                error: error.message
            };
        }
    }

    async analyzeLocalSEO(url, businessType) {
        console.log('  → Analyzing local SEO...');
        
        try {
            const browser = await this.initBrowser();
            const page = await browser.newPage();
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
            
            const localData = await page.evaluate((bizType) => {
                const data = {
                    businessType: bizType,
                    contactInfo: {
                        phone: null,
                        address: null,
                        email: null
                    },
                    localKeywords: [],
                    structuredData: false
                };
                
                const pageText = document.body.innerText.toLowerCase();
                
                // Look for phone numbers
                const phoneRegex = /(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g;
                const phoneMatches = pageText.match(phoneRegex);
                data.contactInfo.phone = phoneMatches ? phoneMatches[0] : null;
                
                // Look for addresses
                const addressRegex = /\d+\s+[a-z\s]+(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|court|ct|blvd|boulevard)/gi;
                const addressMatches = pageText.match(addressRegex);
                data.contactInfo.address = addressMatches ? addressMatches[0] : null;
                
                // Look for email addresses
                const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
                const emailMatches = pageText.match(emailRegex);
                data.contactInfo.email = emailMatches ? emailMatches[0] : null;
                
                // Check for structured data
                const structuredDataElements = document.querySelectorAll('script[type="application/ld+json"]');
                data.structuredData = structuredDataElements.length > 0;
                
                // Look for local business keywords based on business type
                const localKeywordPatterns = {
                    'restaurant': ['restaurant', 'dining', 'menu', 'reservations', 'local food'],
                    'home-services': ['local', 'service area', 'residential', 'commercial', 'licensed'],
                    'healthcare': ['local', 'patients', 'appointments', 'office hours'],
                    'retail': ['store', 'shop', 'location', 'hours', 'local'],
                    'automotive': ['auto', 'car', 'vehicle', 'service', 'repair', 'local']
                };
                
                const patterns = localKeywordPatterns[bizType] || localKeywordPatterns['retail'];
                patterns.forEach(keyword => {
                    if (pageText.includes(keyword)) {
                        data.localKeywords.push(keyword);
                    }
                });
                
                return data;
            }, businessType);
            
            await page.close();

            // Calculate local SEO score
            const hasPhone = !!localData.contactInfo.phone;
            const hasAddress = !!localData.contactInfo.address;
            const hasEmail = !!localData.contactInfo.email;
            const hasLocalKeywords = localData.localKeywords.length > 0;
            const hasStructuredData = localData.structuredData;
            
            const score = (
                (hasPhone ? 25 : 0) +
                (hasAddress ? 25 : 0) +
                (hasEmail ? 15 : 0) +
                (hasLocalKeywords ? 20 : 0) +
                (hasStructuredData ? 15 : 0)
            );

            return {
                data: localData,
                score: score,
                recommendations: this.generateLocalSEORecommendations(localData)
            };

        } catch (error) {
            console.error('Local SEO analysis failed:', error);
            return {
                data: {},
                score: 0,
                error: error.message
            };
        }
    }

    async analyzeConversion(url, businessType) {
        console.log('  → Analyzing conversion optimization...');
        
        try {
            const browser = await this.initBrowser();
            const page = await browser.newPage();
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
            
            const conversionData = await page.evaluate(() => {
                const data = {
                    phoneNumbers: [],
                    contactForms: 0,
                    ctaButtons: 0,
                    contactLinks: 0,
                    socialProof: {
                        testimonials: 0,
                        reviews: 0,
                        awards: 0
                    }
                };
                
                // Find phone numbers
                const phoneRegex = /(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g;
                const pageText = document.body.innerText;
                const phoneMatches = pageText.match(phoneRegex);
                data.phoneNumbers = phoneMatches || [];
                
                // Count contact forms
                data.contactForms = document.querySelectorAll('form').length;
                
                // Count CTA buttons
                const ctaKeywords = ['call', 'contact', 'quote', 'book', 'schedule', 'order', 'buy', 'get started'];
                document.querySelectorAll('button, a, input[type="submit"]').forEach(el => {
                    const text = el.textContent.toLowerCase();
                    if (ctaKeywords.some(keyword => text.includes(keyword))) {
                        data.ctaButtons++;
                    }
                });
                
                // Count contact links
                data.contactLinks = document.querySelectorAll('a[href^="tel:"], a[href^="mailto:"]').length;
                
                // Look for social proof
                const proofKeywords = {
                    testimonials: ['testimonial', 'review', 'customer says', 'client feedback'],
                    reviews: ['star', 'rating', 'review', 'google reviews'],
                    awards: ['award', 'certified', 'licensed', 'accredited', 'winner']
                };
                
                Object.keys(proofKeywords).forEach(proofType => {
                    proofKeywords[proofType].forEach(keyword => {
                        if (pageText.toLowerCase().includes(keyword)) {
                            data.socialProof[proofType]++;
                        }
                    });
                });
                
                return data;
            });
            
            await page.close();

            // Calculate conversion score
            const hasPhone = conversionData.phoneNumbers.length > 0;
            const hasContactForm = conversionData.contactForms > 0;
            const hasCTAs = conversionData.ctaButtons > 0;
            const hasContactLinks = conversionData.contactLinks > 0;
            const hasSocialProof = Object.values(conversionData.socialProof).some(count => count > 0);
            
            const score = (
                (hasPhone ? 30 : 0) +
                (hasContactForm ? 25 : 0) +
                (hasCTAs ? 20 : 0) +
                (hasContactLinks ? 15 : 0) +
                (hasSocialProof ? 10 : 0)
            );

            return {
                data: conversionData,
                score: score,
                phoneVisible: hasPhone,
                contactFormPresent: hasContactForm,
                recommendations: this.generateConversionRecommendations(conversionData, businessType)
            };

        } catch (error) {
            console.error('Conversion analysis failed:', error);
            return {
                data: {},
                score: 0,
                error: error.message
            };
        }
    }

    async analyzeTechnical(url) {
        console.log('  → Analyzing technical issues...');
        
        try {
            const browser = await this.initBrowser();
            const page = await browser.newPage();
            
            const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
            
            const technicalData = await page.evaluate(() => {
                const data = {
                    ssl: window.location.protocol === 'https:',
                    canonical: !!document.querySelector('link[rel="canonical"]'),
                    sitemap: false, // Will check separately
                    robots: false,  // Will check separately
                    gzip: false,    // Check response headers
                    analytics: {
                        googleAnalytics: false,
                        googleTagManager: false,
                        facebookPixel: false
                    }
                };
                
                // Check for analytics codes
                const pageContent = document.documentElement.innerHTML;
                data.analytics.googleAnalytics = /gtag\(|ga\(|GoogleAnalytics|UA-/.test(pageContent);
                data.analytics.googleTagManager = /googletagmanager|GTM-/.test(pageContent);
                data.analytics.facebookPixel = /fbq\(/.test(pageContent);
                
                return data;
            });
            
            // Check HTTP status
            technicalData.statusCode = response.status();
            
            // Check response headers
            const headers = response.headers();
            technicalData.gzip = headers['content-encoding'] === 'gzip';
            
            await page.close();
            
            // Check robots.txt and sitemap
            try {
                const robotsUrl = new URL('/robots.txt', url).toString();
                const robotsResponse = await axios.get(robotsUrl, { timeout: 5000 });
                technicalData.robots = robotsResponse.status === 200;
                
                // Look for sitemap in robots.txt
                if (robotsResponse.data.includes('sitemap:') || robotsResponse.data.includes('Sitemap:')) {
                    technicalData.sitemap = true;
                }
            } catch (error) {
                // robots.txt not found or accessible
                technicalData.robots = false;
            }
            
            if (!technicalData.sitemap) {
                try {
                    const sitemapUrl = new URL('/sitemap.xml', url).toString();
                    const sitemapResponse = await axios.get(sitemapUrl, { timeout: 5000 });
                    technicalData.sitemap = sitemapResponse.status === 200;
                } catch (error) {
                    // sitemap.xml not found
                }
            }

            return {
                data: technicalData,
                score: this.calculateTechnicalScore(technicalData)
            };

        } catch (error) {
            console.error('Technical analysis failed:', error);
            return {
                data: {},
                score: 0,
                error: error.message
            };
        }
    }

    calculateSpeedScore(loadTime) {
        if (loadTime <= 2) return 100;
        if (loadTime <= 3) return 90;
        if (loadTime <= 4) return 75;
        if (loadTime <= 5) return 60;
        if (loadTime <= 7) return 40;
        if (loadTime <= 10) return 20;
        return 0;
    }

    calculateMobileScore(issues) {
        let score = 100;
        if (issues.textTooSmall) score -= 30;
        if (issues.clickTargetsTooClose) score -= 25;
        if (issues.viewportNotSet) score -= 25;
        if (issues.contentWiderThanScreen) score -= 20;
        return Math.max(0, score);
    }

    calculateSEOScore(issues) {
        let score = 100;
        if (issues.missingTitle) score -= 25;
        if (issues.titleTooShort || issues.titleTooLong) score -= 15;
        if (issues.missingMetaDescription) score -= 20;
        if (issues.metaDescriptionTooShort || issues.metaDescriptionTooLong) score -= 10;
        if (issues.noH1) score -= 20;
        if (issues.multipleH1) score -= 15;
        if (issues.missingAltTags > 0) {
            const altTagPenalty = Math.min(20, (issues.missingAltTags / issues.totalImages) * 20);
            score -= altTagPenalty;
        }
        return Math.max(0, score);
    }

    calculateTechnicalScore(data) {
        let score = 0;
        if (data.ssl) score += 25;
        if (data.canonical) score += 15;
        if (data.sitemap) score += 20;
        if (data.robots) score += 15;
        if (data.gzip) score += 10;
        if (data.analytics.googleAnalytics) score += 15;
        return score;
    }

    calculateHealthScore(auditResults) {
        const weights = {
            performance: 0.3,
            mobile: 0.2,
            seo: 0.2,
            local: 0.15,
            conversion: 0.1,
            technical: 0.05
        };

        let totalScore = 0;
        let totalWeight = 0;

        if (auditResults.performance?.mobile?.score !== undefined) {
            totalScore += auditResults.performance.mobile.score * weights.performance;
            totalWeight += weights.performance;
        }

        if (auditResults.mobile?.score !== undefined) {
            totalScore += auditResults.mobile.score * weights.mobile;
            totalWeight += weights.mobile;
        }

        if (auditResults.seo?.score !== undefined) {
            totalScore += auditResults.seo.score * weights.seo;
            totalWeight += weights.seo;
        }

        if (auditResults.local?.score !== undefined) {
            totalScore += auditResults.local.score * weights.local;
            totalWeight += weights.local;
        }

        if (auditResults.conversion?.score !== undefined) {
            totalScore += auditResults.conversion.score * weights.conversion;
            totalWeight += weights.conversion;
        }

        if (auditResults.technical?.score !== undefined) {
            totalScore += auditResults.technical.score * weights.technical;
            totalWeight += weights.technical;
        }

        return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
    }

    calculateRevenueProjection(auditResults, businessType) {
        // Base revenue projections by business type
        const baseProjections = {
            'restaurant': { min: 2000, max: 5000 },
            'home-services': { min: 3000, max: 8000 },
            'healthcare': { min: 5000, max: 15000 },
            'automotive': { min: 2500, max: 6000 },
            'retail': { min: 1500, max: 4000 },
            'professional-services': { min: 3000, max: 10000 }
        };

        const base = baseProjections[businessType] || baseProjections['retail'];
        
        // Adjust based on audit findings
        let multiplier = 1.0;
        
        // Performance issues increase potential
        if (auditResults.performance?.mobile?.loadTime > 5) multiplier += 0.3;
        if (auditResults.performance?.mobile?.loadTime > 8) multiplier += 0.5;
        
        // Mobile issues increase potential
        if (auditResults.mobile?.score < 50) multiplier += 0.4;
        
        // SEO issues increase potential
        if (auditResults.seo?.score < 60) multiplier += 0.3;
        
        // Conversion issues increase potential significantly
        if (!auditResults.conversion?.phoneVisible) multiplier += 0.4;
        if (!auditResults.conversion?.contactFormPresent) multiplier += 0.2;
        
        // Local SEO issues for local businesses
        if (['restaurant', 'home-services', 'healthcare', 'automotive'].includes(businessType)) {
            if (auditResults.local?.score < 50) multiplier += 0.5;
        }

        return {
            min: Math.round(base.min * multiplier),
            max: Math.round(base.max * multiplier)
        };
    }

    categorizeIssues(results) {
        // Critical issues (immediate revenue impact)
        if (results.performance?.mobile?.loadTime > 8) {
            results.issues.critical.push({
                title: 'Extremely Slow Mobile Loading',
                impact: 'High',
                description: `Your website takes ${results.performance.mobile.loadTime.toFixed(1)} seconds to load on mobile. Most users abandon sites that take longer than 3 seconds.`,
                solution: 'Optimize images, enable compression, and improve server response time'
            });
        }

        if (!results.conversion?.phoneVisible) {
            results.issues.critical.push({
                title: 'Phone Number Not Visible',
                impact: 'High',
                description: 'Customers cannot easily find your phone number to call you.',
                solution: 'Add a prominent phone number in the header and footer with click-to-call functionality'
            });
        }

        if (results.mobile?.score < 40) {
            results.issues.critical.push({
                title: 'Mobile Website Unusable',
                impact: 'High',
                description: 'Your website is difficult or impossible to use on mobile devices.',
                solution: 'Implement responsive design and fix mobile usability issues'
            });
        }

        // High priority issues
        if (results.seo?.issues?.missingTitle || results.seo?.issues?.missingMetaDescription) {
            results.issues.high.push({
                title: 'Missing SEO Basics',
                impact: 'Medium',
                description: 'Your pages are missing essential SEO elements that help Google understand your business.',
                solution: 'Add proper page titles and meta descriptions to all pages'
            });
        }

        if (results.performance?.mobile?.loadTime > 5 && results.performance?.mobile?.loadTime <= 8) {
            results.issues.high.push({
                title: 'Slow Mobile Loading',
                impact: 'Medium',
                description: `Your mobile loading time of ${results.performance.mobile.loadTime.toFixed(1)} seconds is slower than 87% of websites.`,
                solution: 'Optimize images and enable caching to improve load times'
            });
        }

        if (results.local?.score < 50) {
            results.issues.high.push({
                title: 'Poor Local SEO Setup',
                impact: 'Medium',
                description: 'Local customers may have trouble finding you in Google searches.',
                solution: 'Optimize for local search and claim your Google My Business listing'
            });
        }

        // Medium priority issues
        if (!results.conversion?.contactFormPresent) {
            results.issues.medium.push({
                title: 'No Contact Form',
                impact: 'Low',
                description: 'Visitors have limited ways to contact you beyond phone calls.',
                solution: 'Add a contact form to capture more leads'
            });
        }

        if (results.seo?.issues?.missingAltTags > 0) {
            results.issues.medium.push({
                title: 'Missing Image Alt Tags',
                impact: 'Low',
                description: `${results.seo.issues.missingAltTags} images are missing alt tags, hurting SEO.`,
                solution: 'Add descriptive alt tags to all images'
            });
        }
    }

    generateLocalSEORecommendations(localData) {
        const recommendations = [];
        
        if (!localData.contactInfo.phone) {
            recommendations.push('Add your phone number prominently on every page');
        }
        
        if (!localData.contactInfo.address) {
            recommendations.push('Display your business address clearly on your website');
        }
        
        if (localData.localKeywords.length < 3) {
            recommendations.push('Include more local keywords relevant to your business');
        }
        
        if (!localData.structuredData) {
            recommendations.push('Add structured data markup for better local search visibility');
        }
        
        return recommendations;
    }

    generateConversionRecommendations(conversionData, businessType) {
        const recommendations = [];
        
        if (conversionData.phoneNumbers.length === 0) {
            recommendations.push('Add a prominent phone number with click-to-call functionality');
        }
        
        if (conversionData.contactForms === 0) {
            recommendations.push('Add a contact form to capture leads who prefer not to call');
        }
        
        if (conversionData.ctaButtons < 3) {
            recommendations.push('Add more clear call-to-action buttons throughout your site');
        }
        
        const businessSpecificCTAs = {
            'restaurant': 'Add "Make Reservation" and "Order Online" buttons',
            'home-services': 'Add "Get Free Quote" and "Schedule Service" buttons',
            'healthcare': 'Add "Book Appointment" and "Contact Us" buttons',
            'automotive': 'Add "Schedule Service" and "Get Quote" buttons'
        };
        
        if (businessSpecificCTAs[businessType]) {
            recommendations.push(businessSpecificCTAs[businessType]);
        }
        
        if (Object.values(conversionData.socialProof).every(count => count === 0)) {
            recommendations.push('Add customer testimonials and reviews to build trust');
        }
        
        return recommendations;
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}

module.exports = AuditEngine;