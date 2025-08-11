// Okha.ai Audit Form Integration Script
// This script connects the existing audit form on your website to the automated CRM system

(function() {
    'use strict';
    
    // Configuration
    const CONFIG = {
        API_BASE_URL: 'http://localhost:3001/api', // Change to your production URL
        FORM_ID: 'auditForm',
        SUBMIT_ENDPOINT: '/audit/submit',
        TRACKING_ENDPOINT: '/tracking',
        DEBUG: true
    };

    // Utility functions
    function log(message, data = null) {
        if (CONFIG.DEBUG) {
            console.log('[Okha.ai Integration]', message, data);
        }
    }

    function showMessage(element, message, type = 'success') {
        if (!element) return;
        
        element.innerHTML = message;
        element.className = type === 'success' ? 'success-message' : 'error-message';
        element.style.display = 'block';
        
        if (type === 'success') {
            setTimeout(() => {
                element.style.display = 'none';
            }, 5000);
        }
    }

    function showLoading(show = true) {
        const loadingElement = document.querySelector('.loading');
        const submitButton = document.querySelector('#auditForm button[type="submit"]');
        
        if (loadingElement) {
            loadingElement.style.display = show ? 'block' : 'none';
        }
        
        if (submitButton) {
            submitButton.disabled = show;
            submitButton.textContent = show ? 'Analyzing...' : 'Get My Free Audit';
        }
    }

    // Enhanced form validation
    function validateForm(formData) {
        const errors = [];
        
        // Required fields validation
        const requiredFields = {
            businessName: 'Business Name',
            website: 'Website URL',
            firstName: 'First Name', 
            lastName: 'Last Name',
            email: 'Email Address',
            businessType: 'Business Type',
            mainGoal: 'Main Goal'
        };
        
        Object.keys(requiredFields).forEach(field => {
            if (!formData[field] || formData[field].trim() === '') {
                errors.push(`${requiredFields[field]} is required`);
            }
        });
        
        // Email validation
        if (formData.email && !isValidEmail(formData.email)) {
            errors.push('Please enter a valid email address');
        }
        
        // Website URL validation
        if (formData.website && !isValidURL(formData.website)) {
            errors.push('Please enter a valid website URL');
        }
        
        return errors;
    }

    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    function isValidURL(url) {
        try {
            new URL(url.startsWith('http') ? url : 'https://' + url);
            return true;
        } catch {
            return false;
        }
    }

    function normalizeURL(url) {
        if (!url) return url;
        
        // Add https:// if no protocol specified
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        
        // Remove trailing slash
        return url.replace(/\/$/, '');
    }

    // Form submission handler
    async function handleFormSubmission(event) {
        event.preventDefault();
        log('Form submission started');
        
        const form = event.target;
        const errorElement = document.querySelector('.error-message');
        const successElement = document.querySelector('.success-message');
        
        // Clear previous messages
        if (errorElement) errorElement.style.display = 'none';
        if (successElement) successElement.style.display = 'none';
        
        // Collect form data
        const formData = {
            businessName: form.businessName.value.trim(),
            website: normalizeURL(form.website.value.trim()),
            firstName: form.firstName.value.trim(),
            lastName: form.lastName.value.trim(),
            email: form.email.value.trim().toLowerCase(),
            phone: form.phone ? form.phone.value.trim() : '',
            businessType: form.businessType.value,
            mainGoal: form.mainGoal.value,
            currentProblem: form.currentProblem ? form.currentProblem.value.trim() : '',
            monthlyVisitors: form.monthlyVisitors ? form.monthlyVisitors.value : ''
        };
        
        log('Form data collected', formData);
        
        // Validate form
        const validationErrors = validateForm(formData);
        if (validationErrors.length > 0) {
            showMessage(errorElement, validationErrors.join('<br>'), 'error');
            return;
        }
        
        // Show loading state
        showLoading(true);
        
        try {
            // Submit to CRM system
            const response = await fetch(CONFIG.API_BASE_URL + CONFIG.SUBMIT_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(formData)
            });
            
            const result = await response.json();
            log('Submission response', result);
            
            if (response.ok && result.success) {
                // Success - show confirmation and track
                const successMessage = `
                    <strong>🎉 Your website audit has started!</strong><br>
                    <p>We're analyzing ${formData.businessName}'s website right now. You'll receive a detailed report at ${formData.email} within ${result.estimatedTime}.</p>
                    <p><small>Lead ID: ${result.leadId}</small></p>
                `;
                
                showMessage(successElement, successMessage, 'success');
                
                // Track conversion
                trackEvent('audit_submitted', {
                    business_type: formData.businessType,
                    lead_id: result.leadId
                });
                
                // Reset form
                form.reset();
                
                // Scroll to success message
                if (successElement) {
                    successElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                
                // Optional: Redirect to thank you page
                setTimeout(() => {
                    if (window.location.pathname.includes('/es/')) {
                        window.location.href = '/es/thank-you.html';
                    } else {
                        window.location.href = '/thank-you.html';
                    }
                }, 3000);
                
            } else {
                // Handle API errors
                const errorMessage = result.error || 'An error occurred. Please try again.';
                showMessage(errorElement, `❌ ${errorMessage}`, 'error');
                
                trackEvent('audit_submission_error', {
                    error: errorMessage,
                    business_name: formData.businessName
                });
            }
            
        } catch (error) {
            log('Submission error', error);
            
            // Handle network errors
            showMessage(errorElement, '❌ Network error. Please check your connection and try again.', 'error');
            
            trackEvent('audit_submission_network_error', {
                error: error.message,
                business_name: formData.businessName
            });
            
        } finally {
            showLoading(false);
        }
    }

    // Event tracking for analytics
    function trackEvent(eventName, data = {}) {
        log('Tracking event', { eventName, data });
        
        // Google Analytics 4 tracking
        if (typeof gtag !== 'undefined') {
            gtag('event', eventName, {
                custom_parameter_1: data.business_type || '',
                custom_parameter_2: data.lead_id || '',
                value: 1
            });
        }
        
        // Facebook Pixel tracking
        if (typeof fbq !== 'undefined') {
            fbq('track', 'Lead', {
                content_category: data.business_type || '',
                custom_parameter: data.lead_id || ''
            });
        }
        
        // Send to our tracking endpoint
        fetch(CONFIG.API_BASE_URL + CONFIG.TRACKING_ENDPOINT + '/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event: eventName,
                data: data,
                timestamp: new Date().toISOString(),
                url: window.location.href,
                referrer: document.referrer,
                user_agent: navigator.userAgent
            })
        }).catch(err => log('Tracking error', err));
    }

    // Enhanced UI improvements
    function enhanceFormUI() {
        const form = document.getElementById(CONFIG.FORM_ID);
        if (!form) return;
        
        // Add real-time validation
        const requiredFields = form.querySelectorAll('input[required], select[required]');
        requiredFields.forEach(field => {
            field.addEventListener('blur', function() {
                validateField(this);
            });
            
            field.addEventListener('input', function() {
                clearFieldError(this);
            });
        });
        
        // Add loading states to form fields
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.style.position = 'relative';
        }
        
        // Auto-format phone numbers
        const phoneField = form.querySelector('input[name="phone"]');
        if (phoneField) {
            phoneField.addEventListener('input', function(e) {
                let value = e.target.value.replace(/\D/g, '');
                if (value.length >= 6) {
                    value = value.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
                } else if (value.length >= 3) {
                    value = value.replace(/(\d{3})(\d{0,3})/, '($1) $2');
                }
                e.target.value = value;
            });
        }
        
        // Add website URL auto-correction
        const websiteField = form.querySelector('input[name="website"]');
        if (websiteField) {
            websiteField.addEventListener('blur', function() {
                if (this.value && !this.value.startsWith('http')) {
                    this.value = normalizeURL(this.value);
                }
            });
        }
    }

    function validateField(field) {
        const fieldContainer = field.closest('.form-group');
        if (!fieldContainer) return;
        
        // Remove existing error styling
        clearFieldError(field);
        
        // Validate required fields
        if (field.hasAttribute('required') && !field.value.trim()) {
            showFieldError(field, 'This field is required');
            return false;
        }
        
        // Validate email
        if (field.type === 'email' && field.value && !isValidEmail(field.value)) {
            showFieldError(field, 'Please enter a valid email address');
            return false;
        }
        
        // Validate URL
        if (field.name === 'website' && field.value && !isValidURL(field.value)) {
            showFieldError(field, 'Please enter a valid website URL');
            return false;
        }
        
        return true;
    }

    function showFieldError(field, message) {
        const fieldContainer = field.closest('.form-group');
        if (!fieldContainer) return;
        
        field.style.borderColor = '#e53e3e';
        
        let errorElement = fieldContainer.querySelector('.field-error');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.className = 'field-error';
            errorElement.style.cssText = 'color: #e53e3e; font-size: 0.8rem; margin-top: 0.25rem;';
            fieldContainer.appendChild(errorElement);
        }
        
        errorElement.textContent = message;
    }

    function clearFieldError(field) {
        const fieldContainer = field.closest('.form-group');
        if (!fieldContainer) return;
        
        field.style.borderColor = '';
        
        const errorElement = fieldContainer.querySelector('.field-error');
        if (errorElement) {
            errorElement.remove();
        }
    }

    // Progress indicator
    function addProgressIndicator() {
        const form = document.getElementById(CONFIG.FORM_ID);
        if (!form) return;
        
        const progressContainer = document.createElement('div');
        progressContainer.className = 'audit-progress';
        progressContainer.style.cssText = `
            display: none;
            background: #f0fff4;
            border: 1px solid #9ae6b4;
            border-radius: 0.5rem;
            padding: 1rem;
            margin: 1rem 0;
            text-align: center;
        `;
        
        progressContainer.innerHTML = `
            <div class="progress-steps">
                <div class="progress-step active">📝 Form Submitted</div>
                <div class="progress-step">🔍 Analyzing Website</div>
                <div class="progress-step">📊 Generating Report</div>
                <div class="progress-step">📧 Sending Results</div>
            </div>
            <div class="progress-message">Your audit is being processed...</div>
        `;
        
        form.appendChild(progressContainer);
    }

    // Initialize integration
    function init() {
        log('Initializing Okha.ai audit form integration');
        
        const form = document.getElementById(CONFIG.FORM_ID);
        if (!form) {
            log('Audit form not found. Integration disabled.');
            return;
        }
        
        // Attach form submission handler
        form.addEventListener('submit', handleFormSubmission);
        
        // Enhance UI
        enhanceFormUI();
        addProgressIndicator();
        
        // Track page view
        trackEvent('audit_page_view', {
            page: window.location.pathname,
            language: document.documentElement.lang || 'en'
        });
        
        log('Integration initialized successfully');
    }

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose public API
    window.OkhaAuditIntegration = {
        trackEvent: trackEvent,
        config: CONFIG
    };

})();