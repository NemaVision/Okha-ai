# Complete Vercel + Google Analytics Setup Guide for Okha.ai

This guide will help you deploy your Okha.ai website with automated audit functionality using Vercel's native features AND Google's free analytics tools.

## Prerequisites

1. A Vercel account (sign up at [vercel.com](https://vercel.com))
2. A Google account for Analytics and APIs
3. Node.js 18+ installed locally
4. Git repository with your code

## 1. Deploy to Vercel

### Option A: Deploy via Vercel Dashboard
1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click "New Project"
3. Import your Git repository
4. Vercel will automatically detect it's a static site

### Option B: Deploy via CLI
```bash
npm install -g vercel
vercel login
vercel --prod
```

## 2. Set Up Google Analytics & APIs

### Google Analytics 4 Setup
1. Go to [Google Analytics](https://analytics.google.com)
2. Create a new GA4 property for your website
3. Get your Measurement ID (starts with G-XXXXXXXXXX)
4. Replace `GA_MEASUREMENT_ID` in your `index.html` with your actual ID

### Google Search Console Setup
1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add your website as a property
3. Choose "HTML tag" verification method
4. Copy the verification code and replace `GOOGLE_SEARCH_CONSOLE_VERIFICATION_CODE` in your HTML

### Google APIs Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing one
3. Enable these APIs:
   - PageSpeed Insights API
   - Search Console API (for Mobile-Friendly Test)
4. Create an API key and restrict it to these APIs
5. Save the API key for environment variables

## 3. Set Up Vercel Storage

### Vercel KV Database
1. In your Vercel dashboard, go to your project
2. Go to the "Storage" tab
3. Click "Create Database" → "KV"
4. Name it "okha-leads" 
5. Copy the environment variables provided

### Vercel Blob Storage  
1. In the same Storage tab
2. Click "Create Database" → "Blob"
3. Name it "okha-reports"
4. Copy the Blob token for environment variables

## 4. Configure Environment Variables

In your Vercel project dashboard:

1. Go to "Settings" → "Environment Variables"
2. Add these variables:

### Required Storage Variables:
```
KV_URL=your_vercel_kv_url
KV_REST_API_URL=your_vercel_kv_rest_api_url  
KV_REST_API_TOKEN=your_vercel_kv_rest_api_token
KV_REST_API_READ_ONLY_TOKEN=your_vercel_kv_read_only_token
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token
```

### Google Analytics & APIs:
```
GOOGLE_ANALYTICS_MEASUREMENT_ID=G-XXXXXXXXXX
GOOGLE_PAGESPEED_API_KEY=your_google_pagespeed_api_key
GOOGLE_SEARCH_CONSOLE_VERIFICATION=your_search_console_verification_code
```

### Email Setup (Resend recommended):
```
RESEND_API_KEY=your_resend_api_key
FROM_EMAIL=hello@okha.ai
```

### Admin Access:
```
ADMIN_PASSWORD=your_secure_admin_password
CRON_SECRET=your_random_secret_key
```

### Auto-configured by Vercel:
```
VERCEL_URL=your_deployed_url
```

## 4. Set Up Email Service (Resend)

1. Sign up at [resend.com](https://resend.com)
2. Verify your domain or use their testing domain
3. Create an API key
4. Add the API key to your Vercel environment variables

## 5. Enable Vercel Analytics (Optional)

1. In your Vercel dashboard, go to your project
2. Go to "Analytics" tab  
3. Enable "Vercel Analytics"
4. The code is already integrated in your `index.html`

## 6. Test the Setup

1. Visit your deployed website
2. Fill out the audit form
3. Check the admin dashboard at `yoursite.com/admin.html`
4. Monitor the Vercel Functions logs in your dashboard

## 7. Admin Dashboard Access

- URL: `https://yoursite.com/admin.html`
- Username: `admin`
- Password: The one you set in `ADMIN_PASSWORD`

## 8. Automated Processing

The system automatically:
- Processes form submissions
- Runs website audits
- Sends email reports
- Stores lead data

Cron job runs every 5 minutes to process queues.

## File Structure

```
/api/
  ├── submit-audit.js       # Handles form submissions
  ├── process-audit.js      # Runs website audits  
  ├── send-email.js         # Sends email reports
  ├── process-queues.js     # Cron job for queue processing
  └── admin/
      └── dashboard.js      # Admin dashboard API

/
  ├── index.html           # Main website
  ├── admin.html           # Admin dashboard
  ├── script.js            # Frontend JavaScript
  ├── vercel.json          # Vercel configuration
  └── package.json         # Dependencies
```

## Monitoring

- **Vercel Dashboard**: Monitor function executions, errors, and performance
- **Admin Dashboard**: View leads, audit results, and email status
- **KV Database**: All data stored in Vercel KV for reliability

## Troubleshooting

### Common Issues:

1. **Form submissions not working**
   - Check Vercel Functions logs
   - Verify KV environment variables

2. **Emails not sending**
   - Check email service API key
   - Verify FROM_EMAIL domain

3. **Admin dashboard not loading**
   - Check ADMIN_PASSWORD environment variable
   - Try refreshing credentials

4. **Cron jobs not running**
   - Verify CRON_SECRET is set
   - Check function logs for errors

### Support

- Check Vercel Functions logs in your dashboard
- Review the `/api/admin/dashboard` endpoint for system status
- All errors are logged in Vercel's function logs

## Cost Considerations

**Vercel Free Tier Includes:**
- 100GB bandwidth
- 100 serverless function executions per day
- 1 KV database with 30K read/write operations
- Custom domains

**Estimated Monthly Costs (beyond free tier):**
- Moderate traffic (500 leads/month): ~$0-20
- High traffic (2000+ leads/month): ~$20-50

The system is designed to be cost-effective for small businesses.